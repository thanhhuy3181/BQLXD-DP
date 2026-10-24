'use strict';
// Web Push (RFC 8030/8291/8292) bằng node:crypto, không cần thư viện ngoài.
// File bắt đầu bằng "_" nên Vercel không tạo thành một Function riêng.
const crypto = require('crypto');

const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = str => Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

async function getVapid(sql) {
  const rows = await sql`SELECT value FROM bqlda_state WHERE key='awm:vapid'`;
  if (rows[0]?.value?.publicKey && rows[0]?.value?.privateJwk) return rows[0].value;
  const {publicKey, privateKey} = crypto.generateKeyPairSync('ec', {namedCurve: 'prime256v1'});
  const pubJwk = publicKey.export({format: 'jwk'});
  const raw = Buffer.concat([Buffer.from([4]), unb64u(pubJwk.x), unb64u(pubJwk.y)]);
  const value = {publicKey: b64u(raw), privateJwk: privateKey.export({format: 'jwk'}), created_at: new Date().toISOString()};
  await sql`INSERT INTO bqlda_state(key,value) VALUES('awm:vapid',${JSON.stringify(value)}::jsonb) ON CONFLICT(key) DO NOTHING`;
  const again = await sql`SELECT value FROM bqlda_state WHERE key='awm:vapid'`;
  return again[0]?.value || value;
}

function vapidHeader(endpoint, vapid, subject = 'mailto:thanhhuy3181@gmail.com') {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({typ: 'JWT', alg: 'ES256'}));
  const claims = b64u(JSON.stringify({aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject}));
  const key = crypto.createPrivateKey({key: vapid.privateJwk, format: 'jwk'});
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), {key, dsaEncoding: 'ieee-p1363'});
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${vapid.publicKey}`;
}

function encrypt(subscription, payload) {
  const uaPublic = unb64u(subscription.keys.p256dh);
  const authSecret = unb64u(subscription.keys.auth);
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// Gửi tới mọi thiết bị đã đăng ký của user; tự xóa đăng ký hết hạn (404/410).
async function notifyUser(sql, username, message, fetchImpl = globalThis.fetch) {
  const key = `awm:push:${username}`;
  const rows = await sql`SELECT value FROM bqlda_state WHERE key=${key}`;
  const subs = Array.isArray(rows[0]?.value) ? rows[0].value : [];
  if (!subs.length) return {sent: 0};
  const vapid = await getVapid(sql);
  const payload = JSON.stringify(message).slice(0, 3000);
  const keep = []; let sent = 0;
  await Promise.all(subs.map(async sub => {
    try {
      const res = await fetchImpl(sub.endpoint, {method: 'POST', headers: {
        'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high',
        Authorization: vapidHeader(sub.endpoint, vapid)}, body: encrypt(sub, payload), signal: AbortSignal.timeout(8000)});
      if (res.status === 404 || res.status === 410) return;
      if (res.status < 300) sent++;
      keep.push(sub);
    } catch (e) { keep.push(sub); }
  }));
  if (keep.length !== subs.length) await sql`INSERT INTO bqlda_state(key,value) VALUES(${key},${JSON.stringify(keep)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;
  return {sent, devices: keep.length};
}

module.exports = {getVapid, vapidHeader, encrypt, notifyUser, b64u, unb64u};
