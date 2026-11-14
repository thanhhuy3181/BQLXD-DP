'use strict';
/**
 * Kiểm thử api/pdf_rpc.js (và api/pdf_file.js) với CSDL giả trong bộ nhớ.
 * Không kết nối CSDL thật, không gọi Google: fetch toàn cục bị thay bằng bản giả,
 * mọi URL lạ đều ném lỗi.
 *
 * Chạy: node scripts/test-pdf-rpc.cjs
 */
const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');

// Không để biến môi trường thật lọt vào test.
for (const k of ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'VERCEL']) delete process.env[k];
process.env.GOOGLE_CLIENT_ID = 'test-client';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
process.env.GOOGLE_REFRESH_TOKEN = 'test-refresh';

const root = path.resolve(__dirname, '..');
const os = require('os');
const { sqlLocal, resetLocal } = require(path.join(root, 'api', '_d1sql.js'));
const { CORE_SCHEMA_STATEMENTS, COLLAB_SCHEMA_STATEMENTS } = require(path.join(root, 'api', '_pdf_schema.js'));

/* ---------- Google giả ---------- */
const fakeDrive = { files: new Map(), sessions: new Map(), calls: [] };
let nextFile = 1;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = (opts.method || 'GET').toUpperCase();
  const h = opts.headers || {};
  fakeDrive.calls.push(method + ' ' + u.split('?')[0]);
  const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  if (u === 'https://oauth2.googleapis.com/token') return json(200, { access_token: 'fake-drive-token', expires_in: 3600 });
  if (!String(h.Authorization || '').includes('fake-drive-token') && !u.startsWith('https://upload.fake/')) throw new Error('Gọi Google không có token giả: ' + u);
  if (u.startsWith('https://www.googleapis.com/drive/v3/files?') && method === 'GET') return json(200, { files: [] });
  if (u.startsWith('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true') && method === 'POST') {
    return json(200, { id: 'folder_' + JSON.parse(opts.body).name });
  }
  if (u.startsWith('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable') && method === 'POST') {
    const meta = JSON.parse(opts.body);
    const sid = 's' + (nextFile++);
    fakeDrive.sessions.set(sid, { meta, size: Number(h['X-Upload-Content-Length']), origin: h.Origin, received: 0, fileId: null });
    return new Response(null, { status: 200, headers: { location: 'https://upload.fake/' + sid } });
  }
  if (u.startsWith('https://upload.fake/')) {
    const s = fakeDrive.sessions.get(u.slice('https://upload.fake/'.length));
    if (!s) return json(404, {});
    if (method === 'DELETE') { fakeDrive.sessions.delete(u.slice(20)); return new Response(null, { status: 499 }); }
    if (s.fileId) return json(200, { id: s.fileId, name: s.meta.name });
    return new Response(null, { status: 308, headers: s.received ? { range: 'bytes=0-' + (s.received - 1) } : {} });
  }
  const m = /^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?/]+)\?(.*)$/.exec(u);
  if (m) {
    const f = fakeDrive.files.get(decodeURIComponent(m[1]));
    if (!f) return json(404, { error: { message: 'not found' } });
    if (method === 'PATCH') { f.trashed = true; return json(200, {}); }
    if (m[2].includes('alt=media')) {
      const r = /bytes=(\d*)-(\d*)/.exec(h.Range || '');
      const a = r ? Number(r[1] || 0) : 0;
      const b = r && r[2] ? Math.min(Number(r[2]), f.bytes.length - 1) : f.bytes.length - 1;
      const part = f.bytes.subarray(a, b + 1);
      return new Response(part, { status: r ? 206 : 200, headers: { 'content-length': String(part.length), ...(r ? { 'content-range': `bytes ${a}-${b}/${f.bytes.length}` } : {}) } });
    }
    return json(200, { id: f.id, name: f.name, size: String(f.bytes.length), mimeType: 'application/pdf', parents: f.parents, trashed: !!f.trashed, appProperties: f.appProperties });
  }
  throw new Error('fetch giả: URL không được phép ' + u);
};
// "Trình duyệt" gửi xong các khúc tới Google.
function browserCompletesUpload(uploadUrl, bytes, overrideAppProps) {
  const s = fakeDrive.sessions.get(uploadUrl.slice('https://upload.fake/'.length));
  const id = 'drivefile_' + (nextFile++) + '_abcdefgh';
  fakeDrive.files.set(id, { id, name: s.meta.name, bytes, parents: s.meta.parents, appProperties: overrideAppProps || s.meta.appProperties });
  s.received = bytes.length;
  s.fileId = id;
  return id;
}

/* ---------- CSDL giả + handler ---------- */
const rpc = require(path.join(root, 'api', 'pdf_rpc.js'));
const pdfFile = require(path.join(root, 'api', 'pdf_file.js'));
const USERS = {
  admin: 'Admin', an: 'CBGS', binh: 'CBGS', chi: 'CBGS', dung: 'CBGS', em: 'CBGS', giang: 'CBGS'
};
// CSDL thật: SQLite trong một file tạm riêng cho mỗi lần reset. logged ghi lại mọi câu SQL đã chạy.
let db;
let logged = [];
let dbFile = null;
let dbSeq = 0;
async function resetDb() {
  if (dbFile) { resetLocal(dbFile); try { fs.rmSync(dbFile, { force: true }); } catch (_) { /* bỏ qua */ } }
  dbFile = path.join(os.tmpdir(), `qlda-pdf-test-${process.pid}-${++dbSeq}.db`);
  const base = sqlLocal(dbFile);
  db = Object.assign((strings, ...values) => { logged.push(strings.join('?')); return base(strings, ...values); }, {
    raw: (q, p) => { logged.push(q); return base.raw(q, p); }
  });
  for (const s of CORE_SCHEMA_STATEMENTS.concat(COLLAB_SCHEMA_STATEMENTS)) await db.raw(s);
  for (const [u, role] of Object.entries(USERS)) {
    await db.raw('INSERT INTO bqlda_users (username,password_hash,status,data,updated_at) VALUES (?,?,?,?,?)',
      [u, 'x', 'Active', { fullname: u.toUpperCase(), role, email: u + '@x.vn' }, Date.now()]);
    await db.raw('INSERT INTO bqlda_sessions (token,username,expires_at) VALUES (?,?,?)', ['tok_' + u, u, Date.now() + 3600e3]);
  }
  await db.raw('INSERT INTO bqlda_sessions (token,username,expires_at) VALUES (?,?,?)', ['tok_expired', 'an', Date.now() - 1000]);
  await insertDoc({
    id: 'd1', title: 'Ban ve.pdf', drive_file_id: 'drv_secret_d1', folder_name: 'an', owner_username: 'an', file_size: 10, page_count: 3, scale_ratio: '1:100',
    permissions_json: [{ username: 'an', role: 'Chủ sở hữu' }, { username: 'binh', role: 'Người sửa' }, { username: 'chi', role: 'Người xem' }, { username: 'dung', role: 'Người nhận xét' }]
  });
  rpc.__setSqlFactoryForTests(() => db);
  logged = [];
}
async function insertDoc(d) {
  await db.raw('INSERT INTO bqlda_pdf_docs (id,title,drive_file_id,folder_name,owner_username,file_size,page_count,scale_ratio,permissions_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [d.id, d.title, d.drive_file_id, d.folder_name, d.owner_username, d.file_size, d.page_count, d.scale_ratio, d.permissions_json, Date.now()]);
}
async function setAnnoBlob(docId, annos, comments) {
  await db.raw('INSERT OR REPLACE INTO bqlda_pdf_annos (doc_id, annos_json, comments_json, updated_by, updated_at) VALUES (?,?,?,?,?)',
    [docId, annos, comments, 'an', Date.now()]);
}
const countRows = async q => (await db.raw(q))[0].n;
const docPerms = async id => (await db.raw('SELECT permissions_json FROM bqlda_pdf_docs WHERE id = ?', [id]))[0].permissions_json;

async function call(user, action, payload = {}, extraHeaders = {}) {
  const headers = { host: '127.0.0.1:8790', origin: 'http://127.0.0.1:8790', ...extraHeaders };
  if (user) headers.authorization = 'Bearer ' + (user.startsWith('tok_') ? user : 'tok_' + user);
  const req = { method: 'POST', headers, body: { action, payload } };
  const res = { statusCode: 200, headers: {}, body: undefined,
    status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end() { return this; } };
  await rpc(req, res);
  return { status: res.statusCode, body: res.body };
}

async function getFile(user, docId, range) {
  const headers = {};
  if (user) headers.authorization = 'Bearer tok_' + user;
  if (range) headers.range = range;
  const req = { method: 'GET', url: '/api/pdf_file?doc=' + encodeURIComponent(docId), headers };
  const res = new PassThrough();
  res.statusCode = 200; res.headersMap = {};
  res.setHeader = (k, v) => { res.headersMap[k.toLowerCase()] = v; };
  Object.defineProperty(res, 'headersSent', { get: () => false });
  const chunks = [];
  res.on('data', c => chunks.push(c));
  const done = new Promise(r => res.on('finish', r));
  await pdfFile(req, res);
  await done;
  const body = Buffer.concat(chunks);
  return { status: res.statusCode, headers: res.headersMap, body };
}

/* ---------- Khung test ---------- */
let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail) {
  if (cond) { pass++; results.push('  PASS ' + name); }
  else { fail++; results.push('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
const anno = (id, page, extra = {}) => ({ id, page, data: { type: 'rect', x: page * 10, y: 20, ...extra } });

(async () => {
  const src = fs.readFileSync(path.join(root, 'api', 'pdf_rpc.js'), 'utf8');

  // 1. Không đăng nhập -> 401 cho mọi action ngoài nhóm công khai
  console.log('1. Unauthenticated -> 401');
  await resetDb();
  const PUBLIC = ['auth_status', 'auth_login', 'login_user', 'auth_google', 'google_login'];
  const actions = new Set();
  for (const m of src.matchAll(/action === '([a-z_]+)'/g)) actions.add(m[1]);
  const collab = /const COLLAB_ACTIONS = \[([\s\S]*?)\];/.exec(src);
  for (const m of collab[1].matchAll(/'([a-z_]+)'/g)) actions.add(m[1]);
  actions.add('khong_ton_tai'); actions.add('');
  const nonPublic = [...actions].filter(a => !PUBLIC.includes(a));
  let bad401 = [];
  for (const a of nonPublic) {
    for (const who of [null, 'tok_khong_co', 'tok_expired']) {
      const r = await call(who, a, { doc_id: 'd1', items: [anno('x', 1)], username: 'an', role: 'Admin' });
      if (r.status !== 401) bad401.push({ a, who, status: r.status });
    }
  }
  check(`${nonPublic.length} action không công khai x 3 kiểu phiên (thiếu/sai/hết hạn) đều 401`, bad401.length === 0, bad401);
  const st = await call(null, 'auth_status');
  check('auth_status vẫn công khai (200, authenticated=false)', st.status === 200 && st.body.data.authenticated === false, st);
  const lockedSql = logged.filter(q => !/^(CREATE|INSERT OR IGNORE|DO )/.test(q) && !/bqlda_sessions/.test(q));
  check('không truy vấn dữ liệu nào trước khi xác thực', lockedSql.length === 0, lockedSql.slice(0, 5));

  // 2. Phân quyền ghi
  console.log('2. Role checks');
  await resetDb();
  let r = await call('chi', 'anno_upsert', { doc_id: 'd1', items: [anno('c1', 1)] });
  check('Người xem anno_upsert -> 403', r.status === 403, r);
  r = await call('chi', 'anno_delete', { doc_id: 'd1', ids: ['c1'] });
  check('Người xem anno_delete -> 403', r.status === 403, r);
  r = await call('chi', 'doc_save_annos', { doc_id: 'd1', annos: [], comments: [] });
  check('Người xem doc_save_annos (cũ) -> 403', r.status === 403, r);
  r = await call('dung', 'doc_save_annos', { doc_id: 'd1', annos: [], comments: [] });
  check('Người nhận xét doc_save_annos (ghi đè cả khối) -> 403', r.status === 403, r);
  r = await call('chi', 'anno_changes', { doc_id: 'd1', since: 0 });
  check('Người xem anno_changes -> 200', r.status === 200 && r.body.ok, r);
  r = await call('em', 'anno_changes', { doc_id: 'd1', since: 0 });
  check('Người không được chia sẻ anno_changes -> 403', r.status === 403, r);
  r = await call('em', 'doc_get', { doc_id: 'd1' });
  check('Người không được chia sẻ doc_get -> 403', r.status === 403, r);
  r = await call('an', 'users_update', { username: 'binh', role: 'Admin' });
  check('Tài khoản thường users_update -> 403', r.status === 403, r);
  r = await call('admin', 'users_update', { username: 'binh', role: 'Quản trị' });
  check('Admin không nâng được tài khoản khác lên Quản trị', r.status === 200 && r.body.ok === false, r.body);
  r = await call('admin', 'users_update', { username: 'binh', role: 'Thành viên' });
  check('Admin đặt vai trò Thành viên -> lưu thành CBGS', r.body.ok === true && r.body.data.role === 'CBGS', r.body);
  r = await call('binh', 'auth_login', { identifier: 'binh', password: 'x' });
  check('Thành viên đăng nhập bằng mật khẩu bị từ chối (phải dùng Google)', r.body.ok === false && /Google/.test(r.body.error), r.body);
  r = await call('binh', 'anno_upsert', { doc_id: 'd1', items: [anno('b1', 1)] });
  check('Người sửa anno_upsert -> 200 applied', r.status === 200 && r.body.data.applied.length === 1, r);
  r = await call('dung', 'anno_upsert', { doc_id: 'd1', items: [anno('d1a', 2), anno('b1', 1, { hacked: true })] });
  check('Người nhận xét: tạo ghi chú mới được, sửa ghi chú người khác bị từ chối',
    r.status === 200 && r.body.data.applied.map(a => a.id).join() === 'd1a' && r.body.data.rejected.join() === 'b1', r.body);
  r = await call('dung', 'anno_delete', { doc_id: 'd1', ids: ['b1', 'd1a'] });
  check('Người nhận xét: xoá ghi chú của mình được, của người khác bị bỏ qua',
    r.status === 200 && r.body.data.deleted.map(d => d.id).join() === 'd1a' && r.body.data.skipped.join() === 'b1', r.body);
  r = await call('binh', 'anno_upsert', { doc_id: 'd1', items: [{ id: 'bad id!', page: 1, data: {} }] });
  check('id không hợp lệ -> 400', r.status === 400, r);
  const list = await call('chi', 'drive_list');
  check('drive_list không trả drive_file_id', list.status === 200 && !JSON.stringify(list.body).includes('drv_secret_d1'), list.body);

  // 3. Hai người cùng ghi đồng thời không mất gì
  console.log('3. Concurrent upserts');
  await resetDb();
  const batches = [];
  for (let i = 0; i < 10; i++) {
    batches.push(call('an', 'anno_upsert', { doc_id: 'd1', items: Array.from({ length: 5 }, (_, k) => anno(`an_${i}_${k}`, 1 + (k % 3))) }));
    batches.push(call('binh', 'anno_upsert', { doc_id: 'd1', items: Array.from({ length: 5 }, (_, k) => anno(`binh_${i}_${k}`, 1 + (k % 3))) }));
  }
  const outs = await Promise.all(batches);
  check('20 lô đồng thời đều 200', outs.every(o => o.status === 200), outs.filter(o => o.status !== 200));
  r = await call('chi', 'anno_changes', { doc_id: 'd1', since: 0, limit: 1000 });
  const ids = new Set(r.body.data.items.map(i => i.id));
  check('đủ 100 ghi chú (50 của an + 50 của binh), không mất cái nào', ids.size === 100 && [...ids].filter(i => i.startsWith('an_')).length === 50, ids.size);
  const revs = r.body.data.items.map(i => i.rev);
  check('rev tăng nghiêm ngặt và duy nhất', revs.every((v, i) => i === 0 || v > revs[i - 1]), revs.slice(0, 10));
  // Đối chứng: cách cũ (đọc cả khối rồi ghi đè) mất dữ liệu khi hai người cùng sửa
  await resetDb();
  await setAnnoBlob('d1', '[]', '[]');
  const legacyEdit = async (user, id) => {
    const g = await call(user, 'doc_get', { doc_id: 'd1' });
    return call(user, 'doc_save_annos', { doc_id: 'd1', annos: [...g.body.data.annos, { id, page: 1 }], comments: [] });
  };
  await Promise.all([legacyEdit('an', 'L_an'), legacyEdit('binh', 'L_binh')]);
  const g = await call('an', 'doc_get', { doc_id: 'd1' });
  check('(đối chứng) doc_save_annos cũ mất ghi chú khi ghi đồng thời: còn ' + g.body.data.annos.length + '/2', g.body.data.annos.length < 2, g.body.data.annos);

  // 4. since chỉ trả thay đổi mới hơn; last-write-wins theo từng ghi chú
  console.log('4. since + last-write-wins');
  await resetDb();
  await call('an', 'anno_upsert', { doc_id: 'd1', items: [anno('a1', 1), anno('a2', 1), anno('a3', 2)] });
  r = await call('binh', 'anno_changes', { doc_id: 'd1', since: 0 });
  const c1 = r.body.data.cursor;
  check('since=0 trả 3 ghi chú, cursor = rev lớn nhất', r.body.data.items.length === 3 && c1 === Math.max(...r.body.data.items.map(i => i.rev)), r.body.data);
  await call('binh', 'anno_upsert', { doc_id: 'd1', items: [anno('a2', 1, { color: 'red' }), anno('b9', 3)] });
  await call('binh', 'anno_delete', { doc_id: 'd1', ids: ['a3'] });
  r = await call('an', 'anno_changes', { doc_id: 'd1', since: c1 });
  const changed = r.body.data.items;
  check('since=cursor chỉ trả 3 thay đổi mới (a2 sửa, b9 thêm, a3 xoá mềm)',
    changed.map(i => i.id).sort().join() === 'a2,a3,b9' && changed.every(i => i.rev > c1), changed);
  check('a3 trả về dạng deleted=true', changed.find(i => i.id === 'a3').deleted === true, changed);
  const c2 = r.body.data.cursor;
  r = await call('an', 'anno_changes', { doc_id: 'd1', since: c2 });
  check('since=cursor mới -> rỗng, cursor giữ nguyên', r.body.data.items.length === 0 && r.body.data.cursor === c2, r.body.data);
  await call('an', 'anno_upsert', { doc_id: 'd1', items: [anno('a2', 1, { color: 'blue' })] });
  r = await call('chi', 'anno_changes', { doc_id: 'd1', since: 0 });
  const a2 = r.body.data.items.find(i => i.id === 'a2');
  check('last-write-wins: a2 lấy bản ghi sau cùng (blue, updated_by=an)', a2.data.color === 'blue' && a2.updated_by === 'an', a2);
  check('since=0 bỏ dòng đã xoá', !r.body.data.items.some(i => i.id === 'a3'), r.body.data.items.map(i => i.id));
  r = await call('an', 'anno_changes', { doc_id: 'd1', since: 0, limit: 2 });
  check('phân trang: limit=2 -> has_more=true', r.body.data.items.length === 2 && r.body.data.has_more === true, r.body.data);
  r = await call('an', 'anno_changes', { doc_id: 'd1', since: 'abc' });
  check('since sai -> 400', r.status === 400, r);
  // Nhập dữ liệu annos_json cũ một lần
  await insertDoc({ id: 'd2', title: 'cu.pdf', drive_file_id: null, folder_name: 'Chung', owner_username: 'an', file_size: 0, page_count: 1, scale_ratio: '1:100', permissions_json: [] });
  await setAnnoBlob('d2', [{ id: 'old1', page: 2, type: 'ink' }, { page: 1, type: 'text' }], [{ id: 'cm1', text: 'hi' }]);
  r = await call('an', 'anno_changes', { doc_id: 'd2', since: 0 });
  check('since=0 tự nhập annos_json/comments_json cũ (3 dòng)', r.body.data.items.map(i => i.id).sort().join() === 'cm1,legacy_a2,old1', r.body.data.items);
  r = await call('an', 'anno_changes', { doc_id: 'd2', since: 0 });
  check('nhập cũ chỉ chạy một lần (vẫn 3 dòng)', r.body.data.items.length === 3, r.body.data.items.length);

  // 5. Hiện diện
  console.log('5. Presence');
  r = await call('an', 'presence_ping', { doc_id: 'd1', client_id: 'tabA', state: { page: 2 } });
  await call('chi', 'anno_changes', { doc_id: 'd1', since: 0, client_id: 'tabC' });
  r = await call('binh', 'presence_ping', { doc_id: 'd1', client_id: 'tabB' });
  check('presence liệt kê an, binh, chi', r.body.data.presence.map(p => p.username).join() === 'an,binh,chi', r.body.data);
  await call('an', 'presence_leave', { doc_id: 'd1', client_id: 'tabA' });
  r = await call('binh', 'presence_ping', { doc_id: 'd1', client_id: 'tabB' });
  check('presence_leave bỏ an', r.body.data.presence.map(p => p.username).join() === 'binh,chi', r.body.data);
  r = await call('em', 'presence_ping', { doc_id: 'd1', client_id: 'tabE' });
  check('người không có quyền presence_ping -> 403', r.status === 403, r);

  // 6. Xin quyền
  console.log('6. Access requests');
  r = await call('em', 'doc_request_access', { doc_id: 'd1', requested_role: 'Người sửa', message: 'cho em sửa' });
  const reqId = r.body.data.request && r.body.data.request.id;
  check('em gửi yêu cầu -> pending, lưu thật', r.status === 200 && r.body.data.request.status === 'pending' && (await countRows('SELECT COUNT(*) AS n FROM bqlda_pdf_access_requests')) === 1, r.body);
  r = await call('em', 'doc_request_access', { doc_id: 'd1', requested_role: 'Người nhận xét', message: 'thôi chỉ nhận xét' });
  check('gửi lại cập nhật yêu cầu đang chờ (không tạo trùng)', r.body.data.request.id === reqId && (await countRows('SELECT COUNT(*) AS n FROM bqlda_pdf_access_requests')) === 1, r.body);
  r = await call('chi', 'doc_request_access', { doc_id: 'd1', requested_role: 'Người xem' });
  check('đã có quyền đủ -> already=true, không tạo yêu cầu', r.body.data.already === true && (await countRows('SELECT COUNT(*) AS n FROM bqlda_pdf_access_requests')) === 1, r.body);
  r = await call('em', 'doc_request_access', { doc_id: 'khong_co' });
  check('tài liệu không tồn tại -> 404', r.status === 404, r);
  r = await call('binh', 'doc_access_requests', { doc_id: 'd1' });
  check('Người sửa (không phải chủ) xem yêu cầu -> 403', r.status === 403, r);
  r = await call('an', 'doc_access_requests', {});
  check('chủ sở hữu thấy 1 yêu cầu đang chờ kèm tên người xin', r.status === 200 && r.body.data.requests.length === 1 && r.body.data.requests[0].requester_fullname === 'EM', r.body);
  r = await call('em', 'doc_access_decide', { request_id: reqId, decision: 'approve' });
  check('người xin tự duyệt -> 403', r.status === 403, r);
  r = await call('an', 'doc_access_decide', { request_id: reqId, decision: 'approve' });
  check('chủ duyệt -> approved, permissions có em=Người nhận xét',
    r.status === 200 && r.body.data.request.status === 'approved' && r.body.data.permissions.some(p => p.username === 'em' && p.role === 'Người nhận xét'), r.body);
  r = await call('em', 'anno_changes', { doc_id: 'd1', since: 0 });
  check('sau khi duyệt em đọc được tài liệu, my_role=Người nhận xét', r.status === 200 && r.body.data.my_role === 'Người nhận xét', r.body.error);
  r = await call('em', 'anno_upsert', { doc_id: 'd1', items: [anno('em1', 1)] });
  check('em (Người nhận xét) thêm ghi chú được', r.status === 200 && r.body.data.applied.length === 1, r.body);
  r = await call('an', 'doc_access_decide', { request_id: reqId, decision: 'reject' });
  check('xử lý lại yêu cầu đã duyệt -> 409', r.status === 409, r);
  r = await call('em', 'doc_access_my', { doc_id: 'd1' });
  check('doc_access_my báo approved', r.body.data.request.status === 'approved', r.body);
  const perms = await docPerms('d1');
  check('các quyền cũ còn nguyên (binh, chi, dung)', ['binh', 'chi', 'dung'].every(u => perms.some(p => p.username === u)), perms);
  r = await call('giang', 'doc_request_access', { doc_id: 'd1', requested_role: 'Người xem' });
  const req2 = r.body.data.request.id;
  r = await call('an', 'doc_access_decide', { request_id: req2, decision: 'reject' });
  check('từ chối -> rejected, giang vẫn 403', r.body.data.request.status === 'rejected' && (await call('giang', 'doc_get', { doc_id: 'd1' })).status === 403, r.body);

  // 7. Tải lên tiếp nối + tải xuống file lớn (Google giả)
  console.log('7. Resumable upload + download (fake Google)');
  await resetDb();
  r = await call('binh', 'upload_begin', { name: 'lon.pdf', size: 101 * 1024 * 1024 });
  check('upload_begin > 100 MB -> 400', r.status === 400, r);
  r = await call('binh', 'upload_begin', { name: 'lon.pdf', size: 20 }, { origin: 'https://ke-xau.example' });
  check('upload_begin từ Origin lạ -> 403', r.status === 403, r);
  const bytes = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(5 * 1024 * 1024 + 123, 7)]);
  r = await call('binh', 'upload_begin', { name: 'lon.pdf', size: bytes.length, page_count: 12 });
  const up = r.body.data;
  const sess = fakeDrive.sessions.get(String(up.upload_url).slice(20));
  check('upload_begin -> upload_id, upload_url, chunk_size bội số 256 KiB; phiên tạo kèm Origin và appProperties',
    r.status === 200 && up.upload_id && up.chunk_size % (256 * 1024) === 0 && sess.origin === 'http://127.0.0.1:8790' && sess.meta.appProperties.qlda_upload_id === up.upload_id && sess.meta.parents[0] === 'folder_binh', r.body);
  check('upload_begin không trả token Drive', !JSON.stringify(r.body).includes('fake-drive-token'), r.body);
  r = await call('binh', 'upload_finish', { upload_id: up.upload_id });
  check('upload_finish khi chưa gửi xong -> complete=false', r.status === 200 && r.body.data.complete === false, r.body);
  r = await call('an', 'upload_finish', { upload_id: up.upload_id });
  check('người khác kết thúc phiên của binh -> 404', r.status === 404, r);
  const fileId = browserCompletesUpload(up.upload_url, bytes);
  r = await call('binh', 'upload_status', { upload_id: up.upload_id });
  check('upload_status -> complete=true', r.body.data.complete === true, r.body);
  r = await call('binh', 'upload_finish', { upload_id: up.upload_id });
  const newDoc = r.body.data && r.body.data.doc;
  check('upload_finish -> tạo tài liệu, my_role=Chủ sở hữu, không lộ drive_file_id',
    r.status === 200 && newDoc && newDoc.my_role === 'Chủ sở hữu' && newDoc.has_file === true && !JSON.stringify(r.body).includes(fileId), r.body);
  r = await call('binh', 'upload_finish', { upload_id: up.upload_id });
  check('upload_finish lần 2 -> 409', r.status === 409, r);
  // Phiên bị tráo file (appProperties khác)
  r = await call('binh', 'upload_begin', { name: 'b.pdf', size: 9 });
  browserCompletesUpload(r.body.data.upload_url, Buffer.from('%PDF-1.4\n'), { qlda_upload_id: 'up_khac' });
  r = await call('binh', 'upload_finish', { upload_id: r.body.data.upload_id });
  check('file không khớp phiên -> 403', r.status === 403, r);
  // Không phải PDF
  r = await call('binh', 'upload_begin', { name: 'c.pdf', size: 9 });
  const fake2 = browserCompletesUpload(r.body.data.upload_url, Buffer.from('MZ-not-pdf'.slice(0, 9)));
  r = await call('binh', 'upload_finish', { upload_id: r.body.data.upload_id });
  check('không phải PDF -> 400 và file bị chuyển vào thùng rác', r.status === 400 && fakeDrive.files.get(fake2).trashed === true, r);
  // Tải xuống
  const dl = await getFile('binh', newDoc.id);
  check('GET /api/pdf_file stream đủ ' + bytes.length + ' byte, đúng nội dung', dl.status === 200 && dl.body.equals(bytes) && dl.headers['accept-ranges'] === 'bytes', { status: dl.status, len: dl.body.length });
  const part = await getFile('binh', newDoc.id, 'bytes=0-1023');
  check('GET có Range -> 206, 1024 byte, Content-Range', part.status === 206 && part.body.length === 1024 && /^bytes 0-1023\//.test(part.headers['content-range']), { status: part.status, h: part.headers });
  check('GET không đăng nhập -> 401', (await getFile(null, newDoc.id)).status === 401);
  check('GET tài liệu không được chia sẻ -> 403', (await getFile('chi', newDoc.id)).status === 403);
  let assembled = [];
  let off = 0;
  for (;;) {
    r = await call('binh', 'drive_download_chunk', { doc_id: newDoc.id, offset: off, length: 3 * 1024 * 1024 });
    if (r.status !== 200) break;
    assembled.push(Buffer.from(r.body.data.base64, 'base64'));
    off += r.body.data.length;
    if (r.body.data.done) break;
  }
  const chunkJsonMax = 4.5e6;
  check('drive_download_chunk ghép lại đúng file', Buffer.concat(assembled).equals(bytes), off);
  check('mỗi phản hồi drive_download_chunk < 4,5 MB', JSON.stringify((await call('binh', 'drive_download_chunk', { doc_id: newDoc.id, offset: 0, length: 9e9 })).body).length < chunkJsonMax);
  check('drive_download_chunk người không có quyền -> 403', (await call('chi', 'drive_download_chunk', { doc_id: newDoc.id })).status === 403);

  // 8. Lược đồ: file migration khớp với lược đồ ensureDb
  console.log('8. Migration file');
  let schemaErr = null;
  try {
    for (const s of CORE_SCHEMA_STATEMENTS.concat(COLLAB_SCHEMA_STATEMENTS)) await db.raw(s);
  } catch (e) { schemaErr = e.message; }
  check('lược đồ SQLite áp dụng lại lần 2 không lỗi (idempotent)', schemaErr === null, schemaErr);

  // 9. Nhớ phiên + danh sách thiết bị
  console.log('9. Phiên & thiết bị');
  await resetDb();
  const iphone = { 'x-device-id': 'dv_iphone_test_01', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17.0 Mobile Safari/604.1' };
  const pc = { 'x-device-id': 'dv_pc_test_000002', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit Chrome/120.0 Safari/537.36' };
  await call('an', 'auth_status', {}, iphone);
  await call('an', 'auth_status', {}, pc);
  await call('an', 'auth_status', {}, iphone); // trong 5 phút: không ghi thêm
  let devs = await db.raw("SELECT * FROM bqlda_devices WHERE username='an' ORDER BY name");
  check('ghi nhận 2 thiết bị của một người', devs.length === 2, devs);
  check('tên thiết bị dễ đọc (iPhone · Safari, Windows · Chrome)', devs.some(d => d.name === 'iPhone · Safari') && devs.some(d => d.name === 'Máy tính Windows · Chrome'), devs.map(d => d.name));
  check('Thành viên không xem được danh sách thiết bị', (await call('an', 'devices_list')).status === 403);
  const devList = await call('admin', 'devices_list');
  check('Quản trị xem được thiết bị của mọi người', devList.body.ok && devList.body.data.filter(d => d.username === 'an').length === 2, devList.body);
  await db.raw("UPDATE bqlda_sessions SET expires_at = ? WHERE token = 'tok_binh'", [Date.now() + 3600e3]);
  await call('binh', 'auth_status');
  const exp = (await db.raw("SELECT expires_at FROM bqlda_sessions WHERE token='tok_binh'"))[0].expires_at;
  check('phiên sắp hết hạn được tự gia hạn khi còn dùng', exp - Date.now() > 100 * 24 * 3600e3, exp);

  // 10. Danh sách người để gắn @tên trong bình luận
  console.log('10. doc_people');
  const pp = await call('chi', 'doc_people', { doc_id: 'd1' });
  const ppNames = ((pp.body.data && pp.body.data.people) || []).map(p => p.username);
  check('doc_people trả kèm quyền của mình', pp.body.data && pp.body.data.my_role === 'Người xem' && pp.body.data.lead === false, pp.body.data && pp.body.data.my_role);
  check('người được chia sẻ lấy được danh sách người của tài liệu', pp.body.ok && ppNames.includes('an') && ppNames.includes('chi'), pp.body);
  check('danh sách không lộ người ngoài tài liệu', !ppNames.includes('em'), ppNames);
  check('người không được chia sẻ -> 403', (await call('em', 'doc_people', { doc_id: 'd1' })).status === 403);

  // 11. Bình luận: ai có quyền "Xem & bình luận" đều bình luận được vào hình của người khác; không ai đè mất bình luận của ai
  console.log('11. anno_comment');
  await call('binh', 'anno_upsert', { doc_id: 'd1', items: [anno('h1', 1)] }); // hình của binh
  let cr = await call('dung', 'anno_comment', { doc_id: 'd1', anno_id: 'h1', op: 'add', text: 'Anh @binh xem lại cao độ', mentions: ['binh'], reply_id: 'rd1' });
  check('Người bình luận bình luận được vào hình của người khác', cr.status === 200 && cr.body.data.data.replies.length === 1 && cr.body.data.data.replies[0].user === 'dung', cr.body);
  cr = await call('chi', 'anno_comment', { doc_id: 'd1', anno_id: 'h1', op: 'add', text: 'xin chào' });
  check('Chỉ xem -> không bình luận được (403)', cr.status === 403, cr.body);
  cr = await call('chi', 'anno_comment', { doc_id: 'd1', anno_id: 'h1', op: 'star', value: true });
  check('Chỉ xem vẫn gắn sao (riêng mình) được', cr.status === 200 && cr.body.data.data.starredBy.includes('chi'), cr.body);
  await call('an', 'anno_comment', { doc_id: 'd1', anno_id: 'h1', op: 'add', text: 'ok', reply_id: 'ra1' });
  // binh sửa hình với bản cũ không có bình luận => bình luận vẫn còn
  await call('binh', 'anno_upsert', { doc_id: 'd1', items: [anno('h1', 1, { moved: true, replies: [] })] });
  let hrow = (await db.raw("SELECT data FROM bqlda_pdf_anno_items WHERE doc_id='d1' AND id='h1'"))[0];
  const pj = v => (typeof v === "string" ? JSON.parse(v) : v);
  let hd = pj(hrow.data);
  check('sửa hình không làm mất bình luận đã có', hd.moved === true && hd.replies.length === 2 && hd.starredBy.includes('chi'), hd);
  cr = await call('dung', 'anno_comment', { doc_id: 'd1', anno_id: 'h1', op: 'delete', reply_id: 'ra1' });
  check('không xoá được bình luận của người khác', cr.status === 403, cr.body);
  cr = await call('dung', 'anno_comment', { doc_id: 'd1', anno_id: 'h1', op: 'pin', value: true });
  check('Người bình luận không ghim được (chỉ trưởng nhóm/Người sửa)', cr.status === 403, cr.body);
  cr = await call('an', 'anno_comment', { doc_id: 'd1', anno_id: 'h1', op: 'pin', value: true });
  check('chủ file (trưởng nhóm) ghim được', cr.status === 200 && cr.body.data.data.pinned === true, cr.body);
  cr = await call('an', 'anno_comment', { doc_id: 'd1', anno_id: 'h1', op: 'delete', reply_id: 'rd1' });
  check('trưởng nhóm xoá được bình luận của người khác', cr.status === 200 && cr.body.data.data.replies.length === 1, cr.body);
  const both = await Promise.all([
    call('dung', 'anno_comment', { doc_id: 'd1', anno_id: 'h1', op: 'add', text: 'cùng lúc 1', reply_id: 'rc1' }),
    call('binh', 'anno_comment', { doc_id: 'd1', anno_id: 'h1', op: 'add', text: 'cùng lúc 2', reply_id: 'rc2' })
  ]);
  hd = pj((await db.raw("SELECT data FROM bqlda_pdf_anno_items WHERE doc_id='d1' AND id='h1'"))[0].data);
  check('2 người bình luận cùng lúc: giữ đủ cả 2', both.every(x => x.status === 200) && ['rc1', 'rc2'].every(id => hd.replies.some(r => r.id === id)), hd.replies);
  cr = await call('em', 'anno_comment', { doc_id: 'd1', anno_id: 'h1', op: 'add', text: 'x' });
  check('người không được chia sẻ -> 403', cr.status === 403, cr.body);

  console.log(results.join('\n'));
  console.log(`\nKết quả: ${pass} đạt, ${fail} lỗi`);
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
