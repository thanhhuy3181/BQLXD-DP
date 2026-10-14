/**
 * word.js — Logic for "B1. Tạo Word" screen.
 * Scans .msg email files from folders and exports them to formatted .docx files.
 */
'use strict';

const WordState = {
  sourceFolder: '',
  files: [],
  selectedIndices: new Set(),
  saveMode: 'same', // 'same' | 'custom'
  customOutDir: '',
  filenamePattern: '{sap} - {content}',
  isExporting: false,
};

window.chooseSourceFolder = async function() {
  const res = await API.selectFolderDialog('Chọn thư mục chứa file Email (.msg)');
  if (!res.ok || !res.data || !res.data.folder) return;

  WordState.sourceFolder = res.data.folder;
  const inputEl = document.getElementById('word-source-dir');
  if (inputEl) inputEl.value = WordState.sourceFolder;

  await scanSourceFolder();
};

window.chooseCustomOutDir = async function() {
  const res = await API.selectFolderDialog('Chọn thư mục lưu file Word đầu ra');
  if (!res.ok || !res.data || !res.data.folder) return;

  WordState.customOutDir = res.data.folder;
  const el = document.getElementById('word-custom-out-val');
  if (el) el.textContent = WordState.customOutDir;
};

window.setWordSaveMode = function(mode) {
  WordState.saveMode = mode;
  const customBox = document.getElementById('word-custom-out-box');
  if (customBox) {
    customBox.classList.toggle('opacity-40', mode !== 'custom');
    customBox.classList.toggle('pointer-events-none', mode !== 'custom');
  }
};

window.scanSourceFolder = async function() {
  if (!WordState.sourceFolder) {
    toast('Vui lòng chọn thư mục chứa file Email (.msg)', 'warning');
    return;
  }

  setLoading(true);
  try {
    const res = await API.scanMsgFolder(WordState.sourceFolder);
    if (!res.ok) {
      toast('Lỗi quét file: ' + res.error, 'error');
      return;
    }

    WordState.files = res.data.files || [];
    WordState.selectedIndices = new Set(WordState.files.map((_, i) => i));

    _renderWordFileList();
    toast(`Tìm thấy ${WordState.files.length} file email (.msg)`, 'success');
  } catch (err) {
    toast('Lỗi: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
};

function _renderWordFileList() {
  const tbody = document.getElementById('word-tbody');
  const countEl = document.getElementById('word-file-count');
  if (countEl) countEl.textContent = `${WordState.files.length} file`;
  if (!tbody) return;

  if (WordState.files.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-12 text-base-content/40">Chưa quét được file .msg nào. Hãy chọn thư mục và quét.</td></tr>`;
    return;
  }

  tbody.innerHTML = WordState.files.map((f, i) => {
    const checked = WordState.selectedIndices.has(i);
    return `<tr>
      <td class="w-8 text-center">
        <input type="checkbox" class="checkbox checkbox-xs" ${checked ? 'checked' : ''} onchange="toggleWordFile(${i}, this.checked)" />
      </td>
      <td class="text-xs font-mono font-semibold">${_esc(f.sap_code || '—')}</td>
      <td class="text-xs font-mono">${_esc(f.date_str || '—')}</td>
      <td>
        <div class="font-medium text-xs truncate max-w-md" title="${_esc(f.subject || '')}">${_esc(f.subject || f.filename)}</div>
        <div class="text-xs text-base-content/40 truncate max-w-md">${_esc(f.folder)}</div>
      </td>
      <td class="text-xs text-primary font-mono truncate max-w-xs" title="${_esc(f.preview_name)}">
        ${_esc(f.preview_name)}
      </td>
      <td class="text-right text-xs text-base-content/50">${Math.round((f.size || 0)/1024)} KB</td>
    </tr>`;
  }).join('');
}

window.toggleWordFile = function(index, checked) {
  if (checked) WordState.selectedIndices.add(index);
  else WordState.selectedIndices.delete(index);
};

window.toggleSelectAllWord = function(checked) {
  if (checked) {
    WordState.selectedIndices = new Set(WordState.files.map((_, i) => i));
  } else {
    WordState.selectedIndices.clear();
  }
  _renderWordFileList();
};

window.startWordExport = async function() {
  if (WordState.selectedIndices.size === 0) {
    toast('Chưa chọn file nào để xuất Word!', 'warning');
    return;
  }
  if (WordState.saveMode === 'custom' && !WordState.customOutDir) {
    toast('Vui lòng chọn thư mục lưu file Word đầu ra!', 'warning');
    return;
  }

  const selectedPaths = Array.from(WordState.selectedIndices).map(i => WordState.files[i].path);
  WordState.isExporting = true;

  const btn = document.getElementById('btn-start-export-word');
  const progBox = document.getElementById('word-progress-box');
  const progBar = document.getElementById('word-progress-bar');
  const progText = document.getElementById('word-progress-text');

  if (btn) btn.disabled = true;
  if (progBox) progBox.classList.remove('hidden');
  if (progBar) progBar.value = 0;
  if (progText) progText.textContent = `Đang chuẩn bị xuất ${selectedPaths.length} file...`;

  const res = await API.exportWordFiles(
    selectedPaths,
    WordState.customOutDir,
    WordState.saveMode,
    WordState.filenamePattern
  );

  if (!res.ok) {
    toast('Lỗi bắt đầu xuất Word: ' + res.error, 'error');
    if (btn) btn.disabled = false;
    if (progBox) progBox.classList.add('hidden');
    WordState.isExporting = false;
  }
};

// Listen for background export progress
document.addEventListener('py:word_export_progress', function(e) {
  const d = e.detail;
  const btn = document.getElementById('btn-start-export-word');
  const progBox = document.getElementById('word-progress-box');
  const progBar = document.getElementById('word-progress-bar');
  const progText = document.getElementById('word-progress-text');

  if (d.status === 'progress') {
    const pct = Math.round((d.index / d.total) * 100);
    if (progBar) progBar.value = pct;
    if (progText) progText.textContent = `[${d.index}/${d.total}] Đã xuất: ${d.filename}`;
  } else if (d.status === 'done') {
    if (progBar) progBar.value = 100;
    if (progText) progText.textContent = `Hoàn tất: ${d.success}/${d.total} file thành công!`;
    toast(`Xuất Word hoàn tất: ${d.success} file thành công`, 'success', 5000);
    if (btn) btn.disabled = false;
    WordState.isExporting = false;
  }
});
