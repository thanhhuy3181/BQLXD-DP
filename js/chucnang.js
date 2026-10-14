/**
 * chucnang.js — Tất cả các tính năng thuộc cụm "Chức năng" (B1 - B8, Downloader)
 */
'use strict';

const ChucNangModule = (function() {
  let _currentSubTab = 'cn-b1';
  let _chatHistory = [
    { sender: 'ai', text: 'Xin chào! Tôi là Trợ lý AI Bóc tách Hồ sơ Dự án. Bạn có thể huấn luyện quy tắc trích xuất văn bản hoặc kiểm thử mô hình tại đây.' }
  ];

  function init() {
    switchSubTab(_currentSubTab);
  }

  function switchSubTab(subId) {
    _currentSubTab = subId;
    document.querySelectorAll('.cn-subtab-pane').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(subId);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.cn-subtab-btn').forEach(btn => {
      if (btn.dataset.subtab === subId) {
        btn.classList.add('btn-primary', 'font-bold');
        btn.classList.remove('btn-ghost');
      } else {
        btn.classList.remove('btn-primary', 'font-bold');
        btn.classList.add('btn-ghost');
      }
    });

    if (subId === 'cn-b6') renderChat();
  }

  // ── B2: Cập nhật HSMT ──────────────────────────────────────────────────────
  async function selectB2Folder() {
    const res = await API.selectFolderDialog('Chọn thư mục chứa file Word HSMT');
    if (res.ok && res.data) {
      document.getElementById('b2-folder-input').value = res.data;
      await scanB2Files(res.data);
    }
  }

  async function scanB2Files(folder) {
    toast('Đang quét tệp Word HSMT...', 'info');
    const res = await API.scanFilesInFolder(folder, '.docx');
    const tbody = document.getElementById('b2-file-tbody');
    if (!tbody) return;
    if (res.ok && res.data.length > 0) {
      tbody.innerHTML = res.data.map((f, i) => `
        <tr class="hover text-xs">
          <td class="text-center font-medium">${i + 1}</td>
          <td class="font-bold text-primary">${escapeHtml(f.name)}</td>
          <td>${f.size_fmt}</td>
          <td><span class="badge badge-info badge-xs">Sẵn sàng bóc tách</span></td>
        </tr>
      `).join('');
      toast(`Tìm thấy ${res.data.length} tệp Word HSMT`, 'success');
    } else {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-base-content/50 text-xs">Không tìm thấy tệp .docx nào trong thư mục</td></tr>';
    }
  }

  // ── B3: Cập nhật HĐ ────────────────────────────────────────────────────────
  async function selectB3Folder() {
    const res = await API.selectFolderDialog('Chọn thư mục chứa file PDF Hợp đồng');
    if (res.ok && res.data) {
      document.getElementById('b3-folder-input').value = res.data;
      await scanB3Files(res.data);
    }
  }

  async function scanB3Files(folder) {
    toast('Đang quét tệp PDF Hợp đồng...', 'info');
    const res = await API.scanFilesInFolder(folder, '.pdf');
    const tbody = document.getElementById('b3-file-tbody');
    if (!tbody) return;
    if (res.ok && res.data.length > 0) {
      tbody.innerHTML = res.data.map((f, i) => `
        <tr class="hover text-xs">
          <td class="text-center font-medium">${i + 1}</td>
          <td class="font-bold text-primary">${escapeHtml(f.name)}</td>
          <td>${f.size_fmt}</td>
          <td><span class="badge badge-success badge-xs">Chưa kiểm tra chữ ký</span></td>
        </tr>
      `).join('');
      toast(`Tìm thấy ${res.data.length} tệp PDF Hợp đồng`, 'success');
    } else {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-base-content/50 text-xs">Không tìm thấy tệp .pdf nào trong thư mục</td></tr>';
    }
  }

  // ── B6: RÈN LUYỆN AI ───────────────────────────────────────────────────────
  function renderChat() {
    const container = document.getElementById('b6-chat-messages');
    if (!container) return;
    container.innerHTML = _chatHistory.map(m => `
      <div class="chat ${m.sender === 'user' ? 'chat-end' : 'chat-start'} text-xs">
        <div class="chat-header text-[10px] text-base-content/50 mb-0.5">${m.sender === 'user' ? 'Bạn' : 'Trợ lý AI'}</div>
        <div class="chat-bubble ${m.sender === 'user' ? 'chat-bubble-primary' : 'chat-bubble-neutral'} leading-relaxed">${escapeHtml(m.text)}</div>
      </div>
    `).join('');
    container.scrollTop = container.scrollHeight;
  }

  async function sendAiMessage() {
    const input = document.getElementById('b6-chat-input');
    if (!input || !input.value.trim()) return;
    const txt = input.value.trim();
    input.value = '';

    _chatHistory.push({ sender: 'user', text: txt });
    renderChat();

    const res = await API.runAiChat(txt, document.getElementById('ai-chat-provider')?.value || 'ollama');
    if (res.ok) {
      _chatHistory.push({ sender: 'ai', text: res.data.response });
    } else {
      _chatHistory.push({ sender: 'ai', text: 'Lỗi gọi AI: ' + res.error });
    }
    renderChat();
  }

  // ── B7: Tìm kiếm ───────────────────────────────────────────────────────────
  async function performB7Search() {
    const q = document.getElementById('b7-query-input')?.value.trim();
    if (!q) {
      toast('Vui lòng nhập từ khóa tìm kiếm!', 'warning');
      return;
    }
    const ext = document.getElementById('b7-ext-filter')?.value || '';
    toast('Đang tìm kiếm tệp tin trong hệ thống...', 'info');

    const res = await API.searchSystemFiles(q, document.getElementById('search-root')?.value.trim() || '', ext);
    const tbody = document.getElementById('b7-results-tbody');
    const countEl = document.getElementById('b7-count');
    if (!tbody) return;

    if (res.ok && res.data.length > 0) {
      if (countEl) countEl.textContent = `Tìm thấy ${res.data.length} tệp tin`;
      tbody.innerHTML = res.data.map((f, i) => `
        <tr class="hover text-xs">
          <td class="text-center font-medium">${i + 1}</td>
          <td>
            <div class="font-bold text-primary cursor-pointer hover:underline" onclick="API.openPath('${escapeAttr(f.path)}')">
              ${escapeHtml(f.name)}
            </div>
            <div class="text-[10px] text-base-content/60 truncate max-w-lg">${escapeHtml(f.path)}</div>
          </td>
          <td>${f.size_fmt}</td>
          <td>${f.mtime}</td>
          <td class="text-center">
            <button class="btn btn-ghost btn-xs text-primary" onclick="API.openPath('${escapeAttr(f.path)}')">Mở</button>
          </td>
        </tr>
      `).join('');
    } else {
      if (countEl) countEl.textContent = '0 tệp tin';
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-base-content/50 text-xs">Không tìm thấy tệp nào phù hợp từ khóa</td></tr>';
    }
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function escapeAttr(s) {
    if (!s) return '';
    return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  return {
    init,
    switchSubTab,
    selectB2Folder,
    selectB3Folder,
    sendAiMessage,
    performB7Search
  };
})();
