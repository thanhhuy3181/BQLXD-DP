'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

const root = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch (e) {
    console.warn(`[dev-pdf] Không thể đọc file env ${filePath}:`, e.message);
  }
}

// 1. Tự động đọc file .env.local và .env trong thư mục gốc
loadEnvFile(path.join(root, '.env.local'));
loadEnvFile(path.join(root, '.env'));

// Nếu DATABASE_URL trỏ tới 127.0.0.1/localhost (TCP Postgres thuần), @neondatabase/serverless HTTP driver sẽ lỗi https://api.0.0.1/sql
for (const k of ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL']) {
  const v = process.env[k] || '';
  if (v && (v.includes('@127.0.0.1') || v.includes('@localhost'))) {
    console.log(`[dev-pdf] ${k} trỏ tới Postgres nội bộ (${v.replace(/:[^:@]+@/, ':***@')}); bỏ qua cho @neondatabase/serverless HTTP driver.`);
    delete process.env[k];
  }
}

// 2. Require các handler API SAU KHI đã gán biến môi trường
const handlers = {};
try {
  handlers['/api/pdf_rpc'] = require(path.join(root, 'api', 'pdf_rpc.js'));
} catch (e) {
  console.warn('[dev-pdf] Không nạp được /api/pdf_rpc:', e.message);
}
try {
  handlers['/api/rpc'] = require(path.join(root, 'api', 'rpc.js'));
} catch (e) {
  console.warn('[dev-pdf] Không nạp được /api/rpc:', e.message);
}
try {
  handlers['/api/ad_mail'] = require(path.join(root, 'api', 'ad_mail.js'));
} catch (e) {
  console.warn('[dev-pdf] Không nạp được /api/ad_mail:', e.message);
}

// TUYỆT ĐỐI chỉ dùng cổng 8790 (cổng 8767 đang được Tailscale Funnel đưa ra Internet, cấm dùng kể cả qua biến PORT)
const port = 8790;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
};

// ==========================================================================
// CSDL CỘNG TÁC GIẢ TRONG BỘ NHỚ (DEMO MODE & LOCAL DEV PORT 8790)
// ==========================================================================
const MEM_COLLAB = {
  docs: new Map() // docId -> { rev: 0, items: Map(id -> item), presence: Map(clientId -> presence) }
};

function getMemDoc(docId = 'tmb') {
  const dId = String(docId || 'tmb');
  if (!MEM_COLLAB.docs.has(dId)) {
    MEM_COLLAB.docs.set(dId, {
      rev: 0,
      items: new Map(),
      presence: new Map()
    });
  }
  return MEM_COLLAB.docs.get(dId);
}

function handleMemCollabRpc(action, payload, req, res) {
  const docId = payload.doc_id || 'tmb';
  const doc = getMemDoc(docId);
  const now = new Date().toISOString();
  const nowTs = Date.now();

  if (action === 'anno_upsert') {
    const applied = [];
    (payload.items || []).forEach(it => {
      if (!it || !it.id) return;
      doc.rev++;
      const existing = doc.items.get(it.id);
      const record = {
        id: it.id,
        page: it.page || 1,
        data: it.data || {},
        deleted: false,
        rev: doc.rev,
        created_by: existing?.created_by || 'Bạn (chạy thử)',
        updated_by: 'Bạn (chạy thử)',
        updated_at: now
      };
      doc.items.set(it.id, record);
      applied.push({ id: it.id, rev: doc.rev, updated_at: now });
    });
    return res.json({ ok: true, data: { applied, rejected: [] } });
  }

  if (action === 'anno_delete') {
    const deleted = [];
    (payload.ids || []).forEach(id => {
      const existing = doc.items.get(id);
      if (existing && !existing.deleted) {
        doc.rev++;
        existing.deleted = true;
        existing.rev = doc.rev;
        existing.updated_at = now;
        deleted.push({ id, rev: doc.rev, updated_at: now });
      }
    });
    return res.json({ ok: true, data: { deleted, skipped: [] } });
  }

  if (action === 'anno_changes') {
    const since = Number(payload.since) || 0;
    const limit = Math.min(1000, Number(payload.limit) || 500);
    const clientId = payload.client_id;

    if (clientId) {
      doc.presence.set(clientId, {
        username: clientId,
        fullname: 'Cộng tác viên ' + clientId.slice(-3).toUpperCase(),
        client_id: clientId,
        state: payload.state || { page: 1 },
        last_seen: now,
        _time: nowTs
      });
    }

    const activePresence = [];
    for (const [cid, p] of doc.presence.entries()) {
      if (nowTs - p._time > 30000) {
        doc.presence.delete(cid);
      } else {
        activePresence.push({
          username: p.username,
          fullname: p.fullname,
          client_id: p.client_id,
          state: p.state,
          last_seen: p.last_seen
        });
      }
    }

    const changedItems = [];
    for (const item of doc.items.values()) {
      if (since === 0) {
        if (!item.deleted) changedItems.push(item);
      } else {
        if (item.rev > since) changedItems.push(item);
      }
    }
    changedItems.sort((a, b) => a.rev - b.rev);
    const sliced = changedItems.slice(0, limit);
    const hasMore = changedItems.length > limit;

    return res.json({
      ok: true,
      data: {
        items: sliced,
        cursor: doc.rev,
        has_more: hasMore,
        my_role: 'Người sửa',
        presence: activePresence
      }
    });
  }

  if (action === 'presence_ping') {
    const clientId = payload.client_id;
    if (clientId) {
      doc.presence.set(clientId, {
        username: clientId,
        fullname: 'Cộng tác viên ' + clientId.slice(-3).toUpperCase(),
        client_id: clientId,
        state: payload.state || { page: 1 },
        last_seen: now,
        _time: nowTs
      });
    }
    const activePresence = [];
    for (const [cid, p] of doc.presence.entries()) {
      if (nowTs - p._time <= 30000) {
        activePresence.push({
          username: p.username,
          fullname: p.fullname,
          client_id: p.client_id,
          state: p.state,
          last_seen: p.last_seen
        });
      }
    }
    return res.json({ ok: true, data: { presence: activePresence, ttl_seconds: 30 } });
  }

  if (action === 'presence_leave') {
    if (payload.client_id) {
      doc.presence.delete(payload.client_id);
    }
    return res.json({ ok: true, data: { success: true } });
  }

  // Mốc 2: Chia sẻ, Xin quyền, Duyệt quyền và Upload
  return handleMemShareAndUpload(action, payload, doc, req, res);
}

const MEM_UPLOADS = new Map();

function handleMemShareAndUpload(action, payload, doc, req, res) {
  if (!doc.permissions) {
    doc.permissions = [
      { username: 'ban', fullname: 'Bạn', role: 'Chủ sở hữu' }
    ];
  }
  if (!doc.requests) {
    doc.requests = [];
  }

  if (action === 'doc_get') {
    return res.json({
      ok: true,
      data: {
        id: doc.id,
        title: 'TMB khu A-F (Demo)',
        owner_username: 'ban',
        my_role: 'Chủ sở hữu',
        permissions_json: JSON.stringify(doc.permissions)
      }
    });
  }

  if (action === 'doc_share') {
    if (Array.isArray(payload.permissions)) {
      doc.permissions = payload.permissions;
    }
    return res.json({
      ok: true,
      data: {
        success: true,
        permissions: doc.permissions
      }
    });
  }

  if (action === 'doc_request_access') {
    const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
    const item = {
      id: reqId,
      doc_id: payload.doc_id || doc.id,
      requester: payload.requester || 'dong_nghiep',
      requester_fullname: payload.requester_fullname || 'Đồng nghiệp',
      requested_role: payload.requested_role || 'Người xem',
      message: payload.message || payload.note || '',
      status: 'pending',
      created_at: new Date().toISOString()
    };
    doc.requests.push(item);
    return res.json({
      ok: true,
      data: {
        already: false,
        my_role: null,
        request: item
      }
    });
  }

  if (action === 'doc_access_requests') {
    const pending = doc.requests.filter(r => r.status === 'pending');
    return res.json({
      ok: true,
      data: {
        requests: pending
      }
    });
  }

  if (action === 'doc_access_decide') {
    const reqItem = doc.requests.find(r => r.id === payload.request_id);
    if (!reqItem) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy yêu cầu' });
    }
    const dec = payload.decision === 'approve' ? 'approved' : 'rejected';
    reqItem.status = dec;
    reqItem.decided_at = new Date().toISOString();
    if (dec === 'approved') {
      const assignedRole = payload.role || reqItem.requested_role || 'Người xem';
      reqItem.decided_role = assignedRole;
      const idx = doc.permissions.findIndex(p => p.username === reqItem.requester);
      if (idx !== -1) {
        doc.permissions[idx].role = assignedRole;
      } else {
        doc.permissions.push({
          username: reqItem.requester,
          fullname: reqItem.requester_fullname,
          role: assignedRole
        });
      }
    }
    return res.json({
      ok: true,
      data: {
        request: reqItem,
        permissions: doc.permissions
      }
    });
  }

  if (action === 'upload_begin') {
    const upId = 'up_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    MEM_UPLOADS.set(upId, {
      id: upId,
      name: payload.name || 'Tài liệu.pdf',
      size: payload.size || 0,
      received: 0,
      chunks: []
    });
    return res.json({
      ok: true,
      data: {
        upload_id: upId,
        upload_url: '/api/pdf_upload_chunk?upload_id=' + upId,
        chunk_size: 2097152, // 2MB chunk
        size: payload.size || 0
      }
    });
  }

  if (action === 'upload_status') {
    const up = MEM_UPLOADS.get(payload.upload_id);
    if (!up) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy phiên tải lên' });
    }
    return res.json({
      ok: true,
      data: {
        status: 'pending',
        complete: up.received >= up.size,
        received_bytes: up.received,
        size: up.size
      }
    });
  }

  if (action === 'upload_finish') {
    const up = MEM_UPLOADS.get(payload.upload_id);
    const newDocId = 'doc_' + Date.now();
    return res.json({
      ok: true,
      data: {
        complete: true,
        doc: {
          id: newDocId,
          title: up ? up.name : 'Tai-lieu.pdf',
          file_size: up ? up.size : 0,
          page_count: 1,
          has_file: true,
          my_role: 'Chủ sở hữu'
        }
      }
    });
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  // Gắn helper methods
  res.status = code => {
    res.statusCode = code;
    return res;
  };
  res.json = data => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  };

  const pathname = (req.url || '/').split('?')[0];

  // Routing nhận chunk tải lên từng khúc (/api/pdf_upload_chunk?upload_id=...)
  if (pathname === '/api/pdf_upload_chunk') {
    const parsedUrl = new URL(req.url, 'http://127.0.0.1:8790');
    const upId = parsedUrl.searchParams.get('upload_id');
    const up = MEM_UPLOADS.get(upId);
    if (!up) {
      return res.status(404).json({ ok: false, error: 'Phiên tải lên không tồn tại' });
    }
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      up.received += buf.length;
      if (up.received >= up.size) {
        res.status(200).json({ ok: true, received: up.received });
      } else {
        res.setHeader('Range', `bytes=0-${up.received - 1}`);
        res.status(308).json({ ok: true, status: 308, received: up.received });
      }
    });
    return;
  }

  // Routing stream file PDF thật (/api/pdf_file?doc=...)
  if (pathname === '/api/pdf_file') {
    const parsedUrl = new URL(req.url, 'http://127.0.0.1:8790');
    const docId = parsedUrl.searchParams.get('doc');
    if (!docId) {
      return res.status(400).json({ ok: false, error: 'Thiếu tham số doc' });
    }
    // File tài liệu tmb hoặc file thử nghiệm
    let filePath = path.resolve(root, '..', 'Phần mềm PDF', 'tmb_test.pdf');
    if (!fs.existsSync(filePath)) {
      filePath = path.resolve(root, '..', 'Phần mềm PDF', 'exported_test.pdf');
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy file tài liệu' });
    }
    const stat = fs.statSync(filePath);
    const range = req.headers.range;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Accept-Ranges', 'bytes');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      if (start >= stat.size || end >= stat.size) {
        res.setHeader('Content-Range', `bytes */${stat.size}`);
        return res.status(416).end();
      }
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', (end - start) + 1);
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', stat.size);
      res.statusCode = 200;
      fs.createReadStream(filePath).pipe(res);
    }
    return;
  }

  // Routing API
  if (handlers[pathname]) {
    let body = '';
    let tooLarge = false;
    const MAX_SIZE = 150 * 1024 * 1024; // 150 MB

    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_SIZE) {
        tooLarge = true;
        req.destroy();
      }
    });

    req.on('end', async () => {
      if (tooLarge) {
        return res.status(413).json({ ok: false, error: 'Kích thước yêu cầu vượt quá giới hạn cho phép (150MB)' });
      }
      try {
        req.body = body ? JSON.parse(body) : {};
      } catch (err) {
        return res.status(400).json({ ok: false, error: 'Dữ liệu JSON không hợp lệ' });
      }

      if (pathname === '/api/pdf_rpc') {
        const action = req.body?.action;
        const payload = req.body?.payload || {};
        const isCollabAction = [
          'anno_upsert', 'anno_delete', 'anno_changes', 'presence_ping', 'presence_leave',
          'doc_get', 'doc_share', 'doc_request_access', 'doc_access_requests', 'doc_access_decide',
          'upload_begin', 'upload_status', 'upload_finish'
        ].includes(action);
        const isDemo = !req.headers.authorization || req.headers.authorization === 'Bearer ' || payload.doc_id === 'tmb' || payload.doc_id === 'doc_demo_collab';
        if (isCollabAction && isDemo) {
          return handleMemCollabRpc(action, payload, req, res);
        }
      }

      try {
        await handlers[pathname](req, res);
      } catch (err) {
        console.error(`[dev-pdf] Lỗi xử lý ${pathname}:`, err);
        if (!res.writableEnded) {
          res.status(500).json({ ok: false, error: err.message || 'Lỗi máy chủ nội bộ' });
        }
      }
    });
    return;
  }

  // Routing tĩnh
  let target;
  try {
    target = path.resolve(root, '.' + decodeURIComponent(pathname));
  } catch (err) {
    res.statusCode = 400;
    res.end();
    return;
  }

  // Phải nằm trong root
  if (!target.startsWith(root + path.sep)) {
    if (target === root) {
      target = path.join(root, 'index.html');
    } else {
      res.statusCode = 403;
      res.end();
      return;
    }
  }

  const relative = path.relative(root, target);

  // Chặn truy cập mọi file nhạy cảm: .env*, .git*, mail_snapshot.json, api/, node_modules/, scripts/, *.cjs, package.json, pnpm-lock.yaml
  const parts = relative.split(path.sep);
  const isHidden = parts.some(p => p.startsWith('.'));
  const isSensitive =
    isHidden ||
    path.basename(target) === 'mail_snapshot.json' ||
    relative.startsWith('api' + path.sep) ||
    relative === 'api' ||
    relative.startsWith('node_modules' + path.sep) ||
    relative === 'node_modules' ||
    relative.startsWith('scripts' + path.sep) ||
    relative === 'scripts' ||
    relative.endsWith('.cjs') ||
    relative.endsWith('package.json') ||
    relative.endsWith('pnpm-lock.yaml');

  if (isSensitive) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  // Xử lý thư mục (ví dụ /pdf hoặc /pdf/) tự động trỏ tới index.html
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, 'index.html');
  }

  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  const ext = path.extname(target).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  fs.createReadStream(target).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`PDF QLDA Dev Server: http://127.0.0.1:${port}/pdf/`);
});
