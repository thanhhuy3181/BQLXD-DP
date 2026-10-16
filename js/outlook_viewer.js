/**
 * outlook_viewer.js — Trình xem Thư điện tử Outlook Classic trên Desktop Web
 * Hiển thị đầy đủ 100%: From, To, Cc, Bcc, Subject, Date, Attachments, Body & Nested Emails
 */
'use strict';

const OutlookViewer = (function() {
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function linkify(text) {
    if (!text) return '';
    const safe = esc(text);
    const urlPattern = /(https?:\/\/[^\s<>"']+)/gi;
    return safe.replace(urlPattern, url => {
      let label = url;
      if (url.includes('drive.google.com')) label = '📁 Mở liên kết Google Drive ↗';
      else if (url.includes('smartsheet.com')) label = '📊 Mở bảng SmartSheet ↗';
      else if (url.includes('sharepoint.com') || url.includes('onedrive.com')) label = '📑 Mở tài liệu SharePoint ↗';
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#0078d4;text-decoration:underline;font-weight:600;word-break:break-all;">${label}</a>`;
    });
  }

  function formatSize(bytes) {
    const b = Number(bytes);
    if (!b || isNaN(b) || b <= 0) return '';
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function getAttIcon(name) {
    const ext = String(name || '').split('.').pop().toLowerCase();
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return '📊';
    if (ext === 'pdf') return '📑';
    if (ext === 'docx' || ext === 'doc') return '📝';
    if (ext === 'dwg' || ext === 'dxf') return '📐';
    if (ext === 'msg' || ext === 'eml') return '✉️';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return '🖼️';
    if (['zip', 'rar', '7z'].includes(ext)) return '📦';
    return '📎';
  }

  function getInitials(name) {
    if (!name) return 'V';
    const clean = String(name).replace(/\(.*?\)/g, '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  async function openMsg(fileName, fullPath) {
    const modal = document.getElementById('modal-outlook-msg');
    const titleEl = document.getElementById('desktop-msg-modal-title');
    const driveLink = document.getElementById('desktop-msg-drive-link');
    const contentEl = document.getElementById('desktop-msg-content');

    if (!modal || !contentEl) {
      alert('Không tìm thấy hộp thoại đọc thư Outlook');
      return;
    }

    const cleanTitle = (fileName || 'Thư điện tử').replace(/\.msg$/i, '');
    if (titleEl) titleEl.textContent = `Outlook Classic — ${fileName || cleanTitle}`;

    if (driveLink) {
      driveLink.classList.add('hidden');
      driveLink.href = '#';
    }

    contentEl.innerHTML = `
      <div class="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
        <span class="loading loading-spinner loading-lg text-[#0078d4]"></span>
        <span class="text-sm font-medium">Đang tải và trích xuất nội dung thư theo chuẩn Outlook Classic...</span>
      </div>
    `;

    modal.showModal();

    let msgData = null;
    let driveUrl = '';

    // 1. Fetch message data via RPC
    try {
      const res = await API.call('awm_get_msg', 'Vinhomes Đan Phượng', fileName, cleanTitle);
      msgData = (res && res.ok && res.data) ? res.data : (res?.data || res);
    } catch (e) {
      console.warn('awm_get_msg error:', e);
    }

    // 2. Fetch Drive link in parallel
    try {
      const driveRes = await API.call('awm_find_file', 'Vinhomes Đan Phượng', fileName, 'all');
      driveUrl = driveRes?.files?.[0]?.webViewLink || '';
      if (driveUrl && driveLink) {
        driveLink.href = driveUrl;
        driveLink.classList.remove('hidden');
      }
    } catch (_) {}

    // Fallbacks if extraction returned empty
    const subject = msgData?.subject || cleanTitle;
    const sender = msgData?.sender || 'Cán bộ phát hành / AD';
    const senderEmail = msgData?.sender_email || '';
    const toRecipients = msgData?.to || '';
    const ccRecipients = msgData?.cc || '';
    const bccRecipients = msgData?.bcc || '';
    const dateStr = msgData?.date || '';
    const bodyText = msgData?.body || '(Thư không có nội dung văn bản)';
    const attachments = Array.isArray(msgData?.attachments) ? msgData.attachments : [];
    const nestedMessages = Array.isArray(msgData?.nested_messages) ? msgData.nested_messages : [];
    const isEncrypted = !!msgData?.is_encrypted;

    const initials = getInitials(sender);

    contentEl.innerHTML = `
      <div class="flex flex-col gap-4 text-slate-200">
        <!-- Security notice banner if encrypted -->
        ${isEncrypted ? `
          <div class="bg-amber-950/60 border border-amber-600/50 rounded-lg p-3 text-amber-200 text-xs flex items-center gap-2">
            <span class="text-lg">🔒</span>
            <span><strong>Thư bảo mật Microsoft Purview / RMS:</strong> Hệ thống đã tự động giải mã hoặc trích xuất bản in kèm theo.</span>
          </div>
        ` : ''}

        <!-- Header Card: Subject & Sender -->
        <div class="bg-[#1e293b] border border-slate-700 rounded-xl p-4 shadow-sm">
          <div class="border-b border-[#0078d4] pb-2.5 mb-3.5">
            <h1 class="text-lg font-bold text-white leading-snug">${esc(subject)}</h1>
          </div>

          <div class="flex items-start gap-3.5">
            <div class="w-11 h-11 rounded-full bg-[#0078d4] text-white font-bold flex items-center justify-center text-sm shadow-md flex-shrink-0">
              ${esc(initials)}
            </div>

            <div class="flex-1 min-w-0 flex flex-col gap-1 text-xs">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <strong class="text-sm font-bold text-white">${esc(sender)}</strong>
                  ${senderEmail ? `<span class="text-slate-400 ml-1.5">&lt;${esc(senderEmail)}&gt;</span>` : ''}
                </div>
                ${dateStr ? `<span class="text-slate-400 font-mono text-[11px] bg-slate-800 px-2 py-0.5 rounded border border-slate-700">🕒 ${esc(dateStr)}</span>` : ''}
              </div>

              ${toRecipients ? `
                <div class="text-slate-300">
                  <span class="text-slate-400 font-semibold">Kính gửi (To):</span> ${esc(toRecipients)}
                </div>
              ` : ''}

              ${ccRecipients ? `
                <div class="text-slate-300">
                  <span class="text-slate-400 font-semibold">Đồng kính gửi (Cc):</span> ${esc(ccRecipients)}
                </div>
              ` : ''}

              ${bccRecipients ? `
                <div class="text-slate-300">
                  <span class="text-slate-400 font-semibold">Bcc:</span> ${esc(bccRecipients)}
                </div>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- Main Attachments Bar -->
        ${attachments.length > 0 ? `
          <div class="bg-[#1e293b] border border-slate-700 rounded-xl p-3.5 shadow-sm">
            <div class="text-xs font-bold text-[#38bdf8] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <span>📎</span><span>Tệp đính kèm (${attachments.length}):</span>
            </div>
            <div class="flex flex-wrap gap-2">
              ${attachments.map((att, idx) => {
                const attName = typeof att === 'string' ? att : (att.name || 'attachment');
                const attSize = typeof att === 'object' && att.size ? formatSize(att.size) : '';
                const icon = getAttIcon(attName);
                const isMsg = typeof att === 'object' ? (att.is_msg || attName.toLowerCase().endsWith('.msg')) : attName.toLowerCase().endsWith('.msg');
                return `
                  <div class="inline-flex items-center gap-2 bg-[#0f172a] border ${isMsg ? 'border-amber-500 hover:border-amber-400' : 'border-slate-600 hover:border-sky-400'} rounded-lg px-3 py-1.5 text-xs shadow-sm cursor-pointer transition-all"
                       onclick="${isMsg ? `document.getElementById('desktop-nested-msg-${idx}')?.scrollIntoView({behavior:'smooth'})` : `OutlookViewer.openAttachmentFile('${esc(attName)}')`}">
                    <span class="text-base">${icon}</span>
                    <span class="font-semibold text-slate-100 max-w-xs truncate">${esc(attName)}</span>
                    ${attSize ? `<span class="text-slate-400 text-[11px]">(${esc(attSize)})</span>` : ''}
                    ${isMsg ? `<span class="bg-amber-500/20 text-amber-300 text-[10px] px-1.5 py-0.5 rounded font-bold">Xem thư ↓</span>` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Email Body Card -->
        <div class="bg-[#1e293b] border border-slate-700 rounded-xl p-4 shadow-sm flex flex-col">
          <div class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <span>📝</span><span>Nội dung thư:</span>
          </div>
          <div class="text-[13px] leading-relaxed text-slate-100 whitespace-pre-wrap break-words select-text font-sans bg-[#0f172a] p-4 rounded-lg border border-slate-800 max-h-[50vh] overflow-y-auto">
            ${linkify(bodyText)}
          </div>
        </div>

        <!-- Nested Attached Messages (Thư đính kèm phía dưới) -->
        ${nestedMessages.length > 0 ? `
          <div class="mt-4 pt-4 border-t-2 border-dashed border-[#0078d4] flex flex-col gap-3">
            <div class="text-xs font-bold text-[#38bdf8] uppercase tracking-wider flex items-center gap-1.5">
              <span>📩</span><span>Thư đính kèm trong email (${nestedMessages.length} thư):</span>
            </div>

            ${nestedMessages.map((nmsg, idx) => `
              <div id="desktop-nested-msg-${idx}" class="bg-[#1e293b] border border-slate-700 border-l-4 border-l-[#0078d4] rounded-xl p-4 shadow-sm flex flex-col gap-2.5">
                <div class="font-bold text-sm text-white flex items-center gap-2">
                  <span>✉️</span><span>${esc(nmsg.subject || '(Không có tiêu đề)')}</span>
                </div>

                <div class="text-xs text-slate-300 bg-[#0f172a] p-3 rounded-lg border border-slate-800 grid gap-1">
                  <div><span class="text-slate-400 font-semibold">Người gửi:</span> <strong class="text-white">${esc(nmsg.sender || '')}</strong></div>
                  ${nmsg.date ? `<div><span class="text-slate-400 font-semibold">Thời gian:</span> ${esc(nmsg.date)}</div>` : ''}
                  ${nmsg.to ? `<div><span class="text-slate-400 font-semibold">Kính gửi:</span> ${esc(nmsg.to)}</div>` : ''}
                  ${nmsg.cc ? `<div><span class="text-slate-400 font-semibold">Đồng kính gửi:</span> ${esc(nmsg.cc)}</div>` : ''}
                </div>

                <div class="text-xs leading-relaxed text-slate-200 whitespace-pre-wrap break-words bg-[#0f172a] p-3 rounded-lg border border-slate-800 max-h-[35vh] overflow-y-auto">
                  ${linkify(nmsg.body || '(Không có nội dung)')}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  async function openAttachmentFile(attName) {
    if (!attName) return;
    try {
      const ext = attName.split('.').pop().toLowerCase();
      const kind = ext === 'pdf' ? 'pdf' : (ext === 'xlsx' || ext === 'xls') ? 'excel' : 'all';
      const res = await API.call('awm_find_file', 'Vinhomes Đan Phượng', attName, kind);
      const file = res?.files?.[0];
      if (file?.webViewLink) {
        window.open(file.webViewLink, '_blank', 'noopener');
        return;
      }
    } catch (_) {}
    window.open(`https://drive.google.com/drive/search?q=${encodeURIComponent(attName)}`, '_blank', 'noopener');
  }

  return {
    openMsg,
    openAttachmentFile
  };
})();

window.OutlookViewer = OutlookViewer;
window.openDesktopOutlookMsg = (fileName, fullPath) => OutlookViewer.openMsg(fileName, fullPath);
