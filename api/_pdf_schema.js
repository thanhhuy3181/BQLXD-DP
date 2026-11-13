'use strict';
/**
 * Lược đồ PDF QLDA trên Cloudflare D1 (SQLite). Mọi câu đều idempotent (IF NOT EXISTS).
 * Quy ước thời gian: mọi cột thời điểm là INTEGER mili-giây (Date.now()).
 * Quy ước JSON: mọi cột *_json là TEXT chứa JSON.
 * Dùng bởi api/pdf_rpc.js (ensureDb). File bắt đầu bằng "_" nên Vercel không coi là hàm API.
 */

// Bảng lõi (người dùng, phiên, cài đặt, tài liệu, ghi chú, tuỳ chọn).
const CORE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS bqlda_users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS bqlda_sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL REFERENCES bqlda_users(username) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS bqlda_sessions_user ON bqlda_sessions (username)`,
  `CREATE TABLE IF NOT EXISTS bqlda_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS bqlda_pdf_docs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    drive_file_id TEXT,
    folder_name TEXT DEFAULT 'Chung',
    owner_username TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    page_count INTEGER DEFAULT 1,
    scale_ratio TEXT DEFAULT '1:100',
    permissions_json TEXT DEFAULT '[]',
    updated_at INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS bqlda_pdf_annos (
    doc_id TEXT PRIMARY KEY,
    annos_json TEXT NOT NULL DEFAULT '[]',
    comments_json TEXT NOT NULL DEFAULT '[]',
    updated_by TEXT,
    updated_at INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS bqlda_pdf_prefs (
    username TEXT PRIMARY KEY,
    ribbon_json TEXT DEFAULT '{}',
    recent_colors_json TEXT DEFAULT '[]',
    pick_json TEXT DEFAULT '{}',
    updated_at INTEGER NOT NULL DEFAULT 0
  )`,
];

// Bảng cộng tác (ghi chú từng dòng, hiện diện, xin quyền, phiên tải lên).
const COLLAB_SCHEMA_STATEMENTS = [
  // Bộ đếm rev cho ghi chú (thay SEQUENCE của Postgres): một dòng cho mỗi bộ đếm.
  `CREATE TABLE IF NOT EXISTS bqlda_pdf_counters (
    name TEXT PRIMARY KEY,
    val INTEGER NOT NULL
  )`,
  `INSERT OR IGNORE INTO bqlda_pdf_counters (name, val) VALUES ('anno_rev', 0)`,

  // H. Ghi chú: mỗi ghi chú một dòng; rev tăng đơn điệu (dùng cho anno_changes since=<rev>).
  `CREATE TABLE IF NOT EXISTS bqlda_pdf_anno_items (
    doc_id TEXT NOT NULL REFERENCES bqlda_pdf_docs(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    page INTEGER NOT NULL DEFAULT 1,
    data TEXT NOT NULL DEFAULT '{}',
    created_by TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0,
    rev INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (doc_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS bqlda_pdf_anno_items_doc_rev ON bqlda_pdf_anno_items (doc_id, rev)`,

  // H. Hiện diện: ai đang mở tài liệu (nhịp tim; hết hạn sau 30 giây khi đọc).
  `CREATE TABLE IF NOT EXISTS bqlda_pdf_presence (
    doc_id TEXT NOT NULL,
    username TEXT NOT NULL,
    client_id TEXT NOT NULL,
    fullname TEXT,
    state TEXT NOT NULL DEFAULT '{}',
    last_seen INTEGER NOT NULL,
    PRIMARY KEY (doc_id, username, client_id)
  )`,
  `CREATE INDEX IF NOT EXISTS bqlda_pdf_presence_doc_seen ON bqlda_pdf_presence (doc_id, last_seen)`,

  // G. Xin quyền.
  `CREATE TABLE IF NOT EXISTS bqlda_pdf_access_requests (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL REFERENCES bqlda_pdf_docs(id) ON DELETE CASCADE,
    requester TEXT NOT NULL,
    requested_role TEXT NOT NULL DEFAULT 'Người xem',
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    decided_by TEXT,
    decided_role TEXT,
    decided_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS bqlda_pdf_access_requests_one_pending ON bqlda_pdf_access_requests (doc_id, requester) WHERE status = 'pending'`,
  `CREATE INDEX IF NOT EXISTS bqlda_pdf_access_requests_doc_status ON bqlda_pdf_access_requests (doc_id, status)`,

  // F. Phiên tải lên tiếp nối (resumable) của Google Drive. session_uri chỉ nằm ở máy chủ.
  `CREATE TABLE IF NOT EXISTS bqlda_pdf_uploads (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    title TEXT NOT NULL,
    folder_name TEXT NOT NULL,
    folder_id TEXT NOT NULL,
    session_uri TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    page_count INTEGER NOT NULL DEFAULT 1,
    scale_ratio TEXT NOT NULL DEFAULT '1:100',
    status TEXT NOT NULL DEFAULT 'pending',
    drive_file_id TEXT,
    doc_id TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS bqlda_pdf_uploads_user ON bqlda_pdf_uploads (username, status)`,
];

module.exports = { CORE_SCHEMA_STATEMENTS, COLLAB_SCHEMA_STATEMENTS };
