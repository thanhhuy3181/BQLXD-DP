/**
 * DriveEngine.js - Google Drive OAuth2 & API Integration
 * Uses Google Identity Services (GIS) + Drive API v3 via fetch()
 * No backend needed - pure browser OAuth implicit flow
 */

const DriveEngine = {
  CLIENT_ID_KEY: 'bqlda_gdrive_client_id',
  ACCOUNTS_KEY: 'bqlda_gdrive_oauth_accounts',

  // ─── Client ID (stored in localStorage) ───────────────────────
  get clientId() { return localStorage.getItem(this.CLIENT_ID_KEY) || ''; },
  setClientId(v) { localStorage.setItem(this.CLIENT_ID_KEY, v.trim()); },

  // ─── OAuth Account Storage ─────────────────────────────────────
  getOAuthAccounts() {
    try { return JSON.parse(localStorage.getItem(this.ACCOUNTS_KEY) || '[]'); }
    catch { return []; }
  },

  saveOAuthAccounts() {
    const oauths = MASTER_DATA.driveAccounts.filter(a => a.oauthConnected);
    localStorage.setItem(this.ACCOUNTS_KEY, JSON.stringify(oauths));
  },

  /** Merge saved OAuth accounts into MASTER_DATA on page load */
  loadSaved() {
    const saved = this.getOAuthAccounts();
    saved.forEach(acc => {
      const idx = MASTER_DATA.driveAccounts.findIndex(a => a.id === acc.id);
      if (idx >= 0) MASTER_DATA.driveAccounts[idx] = acc;
      else MASTER_DATA.driveAccounts.push(acc);
    });
  },

  // ─── OAuth Connect ─────────────────────────────────────────────
  connect(onSuccess, onError) {
    if (!this.clientId) {
      showToast('⚠️ Chưa nhập Google API Client ID! Vui lòng cấu hình trước.');
      if (onError) onError('no_client_id');
      return;
    }

    if (!window.google?.accounts?.oauth2) {
      showToast('⚠️ Thư viện Google chưa tải xong. Thử lại sau vài giây!');
      if (onError) onError('gis_not_ready');
      return;
    }

    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ].join(' '),
      callback: async (resp) => {
        if (resp.error) {
          showToast('❌ Đăng nhập Google thất bại: ' + resp.error);
          if (onError) onError(resp.error);
          return;
        }
        const account = await this._processToken(resp);
        if (account && onSuccess) onSuccess(account);
      }
    });

    tokenClient.requestAccessToken({ prompt: 'select_account' });
  },

  /** Reconnect a specific account (no account picker shown if still signed in) */
  reconnect(accountId, onSuccess) {
    if (!this.clientId) {
      showToast('⚠️ Chưa nhập Google API Client ID!');
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      showToast('⚠️ Thư viện Google chưa tải xong!');
      return;
    }

    const acc = MASTER_DATA.driveAccounts.find(a => a.id === accountId);
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ].join(' '),
      hint: acc?.email || '',
      callback: async (resp) => {
        if (resp.error) { showToast('❌ ' + resp.error); return; }
        const updated = await this._processToken(resp, accountId);
        if (updated && onSuccess) onSuccess(updated);
      }
    });
    tokenClient.requestAccessToken({ prompt: '' });
  },

  /** Exchange token for user info & update MASTER_DATA */
  async _processToken(tokenResp, existingId = null) {
    const token = tokenResp.access_token;
    const expiresIn = parseInt(tokenResp.expires_in || 3600, 10);

    try {
      // 1. Get user profile
      const userResp = await fetch('https://www.googleapis.com/userinfo/v2/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!userResp.ok) throw new Error('Failed to fetch user info');
      const user = await userResp.json();

      // 2. Get Drive storage quota
      let storage = 'N/A';
      try {
        const aboutResp = await fetch(
          'https://www.googleapis.com/drive/v3/about?fields=storageQuota',
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (aboutResp.ok) {
          const about = await aboutResp.json();
          const q = about.storageQuota || {};
          const used = q.usage ? (q.usage / 1e9).toFixed(1) + ' GB' : '?';
          const limit = q.limit ? (q.limit / 1e9).toFixed(0) + ' GB' : 'Không giới hạn';
          storage = `${used} / ${limit}`;
        }
      } catch {}

      const account = {
        id: existingId || ('ACC-' + user.id),
        email: user.email,
        name: user.name,
        picture: user.picture,
        owner: user.name,
        token: token,
        expiry: Date.now() + expiresIn * 1000,
        storage,
        status: 'active',
        oauthConnected: true
      };

      // Upsert into MASTER_DATA.driveAccounts
      const idx = MASTER_DATA.driveAccounts.findIndex(
        a => a.id === account.id || a.email === user.email
      );
      if (idx >= 0) {
        MASTER_DATA.driveAccounts[idx] = { ...MASTER_DATA.driveAccounts[idx], ...account };
      } else {
        MASTER_DATA.driveAccounts.push(account);
      }

      this.saveOAuthAccounts();
      showToast(`✅ Đã kết nối: ${user.email}`);
      return account;
    } catch (e) {
      showToast('❌ Lỗi xử lý token: ' + e.message);
      return null;
    }
  },

  // ─── Token helpers ─────────────────────────────────────────────
  getToken(accountId) {
    const acc = MASTER_DATA.driveAccounts.find(a => a.id === accountId);
    if (!acc || !acc.token) return null;
    if (acc.expiry && Date.now() >= acc.expiry) return null; // expired
    return acc.token;
  },

  isConnected(accountId) {
    const acc = MASTER_DATA.driveAccounts.find(a => a.id === accountId);
    return !!(acc?.oauthConnected && this.getToken(accountId));
  },

  getTokenStatus(accountId) {
    const acc = MASTER_DATA.driveAccounts.find(a => a.id === accountId);
    if (!acc?.oauthConnected) return 'manual'; // manual entry, no token
    const token = this.getToken(accountId);
    if (!token) return 'expired';
    const minsLeft = Math.round((acc.expiry - Date.now()) / 60000);
    return `valid:${minsLeft}`;
  },

  // ─── Drive API: List Folders ────────────────────────────────────
  async listFolders(accountId, parentId = 'root') {
    const token = this.getToken(accountId);
    if (!token) throw new Error('NO_TOKEN');

    const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&orderBy=name&pageSize=100`;

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error?.message || 'Drive API error');
    }

    const data = await resp.json();
    return data.files || [];
  },

  // ─── Drive API: List All Files in Folder ───────────────────────
  async listFiles(accountId, folderId) {
    const token = this.getToken(accountId);
    if (!token) return [];

    const q = `'${folderId}' in parents and trashed=false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,modifiedTime)&orderBy=folder,name&pageSize=100`;

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!resp.ok) return [];
    const data = await resp.json();
    return data.files || [];
  }
};

// ─── Initialize on page load ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    DriveEngine.loadSaved();
  }, 800);
});

window.DriveEngine = DriveEngine;
