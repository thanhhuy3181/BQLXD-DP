'use strict';
/**
 * Serverless Backend API cho PDF QLDA trên Vercel.
 * Kết nối Neon Serverless PostgreSQL và Google Drive service.
 */
const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');
const gdriveService = require('./gdrive_service');

let initPromise = null;
const databaseUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || '';
const hashPassword = value => crypto.createHash('sha256').update(`SALT_BNGUA_${value}`).digest('hex');

const result = data => ({ ok: true, data, error: null });
const failure = error => ({ ok: false, data: null, error: String(error?.message || error || 'Lỗi máy chủ') });

function sqlClient() {
  const url = databaseUrl();
  if (!url) return null;
  return neon(url);
}

async function ensureDb() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const sql = sqlClient();
    if (!sql) return null;

    // 1. Đảm bảo bảng bqlda_users và bqlda_sessions tồn tại (dùng chung với rpc.js)
    await sql`CREATE TABLE IF NOT EXISTS bqlda_users (
      username text PRIMARY KEY,
      password_hash text NOT NULL,
      status text NOT NULL DEFAULT 'Active',
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS bqlda_sessions (
      token text PRIMARY KEY,
      username text NOT NULL REFERENCES bqlda_users(username) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL
    )`;

    // 2. Bảng tài liệu PDF QLDA
    await sql`CREATE TABLE IF NOT EXISTS bqlda_pdf_docs (
      id text PRIMARY KEY,
      title text NOT NULL,
      drive_file_id text,
      folder_name text DEFAULT 'Chung',
      owner_username text NOT NULL,
      file_size bigint DEFAULT 0,
      page_count int DEFAULT 1,
      scale_ratio text DEFAULT '1:100',
      permissions_json jsonb DEFAULT '[]'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;

    // 3. Bảng ghi chú & bình luận PDF (đồng bộ real-time)
    await sql`CREATE TABLE IF NOT EXISTS bqlda_pdf_annos (
      doc_id text PRIMARY KEY,
      annos_json jsonb NOT NULL DEFAULT '[]'::jsonb,
      comments_json jsonb NOT NULL DEFAULT '[]'::jsonb,
      updated_by text,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;

    // 4. Bảng cấu hình cá nhân Ribbon & Pick
    await sql`CREATE TABLE IF NOT EXISTS bqlda_pdf_prefs (
      username text PRIMARY KEY,
      ribbon_json jsonb DEFAULT '{}'::jsonb,
      recent_colors_json jsonb DEFAULT '[]'::jsonb,
      pick_json jsonb DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;

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
  if (!sql) return null;
  const header = req.headers?.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  try {
    const rows = await sql`SELECT u.username,u.status,u.data FROM bqlda_sessions s JOIN bqlda_users u ON u.username=s.username WHERE s.token=${token} AND s.expires_at>now()`;
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
  // Bật CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const sql = await ensureDb();
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) { body = {}; }
    }

    const action = body.action || body.method || '';
    const args = body.args || [];
    const payload = body.payload || (args.length ? args[0] : body);

    const currentUser = await getSessionUser(sql, req) || {
      username: 'ban',
      fullname: 'Bạn (Quản trị)',
      role: 'Admin',
      status: 'Active'
    };

    // 1. AUTH STATUS
    if (action === 'auth_status') {
      return res.status(200).json(result({
        authenticated: !!currentUser,
        user: currentUser
      }));
    }

    // 2. AUTH LOGIN
    if (action === 'auth_login' || action === 'login_user') {
      const identifier = String(payload.identifier || payload.username || args[0] || '').trim().toLowerCase();
      const password = String(payload.password || args[1] || '');
      const pHash = hashPassword(password);

      if (sql) {
        const rows = await sql`SELECT username,password_hash,status,data FROM bqlda_users WHERE lower(username)=${identifier} OR lower(data->>'email')=${identifier} LIMIT 1`;
        const row = rows[0];
        if (!row) return res.status(200).json(failure('Tài khoản không tồn tại trên hệ thống!'));
        if (row.status === 'Locked') return res.status(200).json(failure('Tài khoản này đã bị khóa bởi Quản trị viên!'));
        if (row.status === 'Pending' || row.status === 'wait') return res.status(200).json(failure('Tài khoản đang chờ Quản trị viên phê duyệt.'));
        if (row.password_hash !== pHash) return res.status(200).json(failure('Sai mật khẩu đăng nhập!'));

        const token = crypto.randomBytes(32).toString('hex');
        await sql`DELETE FROM bqlda_sessions WHERE expires_at<=now()`;
        await sql`INSERT INTO bqlda_sessions (token,username,expires_at) VALUES (${token},${row.username},now()+interval '30 days')`;
        return res.status(200).json({ ...result(publicUser(row)), session_token: token });
      } else {
        // Fallback demo khi không có database
        return res.status(200).json({
          ...result({ username: identifier || 'ban', fullname: 'Người dùng ' + identifier, role: 'Quản trị', status: 'Active' }),
          session_token: 'demo-session-' + Date.now()
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
      if (!profile || !profile.email) return res.status(200).json(failure('Token Google không hợp lệ'));

      const email = profile.email.toLowerCase();
      const username = email.split('@')[0].replace(/[^a-z0-9_]/g, '_');

      if (sql) {
        let rows = await sql`SELECT username,password_hash,status,data FROM bqlda_users WHERE lower(data->>'email')=${email} OR lower(username)=${username} LIMIT 1`;
        let row = rows[0];
        if (!row) {
          const newUser = {
            id: crypto.randomUUID(),
            username,
            fullname: profile.name || username,
            email,
            avatar: profile.picture || '',
            role: 'Thành viên',
            status: 'Active',
            created_at: new Date().toISOString()
          };
          await sql`INSERT INTO bqlda_users (username,password_hash,status,data) VALUES (${username},${hashPassword(crypto.randomBytes(16).toString('hex'))},'Active',${JSON.stringify(newUser)}::jsonb)`;
          rows = await sql`SELECT username,password_hash,status,data FROM bqlda_users WHERE username=${username}`;
          row = rows[0];
        }
        const token = crypto.randomBytes(32).toString('hex');
        await sql`INSERT INTO bqlda_sessions (token,username,expires_at) VALUES (${token},${row.username},now()+interval '30 days')`;
        return res.status(200).json({ ...result(publicUser(row)), session_token: token });
      } else {
        return res.status(200).json({
          ...result({ username, fullname: profile.name || username, email, role: 'Thành viên', status: 'Active' }),
          session_token: 'google-demo-' + Date.now()
        });
      }
    }

    // 4. USERS LIST & UPDATE (QUẢN LÝ TÀI KHOẢN)
    if (action === 'users_list') {
      if (sql) {
        const rows = await sql`SELECT username,status,data,updated_at FROM bqlda_users ORDER BY updated_at DESC`;
        const list = rows.map(r => publicUser(r));
        return res.status(200).json(result(list));
      } else {
        const fallbackUsers = [
          { username: 'ban', fullname: 'Bạn', email: 'ban@congty.vn', role: 'Quản trị', status: 'Active' },
          { username: 'minh', fullname: 'Minh', email: 'minh@congty.vn', role: 'Thành viên', status: 'Active' },
          { username: 'lan', fullname: 'Lan', email: 'lan@congty.vn', role: 'Thành viên', status: 'Active' },
          { username: 'tuan', fullname: 'Tuấn', email: 'tuan@congty.vn', role: 'Thành viên', status: 'Locked' },
          { username: 'hoa', fullname: 'Hoa', email: 'hoa@congty.vn', role: 'Thành viên', status: 'Pending' }
        ];
        return res.status(200).json(result(fallbackUsers));
      }
    }

    if (action === 'users_update') {
      const targetUsername = String(payload.username || '').trim();
      const newRole = payload.role;
      const newStatus = payload.status; // 'Active', 'Locked', 'Pending'

      if (!targetUsername) return res.status(200).json(failure('Thiếu username'));

      if (sql) {
        const rows = await sql`SELECT username,status,data FROM bqlda_users WHERE username=${targetUsername}`;
        const row = rows[0];
        if (!row) return res.status(200).json(failure('Không tìm thấy tài khoản'));

        const data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
        if (newRole) data.role = newRole;
        const statusToSet = newStatus || row.status;

        await sql`UPDATE bqlda_users SET status=${statusToSet}, data=${JSON.stringify(data)}::jsonb, updated_at=now() WHERE username=${targetUsername}`;

        // Nếu khoá tài khoản -> thu hồi toàn bộ session ngay lập tức!
        if (statusToSet === 'Locked' || statusToSet === 'lock') {
          await sql`DELETE FROM bqlda_sessions WHERE username=${targetUsername}`;
        }

        return res.status(200).json(result({ success: true, username: targetUsername, status: statusToSet, role: data.role }));
      } else {
        return res.status(200).json(result({ success: true, username: targetUsername, status: newStatus, role: newRole }));
      }
    }

    // 5. GOOGLE DRIVE STATUS & LISTING
    if (action === 'drive_status') {
      try {
        const token = await gdriveService.getAccessToken();
        return res.status(200).json(result({
          connected: !!token,
          root_folder: 'PDF-QLDA',
          service_account: true
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
        // 1. Đảm bảo thư mục gốc PDF-QLDA
        const rootId = await ensureDriveFolder('PDF-QLDA');
        let driveFiles = [];
        if (rootId) {
          const listRes = await gdriveService.listFiles(rootId);
          driveFiles = listRes.files || [];
        }

        // 2. Lấy danh sách từ cơ sở dữ liệu Postgres (nếu có)
        let dbFiles = [];
        if (sql) {
          dbFiles = await sql`SELECT * FROM bqlda_pdf_docs ORDER BY updated_at DESC`;
        } else {
          dbFiles = Array.from(memDocs.values());
        }

        return res.status(200).json(result({
          root_id: rootId,
          drive_files: driveFiles,
          db_docs: dbFiles
        }));
      } catch (err) {
        return res.status(200).json(failure('Lỗi đọc danh sách Google Drive: ' + err.message));
      }
    }

    // 6. GOOGLE DRIVE UPLOAD BASE64
    if (action === 'drive_upload_base64') {
      const fileName = String(payload.name || 'Tai-lieu.pdf').trim();
      const base64Data = payload.base64;
      const folderName = payload.folder_name || currentUser.username || 'Chung';
      const pageCount = Number(payload.page_count) || 1;
      const scaleRatio = payload.scale_ratio || '1:100';

      if (!base64Data) return res.status(200).json(failure('Thiếu dữ liệu file base64'));

      const buffer = Buffer.from(base64Data, 'base64');
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
          VALUES (${docItem.id}, ${docItem.title}, ${docItem.drive_file_id}, ${docItem.folder_name}, ${docItem.owner_username}, ${docItem.file_size}, ${docItem.page_count}, ${docItem.scale_ratio}, ${JSON.stringify(docItem.permissions_json)}::jsonb, now())`;
        await sql`INSERT INTO bqlda_pdf_annos (doc_id, annos_json, comments_json, updated_by, updated_at)
          VALUES (${docItem.id}, '[]'::jsonb, '[]'::jsonb, ${currentUser.username}, now()) ON CONFLICT (doc_id) DO NOTHING`;
      } else {
        memDocs.set(docId, docItem);
        memAnnos.set(docId, { doc_id: docId, annos_json: [], comments_json: [], updated_by: currentUser.username, updated_at: new Date().toISOString() });
      }

      return res.status(200).json(result(docItem));
    }

    // 7. GOOGLE DRIVE DOWNLOAD
    if (action === 'drive_download') {
      const fileId = payload.file_id || payload.drive_file_id || args[0];
      if (!fileId) return res.status(200).json(failure('Thiếu file_id'));
      const file = await gdriveService.downloadFile(fileId, 'application/pdf');
      return res.status(200).json(result(file));
    }

    // 8. DOC GET & ANNOTATIONS SYNC
    if (action === 'doc_get') {
      const docId = payload.doc_id || args[0];
      if (!docId) return res.status(200).json(failure('Thiếu doc_id'));

      let doc = null;
      let annos = { annos_json: [], comments_json: [] };

      if (sql) {
        const dRows = await sql`SELECT * FROM bqlda_pdf_docs WHERE id=${docId} LIMIT 1`;
        doc = dRows[0] || null;
        const aRows = await sql`SELECT * FROM bqlda_pdf_annos WHERE doc_id=${docId} LIMIT 1`;
        if (aRows[0]) annos = aRows[0];
      } else {
        doc = memDocs.get(docId) || null;
        annos = memAnnos.get(docId) || { annos_json: [], comments_json: [] };
      }

      return res.status(200).json(result({
        doc,
        annos: typeof annos.annos_json === 'string' ? JSON.parse(annos.annos_json) : (annos.annos_json || []),
        comments: typeof annos.comments_json === 'string' ? JSON.parse(annos.comments_json) : (annos.comments_json || []),
        updated_at: annos.updated_at
      }));
    }

    if (action === 'doc_save_annos') {
      const docId = payload.doc_id;
      const annos = payload.annos || [];
      const comments = payload.comments || [];

      if (!docId) return res.status(200).json(failure('Thiếu doc_id'));

      if (sql) {
        await sql`INSERT INTO bqlda_pdf_annos (doc_id, annos_json, comments_json, updated_by, updated_at)
          VALUES (${docId}, ${JSON.stringify(annos)}::jsonb, ${JSON.stringify(comments)}::jsonb, ${currentUser.username}, now())
          ON CONFLICT (doc_id) DO UPDATE SET
            annos_json=EXCLUDED.annos_json,
            comments_json=EXCLUDED.comments_json,
            updated_by=EXCLUDED.updated_by,
            updated_at=now()`;
        await sql`UPDATE bqlda_pdf_docs SET updated_at=now() WHERE id=${docId}`;
      } else {
        memAnnos.set(docId, { doc_id: docId, annos_json: annos, comments_json: comments, updated_by: currentUser.username, updated_at: new Date().toISOString() });
      }

      return res.status(200).json(result({ success: true, doc_id: docId, updated_at: new Date().toISOString() }));
    }

    // 9. DOC SHARE & REQUEST ACCESS
    if (action === 'doc_share') {
      const docId = payload.doc_id;
      const permissions = payload.permissions || [];
      if (!docId) return res.status(200).json(failure('Thiếu doc_id'));

      if (sql) {
        await sql`UPDATE bqlda_pdf_docs SET permissions_json=${JSON.stringify(permissions)}::jsonb, updated_at=now() WHERE id=${docId}`;
      } else if (memDocs.has(docId)) {
        const item = memDocs.get(docId);
        item.permissions_json = permissions;
      }
      return res.status(200).json(result({ success: true, permissions }));
    }

    if (action === 'doc_request_access') {
      const { doc_id, requested_role = 'Người sửa', note = '' } = payload;
      return res.status(200).json(result({
        success: true,
        message: `Đã gửi yêu cầu xin quyền '${requested_role}' tới chủ sở hữu file.`,
        doc_id,
        user: currentUser.username
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
          VALUES (${u}, ${JSON.stringify(ribbon)}::jsonb, ${JSON.stringify(recentColors)}::jsonb, ${JSON.stringify(pick)}::jsonb, now())
          ON CONFLICT (username) DO UPDATE SET
            ribbon_json=EXCLUDED.ribbon_json,
            recent_colors_json=EXCLUDED.recent_colors_json,
            pick_json=EXCLUDED.pick_json,
            updated_at=now()`;
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
