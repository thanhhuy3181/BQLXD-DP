const crypto = require('crypto');
'use strict';
/**
 * Bộ giả lập trong bộ nhớ của client SQL (hàm tagged-template giống @neondatabase/serverless).
 * Dùng cho:
 *  - scripts/test-pdf-rpc.cjs (chạy handler thật, không cần CSDL),
 *  - chế độ DEMO trên máy (không DATABASE_URL, không Vercel) cho các action cộng tác.
 * Mỗi câu SQL mới trong pdf_rpc.js có nhãn /*q:<tên>*\/; giả lập này cài đúng ngữ nghĩa của từng nhãn.
 * Mỗi câu chạy nguyên tử (giống một câu lệnh Postgres có advisory lock theo tài liệu).
 * Câu lạ -> ném lỗi để test phát hiện truy vấn chưa được giả lập.
 * File bắt đầu bằng "_" nên Vercel không coi là một hàm API.
 */

function createMemSql(opts = {}) {
  const hash = v => crypto.createHash('sha256').update(`SALT_BNGUA_${v}`).digest('hex');
  const defaultUsers = new Map([
    ['admin', { username: 'admin', password_hash: hash('55555'), status: 'Active', data: { username: 'admin', fullname: 'Quản Trị Viên (Admin)', email: 'admin@bngua.com', role: 'Admin', status: 'Active' } }],
    ['thanhhuy3181', { username: 'thanhhuy3181', password_hash: hash('55555'), status: 'Active', data: { username: 'thanhhuy3181', fullname: 'Thanh Huy (Admin)', email: 'thanhhuy3181@gmail.com', role: 'Admin', status: 'Active' } }],
    ['huycoi5', { username: 'huycoi5', password_hash: hash('55555'), status: 'Active', data: { username: 'huycoi5', fullname: 'Huy Còi (Tester)', email: 'huycoi5@gmail.com', role: 'CBGS', status: 'Active' } }]
  ]);
  const state = {
    users: opts.users || defaultUsers,       // username -> { username, status, data }
    sessions: opts.sessions || new Map(), // token -> { username, expires_at: Date }
    docs: opts.docs || new Map(),         // id -> doc row
    blobs: opts.blobs || new Map(),       // doc_id -> { annos_json, comments_json, updated_by, updated_at }
    annos: new Map(),                     // `${doc}\u0000${id}` -> row
    presence: new Map(),                  // `${doc}\u0000${user}\u0000${client}` -> row
    requests: new Map(),                  // id -> row
    uploads: new Map(),                   // id -> row
    rev: 0,
    log: []
  };
  const latency = opts.latencyMs || 0;
  const now = () => new Date(opts.clock ? opts.clock() : Date.now());
  const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const toBool = v => v === true || v === 'true' || v === 't';
  const permsOf = d => (Array.isArray(d.permissions_json) ? d.permissions_json : (typeof d.permissions_json === 'string' ? JSON.parse(d.permissions_json || '[]') : []));

  function run(text, v) {
    const t = text.replace(/\s+/g, ' ').trim();
    const tag = (/^\/\*q:([a-z_]+)\*\//.exec(t) || [])[1];
    state.log.push(tag || t.slice(0, 60));

    if (!tag) {
      if (/^(CREATE|ALTER|DO )/i.test(t)) return [];
      if (/FROM bqlda_sessions s JOIN bqlda_users u/.test(t)) {
        const s = state.sessions.get(v[0]);
        if (!s || !(s.expires_at > now())) return [];
        const u = state.users.get(s.username);
        return u ? [clone(u)] : [];
      }
      if (/FROM bqlda_users WHERE (lower\(username\)=|lower\(data->>'email'\)=)/.test(t)) {
        const id = String(v[0] || v[1] || '').trim().toLowerCase();
        for (const u of state.users.values()) {
          const email = (u.data?.email || '').toLowerCase();
          if (u.username.toLowerCase() === id || email === id) return [clone(u)];
        }
        return [];
      }
      if (/^INSERT INTO bqlda_users/.test(t)) {
        const uObj = { username: v[0], password_hash: v[1], status: v[2], data: typeof v[3] === 'string' ? JSON.parse(v[3]) : v[3] };
        state.users.set(v[0], uObj);
        return [];
      }
      if (/^UPDATE bqlda_users SET/.test(t)) {
        const emailHit = (/lower\(data->>'email'\)='([^']+)'/.exec(t) || [])[1];
        if (emailHit) {
          for (const u of state.users.values()) {
            if ((u.data?.email || '').toLowerCase() === emailHit.toLowerCase()) {
              u.status = 'Active';
              if (/Admin/.test(t)) u.data.role = 'Admin';
            }
          }
        }
        return [];
      }
      if (/^INSERT INTO bqlda_sessions/.test(t)) {
        state.sessions.set(v[0], { username: v[1], expires_at: new Date(Date.now() + 30 * 86400000) });
        return [];
      }
      if (/^DELETE FROM bqlda_sessions/.test(t)) {
        if (v && v[0]) state.sessions.delete(v[0]);
        return [];
      }
      if (/SELECT username,status,data,updated_at FROM bqlda_users/.test(t)) {
        return [...state.users.values()].map(clone);
      }
      if (/^SELECT \* FROM bqlda_pdf_docs WHERE id=/.test(t)) {
        const d = state.docs.get(v[0]);
        return d ? [clone(d)] : [];
      }
      if (/^SELECT \* FROM bqlda_pdf_docs ORDER BY/.test(t)) return [...state.docs.values()].map(clone);
      if (/^UPDATE bqlda_pdf_docs SET permissions_json=/.test(t)) {
        const d = state.docs.get(v[1]);
        if (d) { d.permissions_json = JSON.parse(v[0]); d.updated_at = now(); }
        return [];
      }
      if (/^UPDATE bqlda_pdf_docs SET updated_at=now\(\) WHERE id=/.test(t)) return [];
      if (/^SELECT \* FROM bqlda_pdf_annos WHERE doc_id=/.test(t)) {
        const b = state.blobs.get(v[0]);
        return b ? [{ doc_id: v[0], ...clone(b) }] : [];
      }
      if (/^INSERT INTO bqlda_pdf_annos .* ON CONFLICT \(doc_id\) DO UPDATE/.test(t)) {
        state.blobs.set(v[0], { annos_json: JSON.parse(v[1]), comments_json: JSON.parse(v[2]), updated_by: v[3], updated_at: now() });
        return [];
      }
      throw new Error('memsql: truy vấn chưa được giả lập: ' + t.slice(0, 120));
    }

    switch (tag) {
      case 'anno_upsert': {
        const [, itemsJson, docId, me, , editAll] = v;
        const out = [];
        for (const it of JSON.parse(itemsJson)) {
          const key = docId + '\u0000' + it.id;
          const rev = ++state.rev; // nextval tiêu thụ cả khi bị từ chối (như Postgres)
          const cur = state.annos.get(key);
          if (cur && !(toBool(editAll) || cur.created_by === me)) continue;
          const row = cur
            ? { ...cur, page: it.page, data: clone(it.data), updated_by: me, updated_at: now(), rev, deleted: false }
            : { doc_id: docId, id: it.id, page: it.page, data: clone(it.data), created_by: me, updated_by: me, updated_at: now(), rev, deleted: false };
          state.annos.set(key, row);
          out.push({ id: row.id, rev: String(row.rev), updated_at: row.updated_at });
        }
        return out;
      }
      case 'anno_delete': {
        const [, me, docId, idsJson, editAll, me2] = v;
        const out = [];
        for (const id of JSON.parse(idsJson)) {
          const row = state.annos.get(docId + '\u0000' + id);
          if (!row || row.deleted || !(toBool(editAll) || row.created_by === me2)) continue;
          Object.assign(row, { deleted: true, updated_by: me, updated_at: now(), rev: ++state.rev });
          out.push({ id, rev: String(row.rev), updated_at: row.updated_at });
        }
        return out;
      }
      case 'anno_import_legacy': {
        const docId = v[1];
        const owner = v[4];
        if ([...state.annos.values()].some(r => r.doc_id === docId)) return [];
        const b = state.blobs.get(docId);
        if (!b) return [];
        const pageOf = e => (/^[0-9]{1,6}$/.test(String(e.page ?? '')) ? Math.max(Number(e.page), 1) : 1);
        const src = [];
        (Array.isArray(b.annos_json) ? b.annos_json : []).forEach((e, i) => {
          if (e && typeof e === 'object' && !Array.isArray(e)) src.push({ id: e.id || 'legacy_a' + (i + 1), page: pageOf(e), data: e });
        });
        (Array.isArray(b.comments_json) ? b.comments_json : []).forEach((e, i) => {
          if (e && typeof e === 'object' && !Array.isArray(e)) src.push({ id: e.id || 'legacy_c' + (i + 1), page: pageOf(e), data: { ...e, _legacy_kind: 'comment' } });
        });
        for (const s of src) {
          const key = docId + '\u0000' + s.id;
          if (state.annos.has(key)) continue;
          state.annos.set(key, { doc_id: docId, id: String(s.id), page: s.page, data: clone(s.data), created_by: owner, updated_by: owner, updated_at: now(), rev: ++state.rev, deleted: false });
        }
        return [];
      }
      case 'anno_changes': {
        const [docId, since, , limit] = v;
        const s = Number(since);
        return [...state.annos.values()]
          .filter(r => r.doc_id === docId && r.rev > s && (s > 0 || !r.deleted))
          .sort((a, b) => a.rev - b.rev)
          .slice(0, Number(limit))
          .map(r => ({ ...clone(r), rev: String(r.rev), updated_at: r.updated_at }));
      }
      case 'presence_upsert': {
        const [docId, me, clientId, fullname, stateJson] = v;
        state.presence.set([docId, me, clientId].join('\u0000'), { doc_id: docId, username: me, client_id: clientId, fullname, state: JSON.parse(stateJson), last_seen: now() });
        return [];
      }
      case 'presence_gc': {
        const cut = now().getTime() - 10 * 60 * 1000;
        for (const [k, r] of state.presence) if (r.last_seen.getTime() < cut) state.presence.delete(k);
        return [];
      }
      case 'presence_list': {
        const [docId, ttl] = v;
        const cut = now().getTime() - Number(ttl) * 1000;
        return [...state.presence.values()]
          .filter(r => r.doc_id === docId && r.last_seen.getTime() > cut)
          .sort((a, b) => (a.username + a.client_id).localeCompare(b.username + b.client_id))
          .map(clone);
      }
      case 'presence_leave': {
        state.presence.delete(v.join('\u0000'));
        return [];
      }
      case 'access_upsert': {
        const [id, docId, me, role, message] = v;
        const pending = [...state.requests.values()].find(r => r.doc_id === docId && r.requester === me && r.status === 'pending');
        if (pending) {
          Object.assign(pending, { requested_role: role, message, created_at: now() });
          return [clone(pending)];
        }
        const row = { id, doc_id: docId, requester: me, requested_role: role, message, status: 'pending', decided_by: null, decided_role: null, decided_at: null, created_at: now() };
        state.requests.set(id, row);
        return [clone(row)];
      }
      case 'access_mine': {
        const [docId, me] = v;
        return [...state.requests.values()].filter(r => r.doc_id === docId && r.requester === me)
          .sort((a, b) => b.created_at - a.created_at).slice(0, 1).map(clone);
      }
      case 'access_list_doc':
      case 'access_list_owner': {
        const pick = tag === 'access_list_doc'
          ? r => r.doc_id === v[0]
          : r => toBool(v[0]) || (state.docs.get(r.doc_id) || {}).owner_username === v[1];
        return [...state.requests.values()]
          .filter(r => r.status === 'pending' && state.docs.has(r.doc_id) && pick(r))
          .map(r => {
            const u = state.users.get(r.requester);
            const data = u ? (typeof u.data === 'string' ? JSON.parse(u.data) : u.data) : {};
            return { ...clone(r), doc_title: state.docs.get(r.doc_id).title, requester_fullname: data.fullname ?? null, requester_email: data.email ?? null };
          });
      }
      case 'access_get': {
        const r = state.requests.get(v[0]);
        return r ? [clone(r)] : [];
      }
      case 'access_approve': {
        const [me, role, reqId] = v;
        const r = state.requests.get(reqId);
        if (!r || r.status !== 'pending') return [];
        Object.assign(r, { status: 'approved', decided_by: me, decided_role: role, decided_at: now() });
        const d = state.docs.get(r.doc_id);
        let perms = null;
        if (d) {
          perms = permsOf(d).filter(p => p && p.username !== r.requester).concat([{ username: r.requester, role }]);
          d.permissions_json = perms;
          d.updated_at = now();
        }
        return [{ ...clone(r), permissions_json: clone(perms) }];
      }
      case 'access_reject': {
        const [me, reqId] = v;
        const r = state.requests.get(reqId);
        if (!r || r.status !== 'pending') return [];
        Object.assign(r, { status: 'rejected', decided_by: me, decided_at: now() });
        return [clone(r)];
      }
      case 'upload_insert': {
        const [id, me, title, folderName, folderId, sessionUri, size, pageCount, scaleRatio] = v;
        state.uploads.set(id, { id, username: me, title, folder_name: folderName, folder_id: folderId, session_uri: sessionUri, file_size: String(size), page_count: pageCount, scale_ratio: scaleRatio, status: 'pending', drive_file_id: null, doc_id: null, created_at: now() });
        return [];
      }
      case 'upload_get': {
        const u = state.uploads.get(v[0]);
        return u && u.username === v[1] ? [clone(u)] : [];
      }
      case 'upload_set_status': {
        const [status, id, me] = v;
        const u = state.uploads.get(id);
        if (!u || u.username !== me || u.status !== 'pending') return [];
        u.status = status;
        return [{ id }];
      }
      case 'upload_complete': {
        const [fileId, docId, uid, me] = v;
        const u = state.uploads.get(uid);
        if (!u || u.username !== me || u.status !== 'pending') return [];
        Object.assign(u, { status: 'done', drive_file_id: fileId, doc_id: docId });
        const doc = { id: docId, title: u.title, drive_file_id: fileId, folder_name: u.folder_name, owner_username: u.username, file_size: u.file_size, page_count: u.page_count, scale_ratio: u.scale_ratio, permissions_json: [{ username: u.username, role: 'Chủ sở hữu' }], updated_at: now() };
        state.docs.set(docId, doc);
        return [clone(doc)];
      }
      default:
        throw new Error('memsql: nhãn chưa được giả lập: ' + tag);
    }
  }

  async function sql(strings, ...values) {
    if (latency) await new Promise(r => setTimeout(r, Math.random() * latency));
    return run(strings.join('?'), values);
  }
  sql.query = async (text, params = []) => {
    if (latency) await new Promise(r => setTimeout(r, Math.random() * latency));
    return run(text, params);
  };
  sql.state = state;
  return sql;
}

module.exports = { createMemSql };
