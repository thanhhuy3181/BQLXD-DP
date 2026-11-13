-- PDF QLDA: lược đồ cộng tác (H: ghi chú từng dòng + hiện diện, G: xin quyền, F: tải lên tiếp nối).
-- Idempotent: chạy lại nhiều lần không sao (IF NOT EXISTS). Không xoá/sửa dữ liệu cũ.
-- Yêu cầu có sẵn bảng bqlda_pdf_docs (api/pdf_rpc.js tự tạo khi khởi động).
-- Nguồn: api/_pdf_schema.js (ensureDb chạy cùng các câu này). scripts/test-pdf-rpc.cjs kiểm tra hai nơi khớp nhau.
-- Dữ liệu annos_json/comments_json cũ được nhập tự động, một lần cho mỗi tài liệu, khi gọi anno_changes since=0.
-- Chạy: psql "$DATABASE_URL" -f scripts/migrate-pdf-collab.sql  (hoặc dán vào Neon SQL Editor).

BEGIN;
CREATE SEQUENCE IF NOT EXISTS bqlda_pdf_anno_rev_seq;

CREATE TABLE IF NOT EXISTS bqlda_pdf_anno_items (
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
  );

CREATE INDEX IF NOT EXISTS bqlda_pdf_anno_items_doc_rev ON bqlda_pdf_anno_items (doc_id, rev);

CREATE TABLE IF NOT EXISTS bqlda_pdf_presence (
    doc_id text NOT NULL,
    username text NOT NULL,
    client_id text NOT NULL,
    fullname text,
    state jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_seen timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (doc_id, username, client_id)
  );

CREATE INDEX IF NOT EXISTS bqlda_pdf_presence_doc_seen ON bqlda_pdf_presence (doc_id, last_seen);

CREATE TABLE IF NOT EXISTS bqlda_pdf_access_requests (
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
  );

CREATE UNIQUE INDEX IF NOT EXISTS bqlda_pdf_access_requests_one_pending ON bqlda_pdf_access_requests (doc_id, requester) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS bqlda_pdf_access_requests_doc_status ON bqlda_pdf_access_requests (doc_id, status);

CREATE TABLE IF NOT EXISTS bqlda_pdf_uploads (
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
  );

CREATE INDEX IF NOT EXISTS bqlda_pdf_uploads_user ON bqlda_pdf_uploads (username, status);

COMMIT;
