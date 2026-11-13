'use strict';
/**
 * Lớp truy vấn dùng chung cho PDF QLDA trên Cloudflare D1 (SQLite).
 * Giữ kiểu gọi sql`SELECT ... WHERE a=${x}` như trước (Neon), nhưng câu lệnh chạy trên:
 *  - D1 qua một Worker cầu nối: PDF_SQL_URL + PDF_SQL_TOKEN (sản xuất trên Vercel), hoặc
 *  - SQLite của Node (node:sqlite) qua sqlLocal(file): chạy thử trên máy và bộ kiểm.
 * Quy ước: JSON được ghi dưới dạng TEXT; cột tên *_json, data, value, state được tự parse khi đọc;
 * boolean -> 1/0; Date -> mili-giây; undefined -> null.
 * File bắt đầu bằng "_" nên Vercel không coi là một hàm API.
 */

const JSON_COLUMNS = new Set(['data', 'value', 'state', 'rec', 'device']);
const isJsonColumn = key => JSON_COLUMNS.has(key) || key.endsWith('_json');

const toParam = v => {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
};

const parseRow = row => {
  for (const key of Object.keys(row)) {
    if (isJsonColumn(key) && typeof row[key] === 'string') {
      try { row[key] = JSON.parse(row[key]); } catch { /* giữ nguyên chuỗi */ }
    }
  }
  return row;
};

// Tạo hàm tagged-template từ một hàm chạy câu lệnh run(query, params) -> Promise<rows>.
function makeSql(run) {
  const sql = (strings, ...values) => {
    let query = '';
    strings.forEach((s, i) => { query += s; if (i < values.length) query += '?'; });
    return run(query, values.map(toParam));
  };
  sql.raw = (query, params = []) => run(query, params.map(toParam));
  return sql;
}

// Gọi Worker cầu nối tới D1 (Vercel).
function httpRun(base, token) {
  return async (query, params) => {
    const res = await fetch(`${base.replace(/\/+$/, '')}/internal/sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ q: query, p: params }),
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) throw new Error(body.error || `Lỗi cơ sở dữ liệu (HTTP ${res.status})`);
    return (body.rows || []).map(parseRow);
  };
}

// SQLite của Node cho chạy thử cục bộ. ':memory:' hoặc đường dẫn file.
const localDbs = new Map();
function localDb(file) {
  if (!localDbs.has(file)) {
    const { DatabaseSync } = require('node:sqlite');
    if (file !== ':memory:') {
      const fs = require('fs'), path = require('path');
      fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    }
    localDbs.set(file, new DatabaseSync(file));
  }
  return localDbs.get(file);
}
function localRun(file) {
  return async (query, params) => {
    const stmt = localDb(file).prepare(query);
    return stmt.all(...params).map(parseRow);
  };
}

// Đã cấu hình Worker cầu nối? Trả về hàm sql, hoặc null khi chưa có CSDL.
function sqlFromEnv() {
  const base = process.env.PDF_SQL_URL, token = process.env.PDF_SQL_TOKEN;
  if (!base || !token) return null;
  return makeSql(httpRun(base, token));
}

function sqlLocal(file = ':memory:') {
  return makeSql(localRun(file));
}

function resetLocal(file) {
  const db = localDbs.get(file);
  if (db) { db.close(); localDbs.delete(file); }
}

module.exports = { makeSql, sqlFromEnv, sqlLocal, resetLocal, parseRow, toParam };
