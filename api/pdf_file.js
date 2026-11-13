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
const gdriveService = require('./gdrive_service');
const { authorizeDocRead } = require('./pdf_rpc');

const RANGE_RE = /^bytes=(\d*)-(\d*)$/;

module.exports = async function pdfFile(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const sendErr = (code, msg) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, data: null, error: msg }));
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendErr(405, 'Chỉ nhận GET');

  let docId = '';
  try { docId = new URL(req.url || '/', 'http://x').searchParams.get('doc') || ''; } catch (_) { docId = ''; }

  let auth;
  try {
    auth = await authorizeDocRead(req, docId);
  } catch (err) {
    console.error('pdf_file auth error:', err);
    return sendErr(500, 'Lỗi máy chủ');
  }
  if (auth.status !== 200) return sendErr(auth.status, auth.error);
  const { doc } = auth;
  if (!doc.drive_file_id) return sendErr(404, 'Tài liệu chưa có file trên Drive.');

  const range = String(req.headers.range || '');
  if (range && !RANGE_RE.test(range)) return sendErr(416, 'Range không hợp lệ');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 290000);
  res.on('close', () => controller.abort());
  try {
    const token = await gdriveService.getAccessToken();
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
