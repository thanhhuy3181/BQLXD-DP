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
    const token = await gdriveService.getAccessToken();
    const up = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(meta.file_id) + '?alt=media&supportsAllDrives=true',
      { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(60000) });
    if (!up.ok || !up.body) return sendErr(up.status === 404 ? 404 : 502, 'Không tải được ảnh xem trước');
    res.statusCode = 200;
    res.setHeader('Content-Type', meta.mime || 'image/webp');
    res.setHeader('Cache-Control', 'private, max-age=604800'); // đường dẫn có kèm phiên bản file
    const len = up.headers.get('content-length'); if (len) res.setHeader('Content-Length', len);
    if (req.method === 'HEAD') return res.end();
    await pipeline(Readable.fromWeb(up.body), res);
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
    const upstream = await fetch(
      sp.get('via') === 'uc' // thử đường tải khác của Google để so tốc độ
        ? 'https://drive.usercontent.google.com/download?id=' + encodeURIComponent(doc.drive_file_id) + '&export=download&confirm=t'
        : 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(doc.drive_file_id) + '?alt=media&supportsAllDrives=true',
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
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (err) {
    if (!res.headersSent) return sendErr(502, 'Lỗi tải file: ' + (err.message || err));
    res.destroy(err);
  } finally {
    clearTimeout(timer);
  }
};
