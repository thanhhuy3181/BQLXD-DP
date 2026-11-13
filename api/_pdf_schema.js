'use strict';
/**
 * Lược đồ cộng tác của PDF QLDA (idempotent). Dùng chung cho:
 *  - ensureDb() trong api/pdf_rpc.js (chạy trong một khối DO khi khởi động lạnh),
 *  - scripts/migrate-pdf-collab.sql (chạy tay bằng psql / Neon SQL editor).
 * File bắt đầu bằng "_" nên Vercel không coi là một hàm API.
 */
const COLLAB_SCHEMA_STATEMENTS = [
  // H. Ghi chú: mỗi ghi chú một dòng; rev tăng đơn điệu (dùng cho changes since=<rev>).
  `CREATE SEQUENCE IF NOT EXISTS bqlda_pdf_anno_rev_seq`,
  `CREATE TABLE IF NOT EXISTS bqlda_pdf_anno_items (
    doc_id text NOT NULL REFERENCES bqlda_pdf_docs(id) ON DELETE CASCADE,
    id text NOT NULL,
    page int NOT NULL DEFAULT 1,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by text NOT NULL,
    updated_by text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    rev bigint NOT NULL,
    deleted boolean NOT NULL DEFAULT false,
    PRIMARY KEY (doc_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS bqlda_pdf_anno_items_doc_rev ON bqlda_pdf_anno_items (doc_id, rev)`,

  // H. Hiện diện: ai đang mở tài liệu (nhịp tim, hết hạn sau 30 giây).
  `CREATE TABLE IF NOT EXISTS bqlda_pdf_presence (
    doc_id text NOT NULL,
    username text NOT NULL,
    client_id text NOT NULL,
    fullname text,
    state jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_seen timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (doc_id, username, client_id)
  )`,
  `CREATE INDEX IF NOT EXISTS bqlda_pdf_presence_doc_seen ON bqlda_pdf_presence (doc_id, last_seen)`,

  // G. Xin quyền.
  `CREATE TABLE IF NOT EXISTS bqlda_pdf_access_requests (
    id text PRIMARY KEY,
    doc_id text NOT NULL REFERENCES bqlda_pdf_docs(id) ON DELETE CASCADE,
    requester text NOT NULL,
    requested_role text NOT NULL DEFAULT 'Người xem',
    message text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'pending',
    decided_by text,
    decided_role text,
    decided_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS bqlda_pdf_access_requests_one_pending ON bqlda_pdf_access_requests (doc_id, requester) WHERE status = 'pending'`,
  `CREATE INDEX IF NOT EXISTS bqlda_pdf_access_requests_doc_status ON bqlda_pdf_access_requests (doc_id, status)`,

  // F. Phiên tải lên tiếp nối (resumable) của Google Drive. session_uri chỉ nằm ở máy chủ
  // sau khi tạo; trình duyệt nhận URI một lần để gửi khúc, không nhận token Drive.
  `CREATE TABLE IF NOT EXISTS bqlda_pdf_uploads (
    id text PRIMARY KEY,
    username text NOT NULL,
    title text NOT NULL,
    folder_name text NOT NULL,
    folder_id text NOT NULL,
    session_uri text NOT NULL,
    file_size bigint NOT NULL,
    page_count int NOT NULL DEFAULT 1,
    scale_ratio text NOT NULL DEFAULT '1:100',
    status text NOT NULL DEFAULT 'pending',
    drive_file_id text,
    doc_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '6 days'
  )`,
  `CREATE INDEX IF NOT EXISTS bqlda_pdf_uploads_user ON bqlda_pdf_uploads (username, status)`
];

module.exports = { COLLAB_SCHEMA_STATEMENTS };
