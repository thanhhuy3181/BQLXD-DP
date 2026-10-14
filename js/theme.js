/**
 * theme.js — Theme management with preview and live switching.
 * Themes: corporate, business, nord, night, winter (+ light, dark, dracula, cupcake, emerald)
 */

'use strict';

const THEMES = [
  { id: 'corporate', label: 'Corporate',  preview: ['#1c4ed8','#ffffff','#374151'] },
  { id: 'business',  label: 'Business',   preview: ['#1d4ed8','#111827','#374151'] },
  { id: 'nord',      label: 'Nord',       preview: ['#5e81ac','#eceff4','#4c566a'] },
  { id: 'night',     label: 'Night',      preview: ['#38bdf8','#1e293b','#475569'] },
  { id: 'winter',    label: 'Winter',     preview: ['#047aed','#f2f2f2','#cbd5e1'] },
  { id: 'light',     label: 'Light',      preview: ['#4f46e5','#ffffff','#6b7280'] },
  { id: 'dark',      label: 'Dark',       preview: ['#661ae6','#1d232a','#a6adbb'] },
  { id: 'dracula',   label: 'Dracula',    preview: ['#ff79c6','#282a36','#f8f8f2'] },
  { id: 'cupcake',   label: 'Cupcake',    preview: ['#65c3c8','#faf7f5','#291334'] },
  { id: 'emerald',   label: 'Emerald',    preview: ['#66cc8a','#ffffff','#333c4d'] },
];

let _currentTheme = 'corporate';
let _currentFontSize = 'md';
let _currentCompact = false;

// ── Apply theme to HTML element ──────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  _currentTheme = theme;
  _updateThemeGrid();
}

function applyFontSize(fs) {
  _currentFontSize = fs;
  const base = { sm: '13px', md: '15px', lg: '17px' }[fs] || '15px';
  document.documentElement.style.fontSize = base;
  ['sm','md','lg'].forEach(s => {
    const btn = document.getElementById('fs-' + s);
    if (btn) btn.classList.toggle('btn-primary', s === fs);
    if (btn) btn.classList.toggle('btn-outline', s !== fs);
  });
}

function applyCompact(compact) {
  _currentCompact = compact;
  document.body.classList.toggle('compact', compact);
  const el = document.getElementById('compact-toggle');
  if (el) el.checked = compact;
}

// ── Theme grid rendering ──────────────────────────────────────────────────────
function _updateThemeGrid() {
  const grid = document.getElementById('theme-grid');
  if (!grid) return;
  grid.innerHTML = THEMES.map(t => {
    const [p1, p2, p3] = t.preview;
    const active = t.id === _currentTheme ? 'ring ring-primary ring-offset-2' : '';
    return `
      <button onclick="selectTheme('${t.id}')"
              class="card card-compact bg-base-100 shadow-sm border border-base-300 cursor-pointer hover:shadow-md transition-shadow ${active}"
              title="${t.label}">
        <div class="card-body p-2 gap-1">
          <div class="flex gap-1 h-4">
            <div class="flex-1 rounded" style="background:${p1}"></div>
            <div class="flex-1 rounded" style="background:${p2}"></div>
            <div class="flex-1 rounded" style="background:${p3}"></div>
          </div>
          <p class="text-xs font-medium text-center mt-1">${t.label}</p>
          ${t.id === _currentTheme ? '<div class="badge badge-primary badge-xs self-center">Đang dùng</div>' : ''}
        </div>
      </button>`;
  }).join('');
}

// ── User actions ──────────────────────────────────────────────────────────────
window.selectTheme = async function(theme) {
  applyTheme(theme);
  const res = await API.saveTheme(theme, _currentFontSize, _currentCompact);
  if (res.ok) toast('Đã đổi theme: ' + theme, 'success', 2000);
  else toast('Lỗi lưu theme: ' + res.error, 'error');
};

window.setFontSize = async function(fs) {
  applyFontSize(fs);
  await API.saveTheme(_currentTheme, fs, _currentCompact);
};

window.setCompact = async function(compact) {
  applyCompact(compact);
  await API.saveTheme(_currentTheme, _currentFontSize, compact);
};

// ── Init ──────────────────────────────────────────────────────────────────────
async function initTheme() {
  _updateThemeGrid();
  const res = await API.getTheme();
  if (res.ok && res.data) {
    applyTheme(res.data.theme || 'corporate');
    applyFontSize(res.data.font_size || 'md');
    applyCompact(res.data.compact || false);
  }
}
