'use strict';
/**
 * GET /api/pdf_file?doc=<doc_id>
 * Header bắt buộc: Authorization: Bearer <session_token>  (không nhận token qua URL).
 * Hỗ trợ Range (bytes=a-b) để pdf.js tải theo khúc.
 *
 * Vì sao stream: Vercel giới hạn thân phản hồi 4,5 MB nhưng "The response body limit
 * doesn't apply to streamed responses" (vercel.com/docs/functions/limitations).
 * Máy chủ đọc file từ Drive bằng token phía máy chủ và đẩy thẳng ra trình duyệt;
 * trình duyệt không bao giờ nhận token Drive hay drive_file_id.
 */
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const gdriveService = require('./_gdrive_service');
const { authorizeDocRead, previewList, previewMeta, previewSave } = require('./pdf_rpc');

const RANGE_RE = /^bytes=(\d*)-(\d*)$/;
const fsp = require('fs');
const pathMod = require('path');
const osMod = require('os');

/* Bộ nhớ tạm của máy chủ (/tmp, miễn phí, mất khi máy chủ nghỉ): Google Drive trả file lớn rất chậm
   (~13–20 giây mới có byte đầu với file 30 MB). Lần tải đầu vừa gửi cho người dùng vừa ghi vào /tmp;
   những lần sau trên cùng máy chủ đang chạy thì đọc thẳng từ đĩa (gần như tức thì). Khoá theo
   md5/thời điểm sửa của file trên Drive nên file bị thay là tự lấy bản mới. */
const TMP_DIR = pathMod.join(osMod.tmpdir(), 'qlda-pdf-cache');
const TMP_MAX_BYTES = 380 * 1024 * 1024;
function tmpPathFor(driveId, ver) {
  return pathMod.join(TMP_DIR, String(driveId).replace(/[^A-Za-z0-9_-]/g, '_') + '-' + String(ver).replace(/[^A-Za-z0-9_-]/g, '_') + '.pdf');
}
function tmpEvict(keepBytes) {
  try {
    const items = fsp.readdirSync(TMP_DIR).map(n => { const p = pathMod.join(TMP_DIR, n); const st = fsp.statSync(p); return { p, size: st.size, t: st.atimeMs || st.mtimeMs }; });
    let total = items.reduce((a, b) => a + b.size, 0) + keepBytes;
    items.sort((a, b) => a.t - b.t);
    for (const it of items) { if (total <= TMP_MAX_BYTES) break; try { fsp.unlinkSync(it.p); total -= it.size; } catch (_) {} }
  } catch (_) {}
}
const PV_M_RE = /^[A-Za-z0-9:.+\-_ ]{0,64}$/;

/* Ảnh xem trước dùng chung của bản vẽ nặng:
   GET  ?doc=X&previews=1               -> { pages: { "1": { m, w, h } } }
   GET  ?doc=X&preview=<trang>&m=<ver>  -> ảnh (404 nếu chưa có hoặc khác phiên bản file)
   PUT  ?doc=X&preview=<trang>&m=<ver>&w=&h=  thân = ảnh WEBP/JPEG/PNG ≤ 4 MB */
async function previewRoute(req, res, sp, doc, user, sendErr) {
  try {
    if (sp.get('previews') != null) {
      const pages = await previewList(doc.id);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ ok: true, data: { pages }, error: null }));
    }
    const page = Number(sp.get('preview'));
    const m = String(sp.get('m') || '');
    if (!Number.isInteger(page) || page < 1 || page > 5000 || !PV_M_RE.test(m)) return sendErr(400, 'Tham số ảnh xem trước không hợp lệ');
    if (req.method === 'PUT') {
      let buf;
      try {
        if (Buffer.isBuffer(req.body)) buf = req.body;
        else {
          const parts = []; let n = 0;
          for await (const c of req) { n += c.length; if (n > 4.2 * 1024 * 1024) return sendErr(413, 'Ảnh xem trước quá lớn.'); parts.push(c); }
          buf = Buffer.concat(parts);
        }
      } catch (_) { return sendErr(400, 'Không đọc được ảnh gửi lên'); }
      const w = Math.max(0, Math.min(20000, Number(sp.get('w')) || 0)), h = Math.max(0, Math.min(20000, Number(sp.get('h')) || 0));
      const r = await previewSave(doc, page, m, w, h, buf, user.username);
      if (r.status !== 200) return sendErr(r.status, r.error);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ ok: true, data: r.data, error: null }));
    }
    const meta = await previewMeta(doc.id, page);
    if (!meta || !meta.file_id || meta.m !== m) return sendErr(404, 'Chưa có ảnh xem trước cho phiên bản này');
    // Ảnh đã có trong /tmp của máy chủ đang chạy: trả ngay (Drive mất ~3 giây kể cả với ảnh nhỏ)
    const pvTmp = pathMod.join(TMP_DIR, 'pv-' + String(meta.file_id).replace(/[^A-Za-z0-9_-]/g, '_'));
    if (fsp.existsSync(pvTmp)) {
      const buf = fsp.readFileSync(pvTmp);
      res.statusCode = 200; res.setHeader('Content-Type', meta.mime || 'image/webp'); res.setHeader('Cache-Control', 'private, max-age=604800'); res.setHeader('Content-Length', String(buf.length));
      return res.end(req.method === 'HEAD' ? undefined : buf);
    }
    const token = await gdriveService.getAccessToken();
    const up = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(meta.file_id) + '?alt=media&supportsAllDrives=true',
      { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(60000) });
    if (!up.ok || !up.body) return sendErr(up.status === 404 ? 404 : 502, 'Không tải được ảnh xem trước');
    res.statusCode = 200;
    res.setHeader('Content-Type', meta.mime || 'image/webp');
    res.setHeader('Cache-Control', 'private, max-age=604800'); // đường dẫn có kèm phiên bản file
    const len = up.headers.get('content-length'); if (len) res.setHeader('Content-Length', len);
    if (req.method === 'HEAD') return res.end();
    const buf = Buffer.from(await up.arrayBuffer());
    try { fsp.mkdirSync(TMP_DIR, { recursive: true }); fsp.writeFileSync(pvTmp, buf); } catch (_) {}
    res.setHeader('Content-Length', String(buf.length));
    return res.end(buf);
  } catch (err) {
    console.error('preview error:', err);
    if (!res.headersSent) return sendErr(502, 'Lỗi ảnh xem trước: ' + (err.message || err));
    res.destroy(err);
  }
}

module.exports = async function pdfFile(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const sendErr = (code, msg) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, data: null, error: msg }));
  };
  let docId = '', sp = new URLSearchParams();
  try { sp = new URL(req.url || '/', 'http://x').searchParams; docId = sp.get('doc') || ''; } catch (_) { docId = ''; }
  const pvPage = sp.get('preview');
  const isPreview = pvPage != null || sp.get('previews') != null;
  if (!(req.method === 'GET' || req.method === 'HEAD' || (isPreview && req.method === 'PUT'))) return sendErr(405, 'Chỉ nhận GET');

  const T0 = Date.now(); const tm = []; // Server-Timing: đo từng bước để tìm chỗ chậm
  let auth;
  try {
    auth = await authorizeDocRead(req, docId);
    tm.push('auth;dur=' + (Date.now() - T0));
  } catch (err) {
    console.error('pdf_file auth error:', err);
    return sendErr(500, 'Lỗi máy chủ');
  }
  if (auth.status !== 200) return sendErr(auth.status, auth.error);
  const { doc } = auth;
  if (isPreview) return previewRoute(req, res, sp, doc, auth.user, sendErr);
  if (!doc.drive_file_id) return sendErr(404, 'Tài liệu chưa có file trên Drive.');

  const range = String(req.headers.range || '');
  if (range && !RANGE_RE.test(range)) return sendErr(416, 'Range không hợp lệ');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 290000);
  res.on('close', () => controller.abort());
  try {
    let t1 = Date.now();
    const token = await gdriveService.getAccessToken();
    tm.push('token;dur=' + (Date.now() - t1)); t1 = Date.now();
    // Phiên bản file trên Drive (nhanh, vài trăm ms) để dùng bản trong /tmp nếu có
    let ver = '', size = 0;
    try {
      const mr = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(doc.drive_file_id) + '?fields=md5Checksum,modifiedTime,size&supportsAllDrives=true',
        { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(8000) });
      if (mr.ok) { const mj = await mr.json(); ver = mj.md5Checksum || mj.modifiedTime || ''; size = Number(mj.size) || 0; }
    } catch (_) {}
    tm.push('meta;dur=' + (Date.now() - t1)); t1 = Date.now();
    const tmpFile = ver && size ? tmpPathFor(doc.drive_file_id, ver) : '';
    if (tmpFile && fsp.existsSync(tmpFile) && fsp.statSync(tmpFile).size === size) {
      let a = 0, b = size - 1, partial = false;
      const rm = range ? RANGE_RE.exec(range) : null;
      if (rm) {
        if (rm[1] === '' && rm[2] !== '') { a = Math.max(0, size - Number(rm[2])); }
        else { a = Number(rm[1] || 0); if (rm[2] !== '') b = Math.min(size - 1, Number(rm[2])); }
        if (a > b || a >= size) { res.setHeader('Content-Range', 'bytes */' + size); return sendErr(416, 'Range vượt kích thước file'); }
        partial = true;
      }
      tm.push('tmp;desc="bo nho tam may chu"');
      res.setHeader('Server-Timing', tm.join(', '));
      res.statusCode = partial ? 206 : 200;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', String(b - a + 1));
      if (partial) res.setHeader('Content-Range', 'bytes ' + a + '-' + b + '/' + size);
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(String(doc.title || 'tai-lieu.pdf'))}`);
      if (req.method === 'HEAD') return res.end();
      try { fsp.utimesSync(tmpFile, new Date(), fsp.statSync(tmpFile).mtime); } catch (_) {}
      await pipeline(fsp.createReadStream(tmpFile, { start: a, end: b }), res);
      return;
    }
    const upstream = await fetch(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(doc.drive_file_id) + '?alt=media&supportsAllDrives=true',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token, ...(range ? { Range: range } : {}) },
        signal: controller.signal
      }
    );
    if (!(upstream.status === 200 || upstream.status === 206)) {
      if (upstream.status === 416) return sendErr(416, 'Range vượt kích thước file');
      return sendErr(502, `Không tải được file từ Google Drive (HTTP ${upstream.status}).`);
    }
    tm.push('drive;dur=' + (Date.now() - t1));
    res.setHeader('Server-Timing', tm.join(', '));
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Accept-Ranges', 'bytes');
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);
    const cr = upstream.headers.get('content-range');
    if (cr) res.setHeader('Content-Range', cr);
    const safeName = encodeURIComponent(String(doc.title || 'tai-lieu.pdf'));
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${safeName}`);
    if (req.method === 'HEAD' || !upstream.body) {
      controller.abort();
      return res.end();
    }
    // Tải cả file (không Range): vừa gửi vừa ghi vào /tmp cho lần sau
    if (tmpFile && !range && upstream.status === 200 && size > 0 && size < TMP_MAX_BYTES) {
      const { Transform } = require('stream');
      let ws = null, ok = true;
      try { fsp.mkdirSync(TMP_DIR, { recursive: true }); tmpEvict(size); ws = fsp.createWriteStream(tmpFile + '.part'); ws.on('error', () => { ok = false; }); } catch (_) { ws = null; }
      const tee = new Transform({ transform(chunk, enc, cb) { if (ws && ok) ws.write(chunk); cb(null, chunk); } });
      try {
        await pipeline(Readable.fromWeb(upstream.body), tee, res);
      } finally {
        if (ws) {
          await new Promise(r => ws.end(r));
          try { if (ok && fsp.statSync(tmpFile + '.part').size === size) fsp.renameSync(tmpFile + '.part', tmpFile); else fsp.unlinkSync(tmpFile + '.part'); } catch (_) {}
        }
      }
      return;
    }
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (err) {
    if (!res.headersSent) return sendErr(502, 'Lỗi tải file: ' + (err.message || err));
    res.destroy(err);
  } finally {
    clearTimeout(timer);
  }
};
