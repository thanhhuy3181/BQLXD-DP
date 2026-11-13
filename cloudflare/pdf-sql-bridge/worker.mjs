// Cầu nối SQL cho PDF QLDA: nhận câu lệnh SQL từ api/_d1sql.js (Vercel) và chạy trên D1 `qlda_pdf`.
// Bảo mật: chỉ nhận POST /internal/sql kèm "Authorization: Bearer <SQL_TOKEN>" (secret của Worker).
// Triển khai (chạy tay, cần đăng nhập Cloudflare):
//   npx wrangler deploy --config cloudflare/pdf-sql-bridge/wrangler.toml
//   npx wrangler secret put SQL_TOKEN --config cloudflare/pdf-sql-bridge/wrangler.toml
// Sau đó trên Vercel đặt PDF_SQL_URL = URL của Worker, PDF_SQL_TOKEN = cùng giá trị secret.

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/internal/sql') {
      return json({ ok: false, error: 'Không tìm thấy' }, 404);
    }
    const auth = request.headers.get('authorization') || '';
    if (!env.SQL_TOKEN || !sameSecret(auth, `Bearer ${env.SQL_TOKEN}`)) {
      return json({ ok: false, error: 'Không được phép' }, 401);
    }
    let body;
    try { body = await request.json(); } catch (_) { return json({ ok: false, error: 'JSON không hợp lệ' }, 400); }
    if (!body || typeof body.q !== 'string' || !body.q.trim()) return json({ ok: false, error: 'Thiếu câu lệnh' }, 400);
    const params = Array.isArray(body.p) ? body.p : [];
    try {
      const out = await env.DB.prepare(body.q).bind(...params).all();
      return json({ ok: true, rows: out.results || [] });
    } catch (err) {
      return json({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
    }
  },
};
