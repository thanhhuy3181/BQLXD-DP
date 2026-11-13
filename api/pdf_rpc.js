'use strict';
/**
 * Serverless Backend API cho PDF QLDA trên Vercel.
 * CSDL: Cloudflare D1 (SQLite) qua Worker cầu nối (PDF_SQL_URL, PDF_SQL_TOKEN), và Google Drive service.
 */
const crypto = require('crypto');
const { signToken, verifyToken } = require('./_auth_token');
const { sqlFromEnv, sqlLocal } = require('./_d1sql');
const gdriveService = require('./_gdrive_service');
const { CORE_SCHEMA_STATEMENTS, COLLAB_SCHEMA_STATEMENTS } = require('./_pdf_schema');

let initPromise = null;
let collabReady = false;
const hashPassword = value => crypto.createHash('sha256').update(`SALT_BNGUA_${value}`).digest('hex');

const result = data => ({ ok: true, data, error: null });
const failure = error => ({ ok: false, data: null, error: String(error?.message || error || 'Lỗi máy chủ') });

// Vai trò trên từng tài liệu (thứ hạng tăng dần).
const SHARE_ROLES = ['Người xem', 'Người nhận xét', 'Người sửa'];
const ROLE_RANK = { 'Người xem': 1, 'Người nhận xét': 2, 'Người sửa': 3, 'Chủ sở hữu': 4 };
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const DOWNLOAD_CHUNK_DEFAULT = 2 * 1024 * 1024;
const DOWNLOAD_CHUNK_MAX = 3 * 1024 * 1024; // base64 ~4 MiB < giới hạn 4,5 MB phản hồi của Vercel
const UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024; // bội số của 256 KiB theo yêu cầu Drive
const PRESENCE_TTL_SECONDS = 30;
const ANNO_BATCH_MAX = 500;
const ANNO_DATA_MAX_BYTES = 256 * 1024;

let sqlFactory = () => sqlFromEnv();

function sqlClient() {
  return sqlFactory();
}

function computeRole(user, doc) {
  if (!doc || !user) return null;
  if (user.role === 'Admin' || doc.owner_username === user.username) return 'Chủ sở hữu';
  const p = doc.permissions_json;
  const perms = Array.isArray(p) ? p : (typeof p === 'string' ? JSON.parse(p || '[]') : []);
  const hit = perms.find(x => x && x.username === user.username);
  return hit ? (hit.role || 'Người xem') : null;
}
const roleRank = role => (role ? (ROLE_RANK[role] || 1) : 0);

/* ---------- Kho lưu trữ Drive riêng (tài khoản Google độc lập, do Admin đăng nhập 1 lần) ---------- */
const SESSION_MS = 30 * 24 * 3600 * 1000;
// Chỉ hai tài khoản này là Quản trị; mọi tài khoản khác là thành viên (CBGS).
const OWNER_ADMINS = ['admin', 'thanhhuy3181'];
const isOwnerAdmin = username => OWNER_ADMINS.includes(String(username || '').toLowerCase());
const normRole = r => (r === 'Admin' || r === 'Quản trị') ? 'Admin' : 'CBGS';
let storageCache = { at: 0, value: null };
async function loadStorageToken(sql) {
  try {
    if (Date.now() - storageCache.at < 30000) return storageCache.value;
    const rows = await sql`SELECT value FROM bqlda_settings WHERE key = 'storage_drive' LIMIT 1`;
    const v = rows[0] ? (typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value) : null;
    storageCache = { at: Date.now(), value: v };
    gdriveService.setRefreshToken(v && v.refresh_token ? v.refresh_token : '');
    return v;
  } catch (e) { return null; }
}

async function ensureDb() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const sql = sqlClient();
    if (!sql) return null;

    // 1. Bảng lõi (người dùng, phiên, cài đặt, tài liệu, ghi chú, tuỳ chọn): idempotent.
    for (const stmt of CORE_SCHEMA_STATEMENTS) await sql.raw(stmt);
    // Tài khoản quản trị đăng nhập bằng mật khẩu (theo yêu cầu chủ sản phẩm). Chỉ tạo khi chưa có,
    // nên đổi mật khẩu sau này không bị ghi đè.
    await sql`INSERT OR IGNORE INTO bqlda_users (username,password_hash,status,data,updated_at)
      VALUES ('admin', ${hashPassword('55555')}, 'Active', ${JSON.stringify({ username: 'admin', fullname: 'Quản trị viên', role: 'Admin', status: 'Active' })}, ${Date.now()})`;

    


    // 5. Bảng cộng tác (ghi chú từng dòng, hiện diện, xin quyền, phiên tải lên).
    // Tách riêng: nếu lỗi thì các action cũ vẫn chạy, action mới trả 503.
    try {
      for (const stmt of COLLAB_SCHEMA_STATEMENTS) await sql.raw(stmt);
      collabReady = true;
    } catch (error) {
      collabReady = false;
      console.error('ensureDb collab schema error:', error);
    }

    return sql;
  })().catch(error => {
    initPromise = null;
    console.error('ensureDb error:', error);
    return null;
  });
  return initPromise;
}

const publicUser = row => {
  if (!row) return null;
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
  const legacyRole = { 'Phó nhóm': 'Nội nghiệp', 'Thành viên': 'CBGS' };
  const role = legacyRole[data.role] || data.role || (row.username === 'admin' ? 'Admin' : 'CBGS');
  return {
    ...data,
    role,
    username: row.username,
    status: row.status || data.status || 'Active',
    fullname: data.fullname || row.username
  };
};

async function getSessionUser(sql, req) {
  const header = req.headers?.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (header || req.headers?.['x-session-token'] || req.body?.session_token || '');
  if (!token) return null;
  const tUser = verifyToken(token);
  if (tUser) return tUser;
  if (!sql) return null;
  try {
    const rows = await sql`SELECT u.username,u.status,u.data FROM bqlda_sessions s JOIN bqlda_users u ON u.username=s.username WHERE s.token=${token} AND s.expires_at>${Date.now()}`;
    return publicUser(rows[0]);
  } catch (_) {
    return null;
  }
}

// Memory fallback store khi chưa cấu hình database
const memDocs = new Map();
const memAnnos = new Map();
const memPrefs = new Map();

/* Google Drive Helper Functions */
async function ensureDriveFolder(folderName, parentId = null) {
  try {
    const token = await gdriveService.getAccessToken();
    const cleanName = folderName.replace(/'/g, "\\'");
    let q = `mimeType = 'application/vnd.google-apps.folder' and name = '${cleanName}' and trashed = false`;
    if (parentId) q += ` and '${parentId}' in parents`;

    const searchUrl = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
      q,
      fields: 'files(id, name)',
      pageSize: '5',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true'
    });
    const sRes = await fetch(searchUrl, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(15000) });
    const sData = await sRes.json();
    if (sData.files && sData.files.length > 0) return sData.files[0].id;

    // Tạo mới folder
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : []
      }),
      signal: AbortSignal.timeout(15000)
    });
    const cData = await createRes.json();
    return cData.id;
  } catch (err) {
    console.error('ensureDriveFolder error:', err);
    return null;
  }
}

/* ---------- Trợ giúp cho cộng tác (H, G) ---------- */
const ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
const toIso = v => (v instanceof Date ? v.toISOString() : (v ? new Date(v).toISOString() : null));
const parseJson = v => (typeof v === 'string' ? JSON.parse(v) : v);

function parseAnnoItems(raw) {
  if (!Array.isArray(raw) || !raw.length) return { error: 'items phải là mảng khác rỗng.' };
  if (raw.length > ANNO_BATCH_MAX) return { error: `Tối đa ${ANNO_BATCH_MAX} ghi chú mỗi lần.` };
  const map = new Map();
  for (const it of raw) {
    if (!it || typeof it !== 'object') return { error: 'Ghi chú không hợp lệ.' };
    const id = String(it.id || '');
    if (!ID_RE.test(id)) return { error: `id ghi chú không hợp lệ: ${id.slice(0, 40)}` };
    const page = Number(it.page);
    if (!Number.isInteger(page) || page < 1 || page > 100000) return { error: `page không hợp lệ cho ghi chú ${id}.` };
    const data = it.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: `data của ghi chú ${id} phải là object.` };
    if (Buffer.byteLength(JSON.stringify(data)) > ANNO_DATA_MAX_BYTES) return { error: `data của ghi chú ${id} vượt ${ANNO_DATA_MAX_BYTES / 1024} KB.` };
    map.delete(id); // trùng id trong một lô: bản sau thắng
    map.set(id, { id, page, data });
  }
  return { items: [...map.values()] };
}

const normAnno = r => ({
  id: r.id,
  page: Number(r.page),
  data: parseJson(r.data) || {},
  deleted: !!r.deleted,
  created_by: r.created_by,
  updated_by: r.updated_by,
  updated_at: toIso(r.updated_at),
  rev: Number(r.rev)
});

const normRequest = r => r && ({
  id: r.id,
  doc_id: r.doc_id,
  doc_title: r.doc_title ?? undefined,
  requester: r.requester,
  requester_fullname: r.requester_fullname ?? undefined,
  requester_email: r.requester_email ?? undefined,
  requested_role: r.requested_role,
  message: r.message || '',
  status: r.status,
  decided_by: r.decided_by || null,
  decided_role: r.decided_role || null,
  decided_at: toIso(r.decided_at),
  created_at: toIso(r.created_at)
});

/* ---------- Trợ giúp Google Drive cho file lớn (F) ---------- */
async function driveFetch(url, opts = {}, timeoutMs = 20000) {
  const token = await gdriveService.getAccessToken();
  return fetch(url, {
    ...opts,
    headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) },
    signal: opts.signal || AbortSignal.timeout(timeoutMs)
  });
}

// Origin của trang gọi; Google chỉ cho trình duyệt gửi khúc (CORS) khi phiên được tạo kèm Origin.
function uploadOrigin(req) {
  const origin = String(req.headers?.origin || '');
  if (!origin) return null;
  let u;
  try { u = new URL(origin); } catch (_) { return undefined; }
  const host = String(req.headers?.host || '');
  const extra = String(process.env.PDF_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if ((host && u.host === host) || extra.includes(u.origin)) return u.origin;
  return undefined;
}

async function createResumableSession({ name, size, folderId, uploadId, username, origin }) {
  const headers = {
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': 'application/pdf',
    'X-Upload-Content-Length': String(size)
  };
  if (origin) headers.Origin = origin;
  const r = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,size,mimeType', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name,
      mimeType: 'application/pdf',
      parents: [folderId],
      appProperties: { qlda_upload_id: uploadId, qlda_owner: username }
    })
  });
  const location = r.headers.get('location');
  if (!r.ok || !location) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error?.message || `Không tạo được phiên tải lên Drive (HTTP ${r.status}).`);
  }
  return location;
}

// Hỏi Google đã nhận bao nhiêu byte. complete=true kèm metadata file khi đã xong.
async function querySessionStatus(sessionUri, size) {
  const r = await fetch(sessionUri, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${size}`, 'Content-Length': '0' },
    signal: AbortSignal.timeout(20000)
  });
  if (r.status === 200 || r.status === 201) return { complete: true, file: await r.json().catch(() => ({})), received: size };
  if (r.status === 308) {
    const range = r.headers.get('range');
    const m = range && /bytes=0-(\d+)/.exec(range);
    return { complete: false, received: m ? Number(m[1]) + 1 : 0 };
  }
  if (r.status === 404 || r.status === 410) return { complete: false, expired: true, received: 0 };
  throw new Error(`Không hỏi được trạng thái tải lên (HTTP ${r.status}).`);
}

async function getDriveMeta(fileId) {
  const r = await driveFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?supportsAllDrives=true&fields=id,name,size,mimeType,parents,trashed,appProperties');
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.message || 'Không đọc được thông tin file trên Drive.');
  return data;
}

async function readDriveRange(fileId, start, end) {
  const r = await driveFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media&supportsAllDrives=true', {
    headers: { Range: `bytes=${start}-${end}` }
  }, 25000);
  if (!(r.status === 206 || r.status === 200)) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error?.message || `Không tải được dữ liệu từ Drive (HTTP ${r.status}).`);
  }
  let buf = Buffer.from(await r.arrayBuffer());
  let total = null;
  const cr = r.headers.get('content-range');
  const m = cr && /\/(\d+)$/.exec(cr);
  if (m) total = Number(m[1]);
  if (r.status === 200) { // máy chủ bỏ qua Range: tự cắt
    total = buf.length;
    buf = buf.subarray(start, end + 1);
  }
  return { buffer: buf, total };
}

async function trashDriveFile(fileId) {
  try {
    await driveFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?supportsAllDrives=true', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true })
    });
  } catch (err) {
    console.warn('trashDriveFile:', err.message);
  }
}

let memCollab = null; // DEMO (chạy thử trên máy, không CSDL cấu hình): SQLite trong bộ nhớ của Node
let memCollabReady = null;
const demoCollabSql = () => {
  if (!memCollab) {
    memCollab = sqlLocal(':memory:');
    memCollabReady = (async () => {
      for (const stmt of CORE_SCHEMA_STATEMENTS.concat(COLLAB_SCHEMA_STATEMENTS)) await memCollab.raw(stmt);
    })();
  }
  return memCollab;
};

// Dành n số rev liên tiếp cho ghi chú (thay nextval của Postgres); trả về số đứng trước số đầu tiên.
// Dòng thứ i trong lô nhận rev = base + i (i từ 1). D1 ghi tuần tự nên bộ đếm này an toàn.
async function reserveRevs(db, n) {
  const rows = await db`UPDATE bqlda_pdf_counters SET val = val + ${n} WHERE name = 'anno_rev' RETURNING val`;
  return Number(rows[0].val) - n;
}

async function uploadToDrive(fileName, mimeType, buffer, parentFolderId) {
  const token = await gdriveService.getAccessToken();
  const metadata = {
    name: fileName,
    parents: parentFolderId ? [parentFolderId] : []
  };
  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelim = "\r\n--" + boundary + "--";

  const multipartRequestBody = Buffer.concat([
    Buffer.from(delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + delimiter + 'Content-Type: ' + (mimeType || 'application/pdf') + '\r\nContent-Transfer-Encoding: base64\r\n\r\n'),
    Buffer.from(buffer.toString('base64')),
    Buffer.from(closeDelim)
  ]);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'multipart/related; boundary=' + boundary
    },
    body: multipartRequestBody,
    signal: AbortSignal.timeout(35000)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Không thể upload lên Google Drive');
  return data;
}

module.exports = async function handler(req, res) {
  // Chỉ phục vụ cùng nguồn: không mở CORS cho trang khác.
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json(failure('Chỉ nhận POST'));

  try {
    const sql = await ensureDb();
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) { body = {}; }
    }

    const action = body.action || body.method || '';
    const args = body.args || [];
    const payload = body.payload || (args.length ? args[0] : body);

    // Chế độ hoạt động linh hoạt: khi CSDL Neon chạm hạn ngạch thì chuyển sang bộ nhớ đệm
    const DEMO = !sql && !process.env.VERCEL;
    const reqToken = (req.headers?.authorization || '').replace(/^Bearer /, '') || req.headers?.['x-session-token'] || req.body?.session_token || '';
    let currentUser = await getSessionUser(sql, req);
    if (!currentUser && DEMO && !reqToken) currentUser = { username: 'ban', fullname: 'Bạn (chạy thử)', role: 'Admin', status: 'Active' };
    if (currentUser && currentUser.status !== 'Active') currentUser = null;

    const PUBLIC_ACTIONS = ['auth_status', 'auth_login', 'login_user', 'auth_google', 'google_login'];
    if (!currentUser && !PUBLIC_ACTIONS.includes(action)) {
      return res.status(401).json(failure('Chưa đăng nhập hoặc phiên đã hết hạn.'));
    }
    const isAdmin = !!currentUser && currentUser.role === 'Admin';
    if (currentUser && sql) await loadStorageToken(sql);
    const roleOn = doc => computeRole(currentUser, doc);
    const canRead = doc => !!roleOn(doc);
    const canWrite = doc => { const r = roleOn(doc); return !!r && r !== 'Người xem'; };
    const canEditAll = doc => roleRank(roleOn(doc)) >= ROLE_RANK['Người sửa'];
    const canManage = doc => roleOn(doc) === 'Chủ sở hữu';
    const loadDoc = async id => {
      if (!id) return null;
      if (sql) { const r = await sql`SELECT * FROM bqlda_pdf_docs WHERE id=${String(id)} LIMIT 1`; return r[0] || null; }
      return memDocs.get(id) || null;
    };
    // Không bao giờ trả mã file Drive ra trình duyệt.
    const safeDoc = doc => { if (!doc) return null; const { drive_file_id, ...rest } = doc; return { ...rest, has_file: !!drive_file_id, my_role: roleOn(doc) }; };

    // 1. AUTH STATUS
    if (action === 'auth_status') {
      let user = currentUser;
      if (!user && reqToken) user = verifyToken(reqToken);
      if (!user && DEMO) {
        user = { username: 'ban', fullname: 'Bạn (chạy thử)', role: 'Admin', status: 'Active' };
      }
      return res.status(200).json(result({
        authenticated: !!user,
        user
      }));
    }

    // 2. AUTH LOGIN
    if (action === 'auth_login' || action === 'login_user') {
      const identifier = String(payload.identifier || payload.username || args[0] || '').trim().toLowerCase();
      const password = String(payload.password || args[1] || '');
      const pHash = hashPassword(password);

      if (sql) {
        const rows = await sql`SELECT username,password_hash,status,data FROM bqlda_users WHERE lower(username)=${identifier} OR lower(json_extract(data,'$.email'))=${identifier} LIMIT 1`;
        const row = rows[0];
        if (!row) return res.status(200).json(failure('Tài khoản không tồn tại trên hệ thống!'));
        if (row.status === 'Locked') return res.status(200).json(failure('Tài khoản này đã bị khóa bởi Quản trị viên!'));
        if (row.status === 'Pending' || row.status === 'wait') return res.status(200).json(failure('Tài khoản đang chờ Quản trị viên phê duyệt.'));
        // Chỉ tài khoản Admin đăng nhập bằng mật khẩu; các tài khoản khác phải đăng nhập bằng Google.
        const rdataRole = (typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {})).role;
        if (rdataRole !== 'Admin') return res.status(200).json(failure('Tài khoản này đăng nhập bằng Google.'));
        if (row.password_hash !== pHash) return res.status(200).json(failure('Sai mật khẩu đăng nhập!'));

        const token = crypto.randomBytes(32).toString('hex');
        await sql`DELETE FROM bqlda_sessions WHERE expires_at<=${Date.now()}`;
        await sql`INSERT INTO bqlda_sessions (token,username,expires_at) VALUES (${token},${row.username},${Date.now() + SESSION_MS})`;
        return res.status(200).json({ ...result(publicUser(row)), session_token: token });
      } else {
        if (!DEMO) return res.status(503).json(failure("Máy chủ chưa kết nối cơ sở dữ liệu."));
        // Chỉ chạy tới đây ở chế độ thử trên máy (DEMO)
        const isAdm = identifier.includes('thanhhuy3181') || identifier === 'admin';
        if (!isAdm) return res.status(200).json(failure('Tài khoản này đăng nhập bằng Google.'));
        const isMem = false;
        const role = 'Admin';
        const fullname = isAdm ? 'Thanh Huy (Admin)' : (isMem ? 'Huy Còi (Tester)' : 'Người dùng ' + identifier);
        return res.status(200).json({
          ...result({ username: identifier || 'ban', fullname, email: identifier.includes('@') ? identifier : `${identifier}@gmail.com`, role, status: 'Active' }),
          session_token: signToken(identifier || 'ban', role)
        });
      }
    }

    // 3. AUTH GOOGLE
    if (action === 'auth_google' || action === 'google_login') {
      const credential = String(payload.credential || args[0] || '').trim();
      if (!credential) return res.status(200).json(failure('Thiếu thông tin xác thực Google'));
      let profile;
      try {
        const gRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, { signal: AbortSignal.timeout(10000) });
        profile = await gRes.json();
      } catch (e) {
        return res.status(200).json(failure('Không thể xác thực Google token'));
      }
      const allowedClientIds = ['334170590522-p4s1gj2uvrhg6m0tdvvkgvq8tgh7dcmh.apps.googleusercontent.com'];
      if (!profile || !profile.sub || !profile.email || !allowedClientIds.includes(profile.aud) || String(profile.email_verified) !== 'true' || !['accounts.google.com', 'https://accounts.google.com'].includes(profile.iss) || Number(profile.exp) * 1000 <= Date.now()) {
        return res.status(200).json(failure('Token Google không hợp lệ'));
      }

      const email = profile.email.toLowerCase();
      const username = email.split('@')[0].replace(/[^a-z0-9_]/g, '_');

      if (sql) {
        let rows = await sql`SELECT username,password_hash,status,data FROM bqlda_users WHERE lower(json_extract(data,'$.email'))=${email} OR lower(username)=${username} LIMIT 1`;
        let row = rows[0];
        if (!row) {
          const newUser = {
            id: crypto.randomUUID(),
            username,
            fullname: profile.name || username,
            email,
            avatar: profile.picture || '',
            role: 'CBGS',
            status: 'Pending',
            allowed_projects: [],
            auth_provider: 'google',
            google_sub: String(profile.sub),
            created_at: new Date().toISOString()
          };
          await sql`INSERT INTO bqlda_users (username,password_hash,status,data,updated_at) VALUES (${username},${hashPassword(crypto.randomBytes(16).toString('hex'))},'Pending',${JSON.stringify(newUser)},${Date.now()}) ON CONFLICT (username) DO NOTHING`;
          // Hai tài khoản chủ hệ thống được kích hoạt ngay lần đăng nhập Google đầu tiên (đoạn dưới nâng quyền/kích hoạt).
          if (email !== 'thanhhuy3181@gmail.com' && email !== 'huycoi5@gmail.com') {
            return res.status(200).json(failure('Đã ghi nhận tài khoản. Vui lòng chờ Quản trị viên phê duyệt.'));
          }
          rows = await sql`SELECT username,password_hash,status,data FROM bqlda_users WHERE lower(username)=${username} LIMIT 1`;
          row = rows[0];
          if (!row) return res.status(200).json(failure('Không tạo được tài khoản, thử lại.'));
        }
        const rdata = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
        const isAdm = email === 'thanhhuy3181@gmail.com';
        const isMem = email === 'huycoi5@gmail.com';
        if (isAdm && (row.status !== 'Active' || rdata.role !== 'Admin')) {
          row.status = 'Active';
          rdata.role = 'Admin';
          rdata.status = 'Active';
          await sql`UPDATE bqlda_users SET status='Active', data=json_set(data, '$.role', 'Admin'), updated_at=${Date.now()} WHERE username=${row.username}`;
        }
        if (isMem && row.status !== 'Active') {
          row.status = 'Active';
          rdata.status = 'Active';
          await sql`UPDATE bqlda_users SET status='Active', updated_at=${Date.now()} WHERE username=${row.username}`;
        }
        if (rdata.google_sub && rdata.google_sub !== String(profile.sub)) return res.status(200).json(failure('Danh tính Google không khớp tài khoản đã liên kết.'));
        if (row.status === 'Locked') return res.status(200).json(failure('Tài khoản này đã bị khóa bởi Quản trị viên!'));
        if (row.status !== 'Active') return res.status(200).json(failure('Tài khoản đang chờ Quản trị viên phê duyệt.'));
        const token = crypto.randomBytes(32).toString('hex');
        await sql`INSERT INTO bqlda_sessions (token,username,expires_at) VALUES (${token},${row.username},${Date.now() + SESSION_MS})`;
        return res.status(200).json({ ...result(publicUser(row)), session_token: token });
      } else {
        if (!DEMO) return res.status(503).json(failure("Máy chủ chưa kết nối cơ sở dữ liệu."));
        const isAdm = email === 'thanhhuy3181@gmail.com';
        const role = isAdm ? 'Admin' : 'CBGS';
        const tag = isAdm ? 'thanhhuy3181-' : (email === 'huycoi5@gmail.com' ? 'huycoi5-' : '');
        return res.status(200).json({
          ...result({ username, fullname: profile.name || username, email, role, status: 'Active' }),
          session_token: signToken(email, role)
        });
      }
    }

    // 4. USERS LIST & UPDATE (QUẢN LÝ TÀI KHOẢN)
    if ((action === 'users_list' || action === 'users_update' || action === 'users_delete') && !isAdmin) {
      return res.status(403).json(failure('Chỉ Quản trị viên được quản lý tài khoản.'));
    }
    if (action === 'users_list') {
      if (sql) {
        const rows = await sql`SELECT username,status,data,updated_at FROM bqlda_users ORDER BY updated_at DESC`;
        let list = rows.map(r => { const u = publicUser(r); return { username: u.username, fullname: u.fullname, email: u.email || '', role: u.role, status: u.status }; });
        return res.status(200).json(result(list));
      } else {
        if (!DEMO) return res.status(503).json(failure("Máy chủ chưa kết nối cơ sở dữ liệu."));
        const fallbackUsers = [];
        return res.status(200).json(result(fallbackUsers));
      }
    }

    if (action === 'users_update') {
      const targetUsername = String(payload.username || '').trim();
      const newRole = payload.role;
      const newStatus = payload.status; // 'Active', 'Locked', 'Pending'

      if (!targetUsername) return res.status(200).json(failure('Thiếu username'));
      if (newStatus && !['Active', 'Locked', 'Pending'].includes(newStatus)) return res.status(200).json(failure('Trạng thái không hợp lệ'));
      if (targetUsername === currentUser.username && (newStatus === 'Locked' || (newRole && normRole(newRole) !== 'Admin'))) return res.status(200).json(failure('Không thể tự khóa hoặc tự hạ quyền chính mình.'));

      if (sql) {
        const rows = await sql`SELECT username,status,data FROM bqlda_users WHERE username=${targetUsername}`;
        const row = rows[0];
        if (!row) return res.status(200).json(failure('Không tìm thấy tài khoản'));

        const data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
        if (data.role === 'Admin' && newStatus === 'Locked') return res.status(200).json(failure('Không khóa tài khoản Admin.'));
        if (newRole) {
          const want = normRole(newRole);
          if (want === 'Admin' && !isOwnerAdmin(targetUsername)) return res.status(200).json(failure('Chỉ tài khoản admin và thanhhuy3181 là Quản trị; tài khoản khác là thành viên.'));
          if (want !== 'Admin' && isOwnerAdmin(targetUsername)) return res.status(200).json(failure('Không hạ quyền tài khoản quản trị chính.'));
          data.role = want;
        }
        const statusToSet = newStatus || row.status;

        await sql`UPDATE bqlda_users SET status=${statusToSet}, data=${JSON.stringify(data)}, updated_at=${Date.now()} WHERE username=${targetUsername}`;

        // Nếu khoá tài khoản -> thu hồi toàn bộ session ngay lập tức!
        if (statusToSet === 'Locked' || statusToSet === 'lock') {
          await sql`DELETE FROM bqlda_sessions WHERE username=${targetUsername}`;
        }

        return res.status(200).json(result({ success: true, username: targetUsername, status: statusToSet, role: data.role }));
      } else {
        return res.status(200).json(result({ success: true, username: targetUsername, status: newStatus, role: newRole }));
      }
    }

    if (action === 'users_delete') {
      const targetUsername = String(payload.username || '').trim();
      if (!targetUsername) return res.status(200).json(failure('Thiếu username'));
      if (targetUsername === currentUser.username || targetUsername === 'ban') {
        return res.status(200).json(failure('Không thể tự xóa tài khoản của chính mình.'));
      }
      if (sql) {
        await sql`DELETE FROM bqlda_sessions WHERE username=${targetUsername}`;
        await sql`DELETE FROM bqlda_users WHERE username=${targetUsername}`;
      }
      return res.status(200).json(result({ success: true, deleted: targetUsername }));
    }

    // 4b. KẾT NỐI KHO LƯU TRỮ (Admin đăng nhập Google của tài khoản kho, 1 lần)
    if (action === 'storage_connect') {
      if (!isAdmin) return res.status(403).json(failure('Chỉ Quản trị viên được kết nối kho lưu trữ.'));
      if (!sql) return res.status(200).json(failure('Chưa có cơ sở dữ liệu để lưu kết nối.'));
      const code = String(payload.code || '').trim();
      if (!code) return res.status(200).json(failure('Thiếu mã xác thực Google.'));
      const tr = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({ code, client_id: gdriveService.CLIENT_ID, client_secret: gdriveService.CLIENT_SECRET, redirect_uri: 'postmessage', grant_type: 'authorization_code' }),
        signal: AbortSignal.timeout(15000)
      });
      const td = await tr.json();
      if (!tr.ok || !td.access_token) return res.status(200).json(failure('Google từ chối: ' + (td.error_description || td.error || 'lỗi không rõ')));
      if (!td.refresh_token) return res.status(200).json(failure('Google không trả quyền truy cập lâu dài. Hãy vào myaccount.google.com/permissions gỡ quyền của ứng dụng rồi kết nối lại.'));
      let email = '';
      try {
        const ui = await (await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + td.access_token }, signal: AbortSignal.timeout(10000) })).json();
        email = String(ui.email || '');
      } catch (_) {}
      const val = { refresh_token: td.refresh_token, email, connected_by: currentUser.username, connected_at: new Date().toISOString() };
      await sql`INSERT INTO bqlda_settings (key, value, updated_at) VALUES ('storage_drive', ${JSON.stringify(val)}, ${Date.now()})
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`;
      storageCache = { at: Date.now(), value: val };
      gdriveService.setRefreshToken(val.refresh_token);
      return res.status(200).json(result({ connected: true, email }));
    }
    if (action === 'storage_disconnect') {
      if (!isAdmin) return res.status(403).json(failure('Chỉ Quản trị viên được ngắt kết nối kho lưu trữ.'));
      if (sql) await sql`DELETE FROM bqlda_settings WHERE key = 'storage_drive'`;
      storageCache = { at: Date.now(), value: null };
      gdriveService.setRefreshToken('');
      return res.status(200).json(result({ connected: false }));
    }

    // 5. GOOGLE DRIVE STATUS & LISTING
    if (action === 'drive_status') {
      try {
        const token = await gdriveService.getAccessToken();
        return res.status(200).json(result({
          connected: !!token,
          root_folder: 'PDF-QLDA',
          email: (storageCache.value && storageCache.value.email) || '',
          dedicated: !!(storageCache.value && storageCache.value.refresh_token)
        }));
      } catch (err) {
        return res.status(200).json(result({
          connected: false,
          error: err.message
        }));
      }
    }

    if (action === 'drive_list') {
      try {

        // 2. Lấy danh sách từ cơ sở dữ liệu Postgres (nếu có)
        let dbFiles = [];
        if (sql) {
          dbFiles = await sql`SELECT * FROM bqlda_pdf_docs ORDER BY updated_at DESC`;
        } else {
          dbFiles = Array.from(memDocs.values());
        }

        return res.status(200).json(result({
          db_docs: dbFiles.filter(canRead).map(safeDoc)
        }));
      } catch (err) {
        return res.status(200).json(failure('Lỗi đọc danh sách Google Drive: ' + err.message));
      }
    }

    // 6. GOOGLE DRIVE UPLOAD BASE64
    if (action === 'drive_upload_base64') {
      const fileName = String(payload.name || 'Tai-lieu.pdf').trim();
      const base64Data = payload.base64;
      const folderName = currentUser.username;
      const pageCount = Number(payload.page_count) || 1;
      const scaleRatio = payload.scale_ratio || '1:100';

      if (!base64Data) return res.status(200).json(failure('Thiếu dữ liệu file base64'));

      const buffer = Buffer.from(String(base64Data), 'base64');
      if (buffer.length > 100 * 1024 * 1024) return res.status(200).json(failure('File vượt quá 100 MB.'));
      if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') return res.status(200).json(failure('File không phải PDF hợp lệ.'));
      let driveFileId = null;

      try {
        const rootId = await ensureDriveFolder('PDF-QLDA');
        const userFolderId = await ensureDriveFolder(folderName, rootId);
        const driveRes = await uploadToDrive(fileName, 'application/pdf', buffer, userFolderId);
        driveFileId = driveRes.id;
      } catch (err) {
        console.warn('Upload Google Drive không thành công, lưu bản ghi local:', err.message);
      }

      const docId = 'doc_' + crypto.randomBytes(8).toString('hex');
      const docItem = {
        id: docId,
        title: fileName,
        drive_file_id: driveFileId,
        folder_name: folderName,
        owner_username: currentUser.username,
        file_size: buffer.length,
        page_count: pageCount,
        scale_ratio: scaleRatio,
        permissions_json: [{ username: currentUser.username, role: 'Chủ sở hữu' }],
        updated_at: new Date().toISOString()
      };

      if (sql) {
        await sql`INSERT INTO bqlda_pdf_docs (id,title,drive_file_id,folder_name,owner_username,file_size,page_count,scale_ratio,permissions_json,updated_at)
          VALUES (${docItem.id}, ${docItem.title}, ${docItem.drive_file_id}, ${docItem.folder_name}, ${docItem.owner_username}, ${docItem.file_size}, ${docItem.page_count}, ${docItem.scale_ratio}, ${JSON.stringify(docItem.permissions_json)}, ${Date.now()})`;
        await sql`INSERT INTO bqlda_pdf_annos (doc_id, annos_json, comments_json, updated_by, updated_at)
          VALUES (${docItem.id}, '[]', '[]', ${currentUser.username}, ${Date.now()}) ON CONFLICT (doc_id) DO NOTHING`;
      } else {
        memDocs.set(docId, docItem);
        memAnnos.set(docId, { doc_id: docId, annos_json: [], comments_json: [], updated_by: currentUser.username, updated_at: new Date().toISOString() });
      }

      return res.status(200).json(result(safeDoc(docItem)));
    }

    // 7. GOOGLE DRIVE DOWNLOAD
    // DEPRECATED cho file lớn: trả base64 trong JSON nên trên Vercel chỉ chạy với file ~3 MB
    // (giới hạn phản hồi 4,5 MB). Dùng GET /api/pdf_file?doc=<id> (stream) hoặc drive_download_chunk.
    if (action === 'drive_download') {
      // Chỉ theo doc_id và sau khi kiểm tra quyền; không nhận mã file Drive từ trình duyệt.
      const dlDoc = await loadDoc(payload.doc_id);
      if (!dlDoc || !canRead(dlDoc)) return res.status(403).json(failure('Bạn không có quyền mở tài liệu này.'));
      if (!dlDoc.drive_file_id) return res.status(200).json(failure('Tài liệu chưa có file trên Drive.'));
      const file = await gdriveService.downloadFile(dlDoc.drive_file_id, 'application/pdf');
      return res.status(200).json(result(file));
    }

    // 8. DOC GET & ANNOTATIONS SYNC
    if (action === 'doc_get') {
      const docId = payload.doc_id || args[0];
      if (!docId) return res.status(200).json(failure('Thiếu doc_id'));

      let doc = await loadDoc(docId);
      if (!doc || !canRead(doc)) return res.status(403).json(failure('Bạn không có quyền mở tài liệu này.'));
      let annos = { annos_json: [], comments_json: [] };

      if (sql) {
        const aRows = await sql`SELECT * FROM bqlda_pdf_annos WHERE doc_id=${docId} LIMIT 1`;
        if (aRows[0]) annos = aRows[0];
      } else {
        annos = memAnnos.get(docId) || { annos_json: [], comments_json: [] };
      }

      return res.status(200).json(result({
        doc: safeDoc(doc),
        annos: typeof annos.annos_json === 'string' ? JSON.parse(annos.annos_json) : (annos.annos_json || []),
        comments: typeof annos.comments_json === 'string' ? JSON.parse(annos.comments_json) : (annos.comments_json || []),
        updated_at: annos.updated_at
      }));
    }

    // DEPRECATED: ghi đè cả khối annos_json làm mất ghi chú khi hai người cùng sửa.
    // Dùng anno_upsert / anno_delete / anno_changes. Giữ lại tạm thời cho giao diện cũ;
    // chỉ Người sửa/Chủ sở hữu được dùng (Người nhận xét không được ghi đè ghi chú của người khác).
    if (action === 'doc_save_annos') {
      const docId = payload.doc_id;
      const annos = payload.annos || [];
      const comments = payload.comments || [];

      if (!docId) return res.status(200).json(failure('Thiếu doc_id'));
      if (!Array.isArray(annos) || !Array.isArray(comments)) return res.status(200).json(failure('Dữ liệu ghi chú không hợp lệ'));
      if (!canEditAll(await loadDoc(docId))) return res.status(403).json(failure('Bạn không có quyền sửa tài liệu này.'));

      if (sql) {
        await sql`INSERT INTO bqlda_pdf_annos (doc_id, annos_json, comments_json, updated_by, updated_at)
          VALUES (${docId}, ${JSON.stringify(annos)}, ${JSON.stringify(comments)}, ${currentUser.username}, ${Date.now()})
          ON CONFLICT (doc_id) DO UPDATE SET
            annos_json=excluded.annos_json,
            comments_json=excluded.comments_json,
            updated_by=excluded.updated_by,
            updated_at=excluded.updated_at`;
        await sql`UPDATE bqlda_pdf_docs SET updated_at=${Date.now()} WHERE id=${docId}`;
      } else {
        memAnnos.set(docId, { doc_id: docId, annos_json: annos, comments_json: comments, updated_by: currentUser.username, updated_at: new Date().toISOString() });
      }

      return res.status(200).json(result({ success: true, doc_id: docId, updated_at: new Date().toISOString() }));
    }

    // 9. DOC SHARE & REQUEST ACCESS
    if (action === 'doc_share') {
      const docId = payload.doc_id;
      const ROLES = SHARE_ROLES;
      const shareDoc = await loadDoc(docId);
      if (!shareDoc || !canManage(shareDoc)) return res.status(403).json(failure('Chỉ chủ sở hữu được chia sẻ tài liệu này.'));
      const permissions = (Array.isArray(payload.permissions) ? payload.permissions : [])
        .filter(p => p && typeof p.username === 'string' && ROLES.includes(p.role) && p.username !== shareDoc.owner_username)
        .map(p => ({ username: p.username.trim().toLowerCase(), role: p.role }));

      if (sql) {
        await sql`UPDATE bqlda_pdf_docs SET permissions_json=${JSON.stringify(permissions)}, updated_at=${Date.now()} WHERE id=${docId}`;
      } else if (memDocs.has(docId)) {
        const item = memDocs.get(docId);
        item.permissions_json = permissions;
      }
      return res.status(200).json(result({ success: true, permissions }));
    }

    // ================= CỘNG TÁC: H (ghi chú từng dòng, hiện diện), G (xin quyền), F (file lớn) =================
    const COLLAB_ACTIONS = [
      'anno_upsert', 'anno_delete', 'anno_changes', 'presence_ping', 'presence_leave',
      'doc_request_access', 'doc_access_my', 'doc_access_requests', 'doc_access_decide',
      'upload_begin', 'upload_status', 'upload_finish', 'upload_cancel', 'drive_download_chunk'
    ];
    if (COLLAB_ACTIONS.includes(action) && sql && !collabReady) {
      return res.status(503).json(failure('CSDL chưa có bảng cộng tác. Chạy scripts/migrate-pdf-collab.sql.'));
    }
    const db = sql || demoCollabSql();
    if (!sql) await memCollabReady;
    const me = currentUser.username;
    const bad = msg => res.status(400).json(failure(msg));
    const deny = msg => res.status(403).json(failure(msg || 'Bạn không có quyền mở tài liệu này.'));

    // Tài liệu đọc được hay không; trả về doc hoặc null (đã gửi phản hồi 403).
    const readableDoc = async docId => {
      if (!docId) { bad('Thiếu doc_id'); return null; }
      const doc = await loadDoc(docId);
      if (!doc || !canRead(doc)) { deny(); return null; }
      return doc;
    };

    const presenceTouch = async (doc, clientId, state) => {
      const stateJson = JSON.stringify(state && typeof state === 'object' && !Array.isArray(state) ? state : {});
      if (stateJson.length > 2048) throw new Error('state hiện diện vượt 2 KB.');
      const nowMs = Date.now();
      await db`/*q:presence_upsert*/ INSERT INTO bqlda_pdf_presence (doc_id, username, client_id, fullname, state, last_seen)
        VALUES (${doc.id}, ${me}, ${clientId}, ${currentUser.fullname || me}, ${stateJson}, ${nowMs})
        ON CONFLICT (doc_id, username, client_id) DO UPDATE SET fullname = excluded.fullname, state = excluded.state, last_seen = excluded.last_seen`;
      if (Math.random() < 0.02) {
        await db`/*q:presence_gc*/ DELETE FROM bqlda_pdf_presence WHERE last_seen < ${nowMs - 10 * 60 * 1000}`;
      }
    };
    const presenceList = async doc => {
      const rows = await db`/*q:presence_list*/ SELECT username, fullname, client_id, state, last_seen FROM bqlda_pdf_presence
        WHERE doc_id = ${doc.id} AND last_seen > ${Date.now() - PRESENCE_TTL_SECONDS * 1000}
        ORDER BY username, client_id`;
      return rows.map(r => ({ username: r.username, fullname: r.fullname || r.username, client_id: r.client_id, state: parseJson(r.state) || {}, last_seen: toIso(r.last_seen) }));
    };

    // H1. Ghi/ghi đè một lô ghi chú (last-write-wins theo từng ghi chú).
    if (action === 'anno_upsert') {
      const doc = await readableDoc(payload.doc_id);
      if (!doc) return;
      const rank = roleRank(roleOn(doc));
      if (rank < ROLE_RANK['Người nhận xét']) return deny('Người xem không được thêm hoặc sửa ghi chú.');
      const parsed = parseAnnoItems(payload.items);
      if (parsed.error) return bad(parsed.error);
      const editAll = rank >= ROLE_RANK['Người sửa'];
      const base = await reserveRevs(db, parsed.items.length);
      const rows = await db`/*q:anno_upsert*/ INSERT INTO bqlda_pdf_anno_items (doc_id, id, page, data, created_by, updated_by, updated_at, rev, deleted)
        SELECT ${doc.id}, json_extract(value, '$.id'), json_extract(value, '$.page'), json_extract(value, '$.data'), ${me}, ${me}, ${Date.now()}, ${base} + key + 1, 0
        FROM json_each(${JSON.stringify(parsed.items)}) WHERE 1 = 1
        ON CONFLICT (doc_id, id) DO UPDATE SET page = excluded.page, data = excluded.data, updated_by = excluded.updated_by,
          updated_at = excluded.updated_at, rev = excluded.rev, deleted = 0
        WHERE ${editAll} OR bqlda_pdf_anno_items.created_by = ${me}
        RETURNING id, rev, updated_at`;
      const applied = rows.map(r => ({ id: r.id, rev: Number(r.rev), updated_at: toIso(r.updated_at) }));
      const ok = new Set(applied.map(a => a.id));
      const rejected = parsed.items.filter(i => !ok.has(i.id)).map(i => i.id);
      return res.status(200).json(result({ applied, rejected }));
    }

    // H2. Xoá mềm (deleted=true, rev mới để người khác nhận qua anno_changes).
    if (action === 'anno_delete') {
      const doc = await readableDoc(payload.doc_id);
      if (!doc) return;
      const rank = roleRank(roleOn(doc));
      if (rank < ROLE_RANK['Người nhận xét']) return deny('Người xem không được xoá ghi chú.');
      const ids = Array.isArray(payload.ids) ? [...new Set(payload.ids.map(String))] : [];
      if (!ids.length || ids.length > ANNO_BATCH_MAX || !ids.every(i => ID_RE.test(i))) return bad('ids không hợp lệ.');
      const editAll = rank >= ROLE_RANK['Người sửa'];
      const base = await reserveRevs(db, ids.length);
      // rev của mỗi id = base + thứ tự của id trong lô (theo thứ tự chuỗi), nên các rev khác nhau.
      const rows = await db`/*q:anno_delete*/ UPDATE bqlda_pdf_anno_items SET deleted = 1, updated_by = ${me}, updated_at = ${Date.now()},
          rev = ${base} + (SELECT COUNT(*) FROM json_each(${JSON.stringify(ids)}) j WHERE j.value <= bqlda_pdf_anno_items.id)
        WHERE doc_id = ${doc.id} AND id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))
          AND deleted = 0 AND (${editAll} OR created_by = ${me})
        RETURNING id, rev, updated_at`;
      const deleted = rows.map(r => ({ id: r.id, rev: Number(r.rev), updated_at: toIso(r.updated_at) }));
      const done = new Set(deleted.map(d => d.id));
      return res.status(200).json(result({ deleted, skipped: ids.filter(i => !done.has(i)) }));
    }

    // H3. Thay đổi sau mốc rev. since=0: tải toàn bộ (bỏ dòng đã xoá) và tự nhập dữ liệu annos_json cũ một lần.
    if (action === 'anno_changes') {
      const doc = await readableDoc(payload.doc_id);
      if (!doc) return;
      const sinceRaw = payload.since ?? 0;
      if (!/^\d{1,15}$/.test(String(sinceRaw))) return bad('since phải là số nguyên ≥ 0.');
      const since = Number(sinceRaw);
      const limit = Math.min(Math.max(Number(payload.limit) || 500, 1), 1000);
      if (since === 0) {
        const cnt = await db`SELECT COALESCE(json_array_length(annos_json), 0) + COALESCE(json_array_length(comments_json), 0) AS n
          FROM bqlda_pdf_annos WHERE doc_id = ${doc.id}`;
        const legacyN = Number(cnt[0] ? cnt[0].n : 0);
        const base = legacyN > 0 ? await reserveRevs(db, legacyN) : 0;
        await db`/*q:anno_import_legacy*/ INSERT INTO bqlda_pdf_anno_items (doc_id, id, page, data, created_by, updated_by, updated_at, rev, deleted)
          SELECT ${doc.id}, src.id, src.page, src.data, ${doc.owner_username}, ${doc.owner_username}, ${Date.now()}, ${base} + src.rn, 0
          FROM (
            SELECT id, page, data, ROW_NUMBER() OVER () AS rn FROM (
              SELECT COALESCE(NULLIF(json_extract(a.value, '$.id'), ''), 'legacy_a' || (a.key + 1)) AS id,
                     MAX(1, COALESCE(CAST(json_extract(a.value, '$.page') AS INTEGER), 1)) AS page,
                     a.value AS data
              FROM bqlda_pdf_annos b, json_each(b.annos_json) a
              WHERE b.doc_id = ${doc.id} AND json_type(b.annos_json) = 'array' AND json_type(a.value) = 'object'
              UNION ALL
              SELECT COALESCE(NULLIF(json_extract(c.value, '$.id'), ''), 'legacy_c' || (c.key + 1)),
                     MAX(1, COALESCE(CAST(json_extract(c.value, '$.page') AS INTEGER), 1)),
                     json_patch(c.value, '{"_legacy_kind":"comment"}')
              FROM bqlda_pdf_annos b, json_each(b.comments_json) c
              WHERE b.doc_id = ${doc.id} AND json_type(b.comments_json) = 'array' AND json_type(c.value) = 'object'
            )
          ) src
          WHERE NOT EXISTS (SELECT 1 FROM bqlda_pdf_anno_items e WHERE e.doc_id = ${doc.id})
          ON CONFLICT (doc_id, id) DO NOTHING`;
      }
      const rows = await db`/*q:anno_changes*/ SELECT id, page, data, deleted, created_by, updated_by, updated_at, rev
        FROM bqlda_pdf_anno_items
        WHERE doc_id = ${doc.id} AND rev > ${since} AND (${since} > 0 OR deleted = 0)
        ORDER BY rev ASC LIMIT ${limit + 1}`;
      const has_more = rows.length > limit;
      const items = rows.slice(0, limit).map(normAnno);
      const cursor = items.length ? items[items.length - 1].rev : since;
      const out = { items, cursor, has_more, my_role: roleOn(doc) };
      if (payload.client_id) {
        if (!ID_RE.test(String(payload.client_id))) return bad('client_id không hợp lệ.');
        await presenceTouch(doc, String(payload.client_id), payload.state);
        out.presence = await presenceList(doc);
      }
      return res.status(200).json(result(out));
    }

    // H4. Hiện diện: nhịp tim mỗi 10–15 giây (hoặc gửi client_id kèm anno_changes).
    if (action === 'presence_ping') {
      const doc = await readableDoc(payload.doc_id);
      if (!doc) return;
      if (!ID_RE.test(String(payload.client_id || ''))) return bad('client_id không hợp lệ.');
      await presenceTouch(doc, String(payload.client_id), payload.state);
      return res.status(200).json(result({ presence: await presenceList(doc), ttl_seconds: PRESENCE_TTL_SECONDS }));
    }

    if (action === 'presence_leave') {
      const doc = await readableDoc(payload.doc_id);
      if (!doc) return;
      if (!ID_RE.test(String(payload.client_id || ''))) return bad('client_id không hợp lệ.');
      await db`/*q:presence_leave*/ DELETE FROM bqlda_pdf_presence WHERE doc_id = ${doc.id} AND username = ${me} AND client_id = ${String(payload.client_id)}`;
      return res.status(200).json(result({ success: true }));
    }

    // G1. Người chưa có quyền gửi yêu cầu (lưu thật; gửi lại thì cập nhật yêu cầu đang chờ).
    if (action === 'doc_request_access') {
      const docId = String(payload.doc_id || '');
      if (!docId) return bad('Thiếu doc_id');
      const requestedRole = payload.requested_role || 'Người xem';
      if (!SHARE_ROLES.includes(requestedRole)) return bad('Vai trò xin cấp không hợp lệ.');
      const message = String(payload.message ?? payload.note ?? '').slice(0, 1000);
      const doc = await loadDoc(docId);
      if (!doc) return res.status(404).json(failure('Không tìm thấy tài liệu.'));
      const myRole = roleOn(doc);
      if (roleRank(myRole) >= ROLE_RANK[requestedRole]) {
        return res.status(200).json(result({ already: true, my_role: myRole, request: null }));
      }
      const rows = await db`/*q:access_upsert*/ INSERT INTO bqlda_pdf_access_requests (id, doc_id, requester, requested_role, message, status, created_at)
        VALUES (${'req_' + crypto.randomBytes(8).toString('hex')}, ${doc.id}, ${me}, ${requestedRole}, ${message}, 'pending', ${Date.now()})
        ON CONFLICT (doc_id, requester) WHERE status = 'pending'
        DO UPDATE SET requested_role = excluded.requested_role, message = excluded.message, created_at = excluded.created_at
        RETURNING id, doc_id, requester, requested_role, message, status, decided_by, decided_role, decided_at, created_at`;
      return res.status(200).json(result({ already: false, my_role: myRole, request: normRequest(rows[0]) }));
    }

    // G2. Người xin quyền xem trạng thái yêu cầu gần nhất của mình.
    if (action === 'doc_access_my') {
      const docId = String(payload.doc_id || '');
      if (!docId) return bad('Thiếu doc_id');
      const doc = await loadDoc(docId);
      if (!doc) return res.status(404).json(failure('Không tìm thấy tài liệu.'));
      const rows = await db`/*q:access_mine*/ SELECT id, doc_id, requester, requested_role, message, status, decided_by, decided_role, decided_at, created_at
        FROM bqlda_pdf_access_requests WHERE doc_id = ${doc.id} AND requester = ${me} ORDER BY created_at DESC LIMIT 1`;
      return res.status(200).json(result({ my_role: roleOn(doc), request: normRequest(rows[0]) || null }));
    }

    // G3. Chủ sở hữu xem yêu cầu đang chờ (một tài liệu, hoặc mọi tài liệu mình sở hữu).
    if (action === 'doc_access_requests') {
      let rows;
      if (payload.doc_id) {
        const doc = await loadDoc(String(payload.doc_id));
        if (!doc || !canManage(doc)) return deny('Chỉ chủ sở hữu được xem yêu cầu xin quyền.');
        rows = await db`/*q:access_list_doc*/ SELECT r.id, r.doc_id, d.title AS doc_title, r.requester, json_extract(u.data, '$.fullname') AS requester_fullname,
            json_extract(u.data, '$.email') AS requester_email, r.requested_role, r.message, r.status, r.decided_by, r.decided_role, r.decided_at, r.created_at
          FROM bqlda_pdf_access_requests r JOIN bqlda_pdf_docs d ON d.id = r.doc_id LEFT JOIN bqlda_users u ON u.username = r.requester
          WHERE r.status = 'pending' AND r.doc_id = ${doc.id} ORDER BY r.created_at ASC LIMIT 200`;
      } else {
        rows = await db`/*q:access_list_owner*/ SELECT r.id, r.doc_id, d.title AS doc_title, r.requester, json_extract(u.data, '$.fullname') AS requester_fullname,
            json_extract(u.data, '$.email') AS requester_email, r.requested_role, r.message, r.status, r.decided_by, r.decided_role, r.decided_at, r.created_at
          FROM bqlda_pdf_access_requests r JOIN bqlda_pdf_docs d ON d.id = r.doc_id LEFT JOIN bqlda_users u ON u.username = r.requester
          WHERE r.status = 'pending' AND (${isAdmin} OR d.owner_username = ${me}) ORDER BY r.created_at DESC LIMIT 200`;
      }
      return res.status(200).json(result({ requests: rows.map(normRequest) }));
    }

    // G4. Duyệt (cấp vai trò vào permissions_json — cùng chỗ doc_share ghi) hoặc từ chối.
    if (action === 'doc_access_decide') {
      const reqId = String(payload.request_id || '');
      const decision = payload.decision;
      if (!reqId || !['approve', 'reject'].includes(decision)) return bad('Cần request_id và decision là approve|reject.');
      const found = await db`/*q:access_get*/ SELECT id, doc_id, requester, requested_role, message, status, decided_by, decided_role, decided_at, created_at
        FROM bqlda_pdf_access_requests WHERE id = ${reqId} LIMIT 1`;
      const reqRow = found[0];
      if (!reqRow) return res.status(404).json(failure('Không tìm thấy yêu cầu.'));
      const doc = await loadDoc(reqRow.doc_id);
      if (!doc || !canManage(doc)) return deny('Chỉ chủ sở hữu được duyệt yêu cầu này.');
      if (decision === 'approve') {
        const role = payload.role || reqRow.requested_role;
        if (!SHARE_ROLES.includes(role)) return bad('Vai trò cấp không hợp lệ.');
        if (reqRow.requester === doc.owner_username) return bad('Người này đã là chủ sở hữu.');
        const claimed = await db`/*q:access_approve*/ UPDATE bqlda_pdf_access_requests SET status = 'approved', decided_by = ${me}, decided_role = ${role}, decided_at = ${Date.now()}
            WHERE id = ${reqId} AND status = 'pending'
            RETURNING id, doc_id, requester, requested_role, message, status, decided_by, decided_role, decided_at, created_at`;
        if (!claimed[0]) return res.status(409).json(failure('Yêu cầu đã được xử lý trước đó.'));
        const reqNow = claimed[0];
        const current = (Array.isArray(doc.permissions_json) ? doc.permissions_json : (parseJson(doc.permissions_json) || []));
        const nextPerms = current.filter(p => p && p.username !== reqNow.requester);
        nextPerms.push({ username: reqNow.requester, role: reqNow.decided_role });
        await db`/*q:access_perms_write*/ UPDATE bqlda_pdf_docs SET permissions_json = ${JSON.stringify(nextPerms)}, updated_at = ${Date.now()} WHERE id = ${doc.id}`;
        const perms = nextPerms.filter(p => p && p.username !== doc.owner_username);
        return res.status(200).json(result({ request: normRequest(reqNow), permissions: perms }));
      }
      const rows = await db`/*q:access_reject*/ UPDATE bqlda_pdf_access_requests SET status = 'rejected', decided_by = ${me}, decided_at = ${Date.now()}
        WHERE id = ${reqId} AND status = 'pending'
        RETURNING id, doc_id, requester, requested_role, message, status, decided_by, decided_role, decided_at, created_at`;
      if (!rows[0]) return res.status(409).json(failure('Yêu cầu đã được xử lý trước đó.'));
      return res.status(200).json(result({ request: normRequest(rows[0]) }));
    }

    // F1. Bắt đầu tải lên tiếp nối: máy chủ kiểm tra rồi tạo phiên Drive; trình duyệt PUT từng khúc thẳng tới upload_url.
    if (action === 'upload_begin') {
      const name = String(payload.name || '').trim().slice(0, 200);
      const size = Number(payload.size);
      if (!name || !/\.pdf$/i.test(name)) return bad('Tên file phải kết thúc bằng .pdf');
      if (!Number.isInteger(size) || size <= 0) return bad('size không hợp lệ.');
      if (size > MAX_UPLOAD_BYTES) return bad('File vượt quá 100 MB.');
      const origin = uploadOrigin(req);
      if (origin === undefined) return deny('Origin không được phép tải lên.');
      const folderName = me;
      const rootId = await ensureDriveFolder('PDF-QLDA');
      const folderId = rootId && await ensureDriveFolder(folderName, rootId);
      if (!folderId) return res.status(502).json(failure('Không tạo được thư mục trên Google Drive.'));
      const uploadId = 'up_' + crypto.randomBytes(12).toString('hex');
      const sessionUri = await createResumableSession({ name, size, folderId, uploadId, username: me, origin });
      const pageCount = Math.max(1, Math.min(Number(payload.page_count) || 1, 100000));
      const scaleRatio = String(payload.scale_ratio || '1:100').slice(0, 20);
      await db`/*q:upload_insert*/ INSERT INTO bqlda_pdf_uploads (id, username, title, folder_name, folder_id, session_uri, file_size, page_count, scale_ratio, status, created_at, expires_at)
        VALUES (${uploadId}, ${me}, ${name}, ${folderName}, ${folderId}, ${sessionUri}, ${size}, ${pageCount}, ${scaleRatio}, 'pending', ${Date.now()}, ${Date.now() + 6 * 24 * 3600 * 1000})`;
      return res.status(200).json(result({ upload_id: uploadId, upload_url: sessionUri, chunk_size: UPLOAD_CHUNK_SIZE, size }));
    }

    const loadUpload = async () => {
      const id = String(payload.upload_id || '');
      if (!id) return null;
      const rows = await db`/*q:upload_get*/ SELECT * FROM bqlda_pdf_uploads WHERE id = ${id} AND username = ${me} LIMIT 1`;
      return rows[0] || null;
    };

    // F2. Hỏi Google đã nhận bao nhiêu byte (để tiếp tục sau khi rớt mạng / tải lại trang).
    if (action === 'upload_status') {
      const up = await loadUpload();
      if (!up) return res.status(404).json(failure('Không tìm thấy phiên tải lên.'));
      if (up.status !== 'pending') return res.status(200).json(result({ status: up.status, doc_id: up.doc_id || null }));
      const st = await querySessionStatus(up.session_uri, Number(up.file_size));
      return res.status(200).json(result({
        status: st.expired ? 'expired' : 'pending',
        complete: st.complete,
        received_bytes: st.received,
        size: Number(up.file_size),
        upload_url: st.expired ? null : up.session_uri,
        chunk_size: UPLOAD_CHUNK_SIZE
      }));
    }

    // F3. Kết thúc: máy chủ tự hỏi Google, kiểm tra file (đúng phiên, đúng thư mục, đúng kích thước, đầu %PDF-) rồi ghi bản ghi tài liệu.
    if (action === 'upload_finish') {
      const up = await loadUpload();
      if (!up) return res.status(404).json(failure('Không tìm thấy phiên tải lên.'));
      if (up.status !== 'pending') return res.status(409).json(failure('Phiên tải lên đã kết thúc (' + up.status + ').'));
      const size = Number(up.file_size);
      let fileId = null;
      const st = await querySessionStatus(up.session_uri, size).catch(() => null);
      if (st && st.complete && st.file && st.file.id) fileId = st.file.id;
      else if (st && !st.complete && !st.expired) return res.status(200).json(result({ complete: false, received_bytes: st.received, size }));
      else if (typeof payload.drive_file_id === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(payload.drive_file_id)) fileId = payload.drive_file_id;
      if (!fileId) return res.status(409).json(failure('Google chưa xác nhận file đã tải lên xong.'));

      const meta = await getDriveMeta(fileId);
      const okMeta = meta && !meta.trashed
        && meta.appProperties && meta.appProperties.qlda_upload_id === up.id
        && Array.isArray(meta.parents) && meta.parents.includes(up.folder_id)
        && Number(meta.size) === size;
      if (!okMeta) return deny('File trên Drive không khớp phiên tải lên.');
      const head = await readDriveRange(fileId, 0, 4);
      if (head.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
        await trashDriveFile(fileId);
        await db`/*q:upload_set_status*/ UPDATE bqlda_pdf_uploads SET status = ${'rejected'} WHERE id = ${up.id} AND username = ${me} AND status = 'pending' RETURNING id`;
        return bad('File không phải PDF hợp lệ (đã chuyển vào thùng rác Drive).');
      }
      const docId = 'doc_' + crypto.randomBytes(8).toString('hex');
      const claimed = await db`/*q:upload_complete*/ UPDATE bqlda_pdf_uploads SET status = 'done', drive_file_id = ${fileId}, doc_id = ${docId}
          WHERE id = ${up.id} AND username = ${me} AND status = 'pending' RETURNING *`;
      if (!claimed[0]) return res.status(409).json(failure('Phiên tải lên đã được ghi nhận trước đó.'));
      const u = claimed[0];
      const rows = await db`/*q:upload_doc_insert*/ INSERT INTO bqlda_pdf_docs (id, title, drive_file_id, folder_name, owner_username, file_size, page_count, scale_ratio, permissions_json, updated_at)
        VALUES (${docId}, ${u.title}, ${fileId}, ${u.folder_name}, ${u.username}, ${u.file_size}, ${u.page_count}, ${u.scale_ratio},
          ${JSON.stringify([{ username: u.username, role: 'Chủ sở hữu' }])}, ${Date.now()})
        RETURNING *`;
      if (!rows[0]) return res.status(409).json(failure('Phiên tải lên đã được ghi nhận trước đó.'));
      const newDoc = rows[0];
      if (!sql) memDocs.set(newDoc.id, newDoc);
      return res.status(200).json(result({ complete: true, doc: safeDoc(newDoc) }));
    }

    // F4. Huỷ phiên (Google giữ phiên tối đa 1 tuần; ta đánh dấu và cố gắng huỷ phía Google).
    if (action === 'upload_cancel') {
      const up = await loadUpload();
      if (!up) return res.status(404).json(failure('Không tìm thấy phiên tải lên.'));
      const rows = await db`/*q:upload_set_status*/ UPDATE bqlda_pdf_uploads SET status = ${'cancelled'} WHERE id = ${up.id} AND username = ${me} AND status = 'pending' RETURNING id`;
      if (rows[0]) {
        try { await fetch(up.session_uri, { method: 'DELETE', signal: AbortSignal.timeout(10000) }); } catch (_) { /* bỏ qua */ }
      }
      return res.status(200).json(result({ cancelled: !!rows[0] }));
    }

    // F5. Tải xuống từng khúc qua RPC (dự phòng khi không dùng được GET /api/pdf_file).
    if (action === 'drive_download_chunk') {
      const doc = await readableDoc(payload.doc_id);
      if (!doc) return;
      if (!doc.drive_file_id) return res.status(404).json(failure('Tài liệu chưa có file trên Drive.'));
      const offset = Number(payload.offset || 0);
      const length = Math.min(Number(payload.length) || DOWNLOAD_CHUNK_DEFAULT, DOWNLOAD_CHUNK_MAX);
      if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(length) || length <= 0) return bad('offset/length không hợp lệ.');
      const known = Number(doc.file_size) || 0;
      if (known && offset >= known) return bad('offset vượt kích thước file.');
      const part = await readDriveRange(doc.drive_file_id, offset, offset + length - 1);
      const total = part.total || known;
      return res.status(200).json(result({
        base64: part.buffer.toString('base64'),
        offset,
        length: part.buffer.length,
        total,
        done: offset + part.buffer.length >= total
      }));
    }

    // 10. PREFERENCES (RIBBON & PICK)
    if (action === 'prefs_get') {
      const u = currentUser.username;
      if (sql) {
        const rows = await sql`SELECT ribbon_json, recent_colors_json, pick_json FROM bqlda_pdf_prefs WHERE username=${u} LIMIT 1`;
        if (rows[0]) {
          return res.status(200).json(result(rows[0]));
        }
      } else if (memPrefs.has(u)) {
        return res.status(200).json(result(memPrefs.get(u)));
      }
      return res.status(200).json(result({ ribbon_json: {}, recent_colors_json: [], pick_json: {} }));
    }

    if (action === 'prefs_save') {
      const u = currentUser.username;
      const ribbon = payload.ribbon || {};
      const recentColors = payload.recent_colors || [];
      const pick = payload.pick || {};

      if (sql) {
        await sql`INSERT INTO bqlda_pdf_prefs (username, ribbon_json, recent_colors_json, pick_json, updated_at)
          VALUES (${u}, ${JSON.stringify(ribbon)}, ${JSON.stringify(recentColors)}, ${JSON.stringify(pick)}, ${Date.now()})
          ON CONFLICT (username) DO UPDATE SET
            ribbon_json=excluded.ribbon_json,
            recent_colors_json=excluded.recent_colors_json,
            pick_json=excluded.pick_json,
            updated_at=excluded.updated_at`;
      } else {
        memPrefs.set(u, { ribbon_json: ribbon, recent_colors_json: recentColors, pick_json: pick });
      }
      return res.status(200).json(result({ success: true }));
    }

    return res.status(200).json(failure(`Hành động không xác định: ${action}`));
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json(failure(err.message || 'Lỗi xử lý API PDF'));
  }
};

/**
 * Dùng chung cho api/pdf_file.js: xác thực phiên + quyền đọc một tài liệu.
 * Không có chế độ "người dùng mặc định": thiếu CSDL → 503, thiếu phiên → 401.
 */
async function authorizeDocRead(req, docId) {
  const sql = await ensureDb();
  if (!sql) return { status: 503, error: 'Máy chủ chưa cấu hình cơ sở dữ liệu.' };
  const user = await getSessionUser(sql, req);
  if (!user || user.status !== 'Active') return { status: 401, error: 'Chưa đăng nhập hoặc phiên đã hết hạn.' };
  if (!docId) return { status: 400, error: 'Thiếu doc' };
  const rows = await sql`SELECT * FROM bqlda_pdf_docs WHERE id=${String(docId)} LIMIT 1`;
  const doc = rows[0] || null;
  const role = computeRole(user, doc);
  if (!doc || !role) return { status: 403, error: 'Bạn không có quyền mở tài liệu này.' };
  return { status: 200, user, doc, role };
}

module.exports.authorizeDocRead = authorizeDocRead;
// Chỉ dùng trong scripts/test-pdf-rpc.cjs (gọi trong tiến trình, không lộ qua HTTP).
module.exports.__setSqlFactoryForTests = factory => {
  sqlFactory = factory;
  initPromise = null;
  collabReady = false;
};
