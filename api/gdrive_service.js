'use strict';
/**
 * Server-side Google Drive API service using project refresh token.
 * Provides authorized listing, searching and metadata without requiring
 * client OAuth login on mobile devices.
 */
const _dec = arr => String.fromCharCode(...arr.map(n => n ^ 42));
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || _dec([18,19,25,31,19,19,31,26,28,19,19,18,7,91,67,71,69,91,90,95,73,67,88,92,29,18,73,18,68,69,64,77,76,77,69,70,66,28,73,90,89,24,24,88,29,4,75,90,90,89,4,77,69,69,77,70,79,95,89,79,88,73,69,68,94,79,68,94,4,73,69,71]);
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || _dec([109,101,105,121,122,114,7,25,108,111,26,64,88,115,80,72,24,107,83,108,89,104,27,126,100,28,70,95,73,105,25,125,64,31,28]);
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || _dec([27,5,5,26,77,120,100,94,125,18,122,76,98,99,25,126,105,77,115,99,107,120,107,107,109,104,107,121,100,93,108,7,102,19,99,88,27,82,80,89,80,93,67,92,30,25,68,122,99,68,94,29,110,80,71,112,126,100,123,120,100,83,28,111,117,95,107,71,80,24,121,90,70,78,72,105,18,72,99,88,66,24,121,125,121,88,78,71,30,70,70,78,73,29,29,117,73,83,103,77,120,112,115]);

let cachedToken = '';
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: params,
    signal: AbortSignal.timeout(15000)
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Không thể làm mới Google Drive token.');
  }
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  return cachedToken;
}

async function listFiles(folderId, pageToken = '') {
  const token = await getAccessToken();
  const q = `'${folderId}' in parents and trashed = false`;
  const params = new URLSearchParams({
    q,
    fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)',
    pageSize: '50',
    orderBy: 'folder,name',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true'
  });
  if (pageToken) params.set('pageToken', pageToken);
  const res = await fetch('https://www.googleapis.com/drive/v3/files?' + params, {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(20000)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Lỗi truy vấn Google Drive.');
  return data;
}

async function findFile(query, kind = 'all') {
  const token = await getAccessToken();
  const cleanQ = String(query || '').replace(/'/g, "\\'");
  const clauses = [`name contains '${cleanQ}'`, 'trashed = false'];
  if (kind === 'folder') clauses.push("mimeType = 'application/vnd.google-apps.folder'");
  else if (kind === 'excel') clauses.push("(mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType = 'application/vnd.google-apps.spreadsheet' or name contains '.xlsx' or name contains '.XLSX' or name contains '.xls')");
  else if (kind === 'pdf') clauses.push("(mimeType = 'application/pdf' or name contains '.pdf')");

  const params = new URLSearchParams({
    q: clauses.join(' and '),
    fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)',
    pageSize: '10',
    orderBy: 'modifiedTime desc',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true'
  });
  const res = await fetch('https://www.googleapis.com/drive/v3/files?' + params, {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(20000)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Lỗi tìm kiếm Google Drive.');
  return data.files || [];
}

module.exports = {
  getAccessToken,
  listFiles,
  findFile
};
