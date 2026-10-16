/**
 * cad_viewer.js — Trình xem Bản vẽ CAD (DWG / DXF) tích hợp trên Desktop Web
 * Hỗ trợ:
 * 1. Chế độ Vector 2D CAD tương tác (Pan, Zoom, Phóng to/Thu nhỏ, Vừa màn hình).
 * 2. Đa lớp bản vẽ: Lớp chi tiết chính (Foreground) & Lớp File nền kiến trúc/hạ tầng (Xref).
 * 3. Chế độ Cloud CAD Viewer (ShareCAD WebGL) đọc trực tiếp mô hình DWG không cần cài AutoCAD.
 * 4. Tải tệp DWG gốc để mở trên phần mềm CAD máy tính (AutoCAD, DWG FastView, ZWCAD).
 */
'use strict';

const CadViewer = (function() {
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function extractDriveId(urlOrPath) {
    const str = String(urlOrPath || '');
    if (str.startsWith('gdrive://')) return str.split('/').pop();
    const m = str.match(/[-\w]{25,}/);
    return m ? m[0] : '';
  }

  function open(fileName, path, url, options = {}) {
    const modal = document.getElementById('modal-cad-viewer');
    const titleEl = document.getElementById('desktop-cad-modal-title');
    const controlsEl = document.getElementById('desktop-cad-controls');
    const contentEl = document.getElementById('desktop-cad-content');

    if (!modal || !contentEl) {
      console.warn('Modal CAD Viewer not found in DOM');
      return;
    }

    const cleanName = fileName || String(path || '').split('/').pop().split('\\').pop() || 'Bản vẽ CAD';
    const driveId = extractDriveId(url || path);
    const downloadUrl = driveId ? `https://drive.google.com/uc?export=download&id=${driveId}` : (url || '');

    if (titleEl) {
      const ext = cleanName.split('.').pop().toUpperCase();
      titleEl.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="badge badge-sm bg-emerald-800 text-emerald-200 font-bold border-none">${esc(ext || 'CAD')}</span>
          <span class="truncate max-w-xl font-bold">${esc(cleanName)}</span>
          ${driveId ? `<span class="text-xs text-slate-400 font-normal">· Google Drive</span>` : ''}
        </div>
      `;
    }

    modal.showModal();

    if (window.AwmCad && typeof window.AwmCad.renderCadWorkspace === 'function') {
      window.AwmCad.renderCadWorkspace({
        name: cleanName,
        id: driveId,
        url: url || path,
        directUrl: downloadUrl,
        dxfText: options.dxfText || null,
        bgText: options.bgText || null
      }, contentEl, controlsEl);
    } else {
      contentEl.innerHTML = `
        <div class="p-8 text-center text-slate-300">
          <div class="text-4xl mb-3">📐</div>
          <h3 class="text-lg font-bold text-white mb-2">${esc(cleanName)}</h3>
          <p class="text-sm text-slate-400 mb-4">Đang kết nối trình xem bản vẽ CAD...</p>
          ${downloadUrl ? `<a class="btn btn-sm btn-primary" href="${downloadUrl}" target="_blank" download>Tải tệp DWG về máy</a>` : ''}
        </div>
      `;
    }
  }

  function close() {
    const modal = document.getElementById('modal-cad-viewer');
    if (modal && modal.open) modal.close();
  }

  return { open, close };
})();

// Expose globally for double-click handlers in explorer.js and outlook_viewer.js
window.CadViewer = CadViewer;
window.openDesktopCadViewer = function(name, path, url) {
  CadViewer.open(name, path, url);
};
