/**
 * boq_extract.js — Module bóc tách Bảng Khối lượng (BOQ) & Giá trị Hợp đồng cho Webview
 */
'use strict';

const BoqExtractModule = (function() {
  let _pdfFiles = []; // Array of {path, name, folder_name, folder_path, size_fmt, is_star, star_str, has_cks, cks_str, checked: true, status: 'Sẵn sàng'}
  let _results = [];  // Extracted BOQ results from backend
  let _excelFiles = []; // Array of generated Excel files in temp_boq_excel/
  let _activeResTab = 'excel'; // 'excel' | 'grid' | 'info' | 'warn'
  let _isExtracting = false;
  let _currentFolderPath = '';

  function init() {
    setupEventListeners();
    loadSettings();
  }

  function loadSettings() {
    try {
      const savedDepth = localStorage.getItem('boq_scan_depth');
      const savedCks = localStorage.getItem('boq_only_cks');
      if (savedDepth !== null) {
        const depthSelect = document.getElementById('boq-depth-select');
        if (depthSelect) depthSelect.value = savedDepth;
      }
      if (savedCks !== null) {
        const cksChk = document.getElementById('boq-chk-cks-only');
        if (cksChk) cksChk.checked = (savedCks === 'true');
      }
    } catch (e) {}
  }

  function saveSettings() {
    try {
      const depth = document.getElementById('boq-depth-select')?.value || '0';
      const cks = document.getElementById('boq-chk-cks-only')?.checked || false;
      localStorage.setItem('boq_scan_depth', depth);
      localStorage.setItem('boq_only_cks', String(cks));
    } catch (e) {}
  }

  function setupEventListeners() {
    document.removeEventListener('py:boq_extract_progress', handleProgressEvent);
    document.addEventListener('py:boq_extract_progress', handleProgressEvent);
  }

  function handleProgressEvent(e) {
    const data = e.detail;
    if (!data) return;

    const statusLbl = document.getElementById('boq-status-lbl');
    const pContainer = document.getElementById('boq-progress-bar-container');
    const pFill = document.getElementById('boq-progress-bar-fill');

    if (data.status === 'file_start') {
      if (statusLbl) statusLbl.textContent = `Đang đọc (${data.current}/${data.total}): ${data.path.split('/').pop()}`;
      if (pContainer) pContainer.classList.remove('hidden');
      if (pFill) pFill.style.width = `${Math.round((data.current - 1) / data.total * 100)}%`;
      
      const item = _pdfFiles.find(f => f.path === data.path);
      if (item) {
        item.status = '⏳ Đang đọc...';
        renderFileList();
      }
    } else if (data.status === 'progress') {
      if (statusLbl) statusLbl.textContent = `Đang bóc tách ${data.pdf_name} (trang ${data.page}/${data.total_pages})...`;
    } else if (data.status === 'completed') {
      _isExtracting = false;
      if (statusLbl) {
        statusLbl.textContent = `Đã hoàn thành (${data.total_files} tệp)`;
        statusLbl.className = 'badge badge-sm badge-success text-xs font-bold';
      }
      if (pContainer) pContainer.classList.add('hidden');
      _results = data.results || [];
      _excelFiles = (data.excel_files || []).map(x => ({ ...x, checked: true }));

      _results.forEach(res => {
        const item = _pdfFiles.find(f => f.path === res.pdf_path || f.name === res.pdf_name);
        if (item) {
          if (res.is_scanned_unreadable) {
            item.status = '⚠️ Quét ảnh (Cần OCR)';
          } else {
            const rowsCount = (res.boq_rows || []).length;
            item.status = `✓ Hoàn tất (${rowsCount} dòng)`;
          }
        }
      });
      renderFileList();
      renderResults();
      toggleControlButtons(false);
      switchResTab('excel');
      toast(`Trích xuất thành công! Đã bóc xong ${_excelFiles.length} file Excel`, 'success');
    } else if (data.status === 'stopped') {
      _isExtracting = false;
      if (statusLbl) {
        statusLbl.textContent = 'Đã dừng trích xuất';
        statusLbl.className = 'badge badge-sm badge-error text-xs font-bold';
      }
      if (pContainer) pContainer.classList.add('hidden');
      toggleControlButtons(false);
      toast('Đã dừng tiến trình bóc tách.', 'warning');
    } else if (data.status === 'error') {
      _isExtracting = false;
      if (statusLbl) {
        statusLbl.textContent = 'Lỗi bóc tách: ' + (data.message || '');
        statusLbl.className = 'badge badge-sm badge-error text-xs font-bold';
      }
      if (pContainer) pContainer.classList.add('hidden');
      toggleControlButtons(false);
      toast('Lỗi bóc tách: ' + data.message, 'error');
    }
  }

  function toggleControlButtons(isRunning) {
    const btnStart = document.getElementById('btn-boq-start');
    const btnStop = document.getElementById('btn-boq-stop');
    if (btnStart) btnStart.disabled = isRunning;
    if (btnStop) btnStop.disabled = !isRunning;
  }

  async function selectFolder() {
    const res = await API.selectFolderDialog('Chọn thư mục chứa các thư mục Hợp đồng');
    if (res.ok && res.data) {
      const folderPath = res.data;
      _currentFolderPath = folderPath;
      document.getElementById('boq-path-lbl').textContent = folderPath;
      await scanCurrentFolder();
    }
  }

  async function scanCurrentFolder() {
    if (!_currentFolderPath) return;
    const depth = parseInt(document.getElementById('boq-depth-select')?.value || '0', 10);
    const cksOnly = document.getElementById('boq-chk-cks-only')?.checked || false;

    toast('Đang quét danh sách file PDF Hợp đồng...', 'info');
    const scanRes = await API.scanBoqFolder(_currentFolderPath, depth, cksOnly);
    if (scanRes.ok && scanRes.data && scanRes.data.files) {
      _pdfFiles = scanRes.data.files;
      renderFileList();
      toast(`Đã tìm thấy ${_pdfFiles.length} file PDF hợp lệ`, 'success');
    } else {
      _pdfFiles = [];
      renderFileList();
      toast('Không tìm thấy file PDF nào phù hợp!', 'warning');
    }
  }

  function onFilterChanged() {
    saveSettings();
    scanCurrentFolder();
  }

  async function selectFiles() {
    const res = await API.selectBoqPdfFilesDialog();
    if (res.ok && res.data && res.data.files && res.data.files.length > 0) {
      const paths = res.data.files;
      if (paths.length > 0) {
        const firstDir = paths[0].substring(0, paths[0].lastIndexOf('/'));
        _currentFolderPath = firstDir;
        document.getElementById('boq-path-lbl').textContent = `${paths.length} file đã chọn từ ${firstDir}`;
      }

      paths.forEach(p => {
        const name = p.split('/').pop();
        if (!_pdfFiles.some(f => f.path === p)) {
          _pdfFiles.push({
            path: p,
            name: name,
            folder_name: p.split('/')[p.split('/').length - 2] || '',
            folder_path: p.substring(0, p.lastIndexOf('/')),
            size: 0,
            size_fmt: 'PDF',
            is_star: true,
            star_str: '⭐ File HĐ chính',
            has_cks: true,
            cks_str: '✓ Có CKS',
            checked: true,
            status: 'Sẵn sàng'
          });
        }
      });
      renderFileList();
      toast(`Đã thêm ${paths.length} file PDF`, 'success');
    }
  }

  function selectOnlyStarFiles() {
    _pdfFiles.forEach(f => f.checked = Boolean(f.is_star));
    renderFileList();
    toast(`Đã chọn ${_pdfFiles.filter(f => f.checked).length} file Hợp đồng chính (⭐)`, 'info');
  }

  function toggleAll() {
    const allChecked = _pdfFiles.every(f => f.checked);
    _pdfFiles.forEach(f => f.checked = !allChecked);
    const chkAll = document.getElementById('boq-chk-all');
    if (chkAll) chkAll.checked = !allChecked;
    renderFileList();
  }

  function onCheckAllChanged(checked) {
    _pdfFiles.forEach(f => f.checked = checked);
    renderFileList();
  }

  function onFileCheckChanged(index, checked) {
    if (_pdfFiles[index]) {
      _pdfFiles[index].checked = checked;
    }
  }

  function renderFileList() {
    const tbody = document.getElementById('boq-pdf-tbody');
    const countLbl = document.getElementById('boq-pdf-count');
    if (!tbody) return;

    if (countLbl) countLbl.textContent = `${_pdfFiles.length} file PDF`;

    if (_pdfFiles.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-[#908CAA]">Chưa chọn file PDF nào</td></tr>';
      return;
    }

    tbody.innerHTML = _pdfFiles.map((f, idx) => `
      <tr class="hover text-xs border-b border-[#2E2E2A] ${f.is_star ? 'bg-[#2E2818]' : ''}">
        <td class="text-center">
          <input type="checkbox" ${f.checked ? 'checked' : ''} onchange="BoqExtractModule.onFileCheckChanged(${idx}, this.checked)" class="checkbox checkbox-xs checkbox-primary" />
        </td>
        <td class="text-center font-medium">${idx + 1}</td>
        <td class="text-center">
          ${f.is_star ? '<span class="badge badge-xs bg-[#F39C12] text-black font-bold">⭐ File HĐ chính</span>' : ''}
        </td>
        <td class="font-bold ${f.is_star ? 'text-[#F39C12]' : 'text-[#E0DEF4]'} truncate max-w-xs" title="${escapeHtml(f.path)}">
          ${escapeHtml(f.name)}
        </td>
        <td class="text-center">
          <span class="badge badge-xs ${f.has_cks ? 'badge-success' : 'badge-ghost'} text-[10px]">
            ${escapeHtml(f.cks_str || 'Chưa rõ')}
          </span>
        </td>
        <td class="text-center text-[#908CAA]">${f.size_fmt || '—'}</td>
        <td class="text-center">
          <button class="btn btn-xs bg-[#26233A] hover:bg-[#312F44] text-[#3498DB] border border-[#312F44] text-[10px] px-1.5" onclick="API.openPath('${escapeHtml(f.path)}')">
            📄 Xem PDF
          </button>
        </td>
        <td class="text-center">
          <span class="badge badge-xs ${f.status.includes('Hoàn tất') ? 'badge-success' : (f.status.includes('⏳') ? 'badge-info' : (f.status.includes('⚠️') ? 'badge-warning' : 'badge-ghost'))} text-[10px]">
            ${escapeHtml(f.status)}
          </span>
        </td>
      </tr>
    `).join('');
  }

  async function startExtraction() {
    const selectedFiles = _pdfFiles.filter(f => f.checked);
    if (selectedFiles.length === 0) {
      toast('Vui lòng tích chọn ít nhất 1 file PDF để trích xuất!', 'warning');
      return;
    }

    const paths = selectedFiles.map(f => f.path);
    _isExtracting = true;
    toggleControlButtons(true);

    const statusLbl = document.getElementById('boq-status-lbl');
    if (statusLbl) {
      statusLbl.textContent = 'Bắt đầu đọc PDF ngầm...';
      statusLbl.className = 'badge badge-sm badge-info text-xs font-bold';
    }

    const res = await API.extractBoqContractData(paths);
    if (!res.ok) {
      _isExtracting = false;
      toggleControlButtons(false);
      toast('Không thể bắt đầu bóc tách: ' + res.error, 'error');
    }
  }

  async function stopExtraction() {
    await API.stopBoqContractExtraction();
    toast('Đã gửi yêu cầu dừng bóc tách...', 'info');
  }

  function renderResults() {
    renderExcelTable();
    renderBOQGrid();
    renderContractInfo();
    renderWarnings();
  }

  function renderExcelTable() {
    const tbody = document.getElementById('boq-excel-tbody');
    const countLbl = document.getElementById('boq-row-count-lbl');
    if (!tbody) return;

    if (countLbl) countLbl.textContent = `${_excelFiles.length} file Excel bóc xong`;

    if (_excelFiles.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center py-10 text-[#908CAA]">Chưa có file Excel bóc tách nào. Hãy bấm [Trích xuất] ở trên.</td></tr>';
      return;
    }

    tbody.innerHTML = _excelFiles.map((x, idx) => {
      const remarkText = x.remark || (x.rows_count === 0 ? '❌ Không có dữ liệu bảng excel KL, GT' : '✅ Đã bóc tách thành công');
      const isError = remarkText.includes('❌') || remarkText.includes('⚠️');
      const remarkBadge = isError 
        ? `<span class="badge badge-xs badge-error text-[10px] font-semibold">${escapeHtml(remarkText)}</span>`
        : `<span class="badge badge-xs badge-success text-[10px] font-semibold">${escapeHtml(remarkText)}</span>`;

      return `
        <tr class="hover text-xs border-b border-[#2E2E2A]">
          <td class="text-center">
            <input type="checkbox" ${x.checked ? 'checked' : ''} onchange="BoqExtractModule.onExcelCheckChanged(${idx}, this.checked)" class="checkbox checkbox-xs checkbox-primary" />
          </td>
          <td class="text-center font-medium">${idx + 1}</td>
          <td class="font-bold text-[#F39C12]">${escapeHtml(x.contract_code || 'HĐ')}</td>
          <td class="font-bold text-[#2ECC71]">
            <button class="hover:underline text-left text-[#2ECC71]" onclick="API.openPath('${escapeHtml(x.temp_path)}')">
              📊 ${escapeHtml(x.filename)}
            </button>
          </td>
          <td class="max-w-xs truncate">${remarkBadge}</td>
          <td class="text-center">
            <div class="flex items-center justify-center gap-1">
              <button class="btn btn-xs bg-[#26233A] hover:bg-[#312F44] text-[#2ECC71] border border-[#312F44] text-[10px] px-1.5" onclick="API.openPath('${escapeHtml(x.temp_path)}')" title="Mở file Excel đã bóc">
                📊 Excel
              </button>
              <button class="btn btn-xs bg-[#26233A] hover:bg-[#312F44] text-[#3498DB] border border-[#312F44] text-[10px] px-1.5" onclick="API.openPath('${escapeHtml(x.pdf_path || x.temp_path)}')" title="Mở file PDF Hợp đồng gốc">
                📄 PDF
              </button>
              <button class="btn btn-xs bg-[#26233A] hover:bg-[#312F44] text-[#F39C12] border border-[#312F44] text-[10px] px-1.5" onclick="API.openPath('${escapeHtml(x.folder_path)}')" title="Mở thư mục chứa Hợp đồng gốc">
                📁 Thư mục
              </button>
            </div>
          </td>
          <td class="text-[#908CAA] truncate max-w-xs" title="${escapeHtml(x.folder_path)}">${escapeHtml(x.folder_name || x.folder_path)}</td>
          <td class="text-center font-bold text-[#3498DB]">${x.rows_count || 0} dòng</td>
          <td class="text-center">
            <span class="badge badge-xs badge-info text-[10px]">${escapeHtml(x.status || 'Trong temp')}</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  function onExcelCheckAllChanged(checked) {
    _excelFiles.forEach(x => x.checked = checked);
    renderExcelTable();
  }

  function onExcelCheckChanged(idx, checked) {
    if (_excelFiles[idx]) {
      _excelFiles[idx].checked = checked;
    }
  }

  async function moveSelectedExcelFiles() {
    const selected = _excelFiles.filter(x => x.checked);
    if (selected.length === 0) {
      toast('Vui lòng tích chọn các file Excel cần xuất về thư mục HĐ!', 'warning');
      return;
    }

    toast(`Đang xuất ${selected.length} file Excel về các thư mục HĐ...`, 'info');
    const res = await API.moveBoqExcelFiles(selected);
    if (res.ok) {
      toast(`🎉 Đã chuyển ${res.data.moved_count} file Excel về trực tiếp thư mục chứa Hợp đồng!`, 'success');
      selected.forEach(x => {
        x.status = '✓ Đã xuất về thư mục HĐ';
      });
      renderExcelTable();
    } else {
      toast('Lỗi chuyển file Excel: ' + res.error, 'error');
    }
  }

  function renderBOQGrid() {
    const tbody = document.getElementById('boq-grid-tbody');
    if (!tbody) return;

    let allRows = [];
    _results.forEach(res => {
      (res.boq_rows || []).forEach(r => {
        allRows.push(r);
      });
    });

    if (allRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="20" class="text-center py-10 text-[#908CAA]">Chưa có dữ liệu trích xuất</td></tr>';
      return;
    }

    tbody.innerHTML = allRows.map((r, idx) => {
      const isSum = r.is_summary;
      const bgClass = isSum ? 'bg-[#2E2818] font-bold text-[#F39C12]' : (idx % 2 === 0 ? 'bg-[#181816]' : 'bg-[#1F1D2E]');
      
      const fmtNum = (val, raw) => {
        if (val != null && typeof val === 'number') {
          return val.toLocaleString('vi-VN');
        }
        return escapeHtml(raw || '');
      };

      return `
        <tr class="${bgClass} hover:bg-[#312F44] text-xs border-b border-[#2E2E2A]">
          <td class="text-center">${escapeHtml(r.stt_ma_hmp || idx + 1)}</td>
          <td class="contenteditable text-center font-mono text-[11px]" onblur="BoqExtractModule.onCellEdit(${idx}, 'ma_5_lop', this.innerText)">${escapeHtml(r.ma_5_lop || '')}</td>
          <td class="contenteditable" onblur="BoqExtractModule.onCellEdit(${idx}, 'hang_muc', this.innerText)">${escapeHtml(r.hang_muc || '')}</td>
          <td class="contenteditable text-[#908CAA]" onblur="BoqExtractModule.onCellEdit(${idx}, 'quy_cach', this.innerText)">${escapeHtml(r.quy_cach || '')}</td>
          <td class="contenteditable" onblur="BoqExtractModule.onCellEdit(${idx}, 'mo_ta_hang_muc', this.innerText)">${escapeHtml(r.mo_ta_hang_muc || '')}</td>
          <td class="contenteditable text-center font-mono text-[11px]" onblur="BoqExtractModule.onCellEdit(${idx}, 'ma_san_pham', this.innerText)">${escapeHtml(r.ma_san_pham || '')}</td>
          <td class="contenteditable" onblur="BoqExtractModule.onCellEdit(${idx}, 'nhan_hieu', this.innerText)">${escapeHtml(r.nhan_hieu || '')}</td>
          <td class="contenteditable text-center" onblur="BoqExtractModule.onCellEdit(${idx}, 'xuat_xu', this.innerText)">${escapeHtml(r.xuat_xu || '')}</td>
          <td class="contenteditable text-center" onblur="BoqExtractModule.onCellEdit(${idx}, 'hinh_anh', this.innerText)">${escapeHtml(r.hinh_anh || '')}</td>
          <td class="contenteditable text-center" onblur="BoqExtractModule.onCellEdit(${idx}, 'don_vi', this.innerText)">${escapeHtml(r.don_vi || '')}</td>
          <td class="contenteditable text-right" onblur="BoqExtractModule.onCellEdit(${idx}, 'khoi_luong', this.innerText)">${fmtNum(r.khoi_luong, r.raw_khoi_luong)}</td>
          <td class="contenteditable text-right" onblur="BoqExtractModule.onCellEdit(${idx}, 'dg_vat_tu', this.innerText)">${fmtNum(r.dg_vat_tu, r.raw_dg_vat_tu)}</td>
          <td class="contenteditable text-right" onblur="BoqExtractModule.onCellEdit(${idx}, 'dg_nhan_cong', this.innerText)">${fmtNum(r.dg_nhan_cong, r.raw_dg_nhan_cong)}</td>
          <td class="contenteditable text-right" onblur="BoqExtractModule.onCellEdit(${idx}, 'dg_may', this.innerText)">${fmtNum(r.dg_may, r.raw_dg_may)}</td>
          <td class="contenteditable text-right" onblur="BoqExtractModule.onCellEdit(${idx}, 'don_gia', this.innerText)">${fmtNum(r.don_gia, r.raw_don_gia)}</td>
          <td class="contenteditable text-right" onblur="BoqExtractModule.onCellEdit(${idx}, 'thanh_tien_truoc_thue', this.innerText)">${fmtNum(r.thanh_tien_truoc_thue, r.raw_thanh_tien_truoc_thue)}</td>
          <td class="contenteditable text-center" onblur="BoqExtractModule.onCellEdit(${idx}, 'phantram_vat', this.innerText)">${escapeHtml(r.phantram_vat || '')}</td>
          <td class="contenteditable text-right" onblur="BoqExtractModule.onCellEdit(${idx}, 'thue_vat', this.innerText)">${fmtNum(r.thue_vat, r.raw_thue_vat)}</td>
          <td class="contenteditable text-right font-bold ${isSum ? 'text-[#F39C12]' : 'text-[#2ECC71]'}" onblur="BoqExtractModule.onCellEdit(${idx}, 'thanh_tien_sau_thue', this.innerText)">${fmtNum(r.thanh_tien_sau_thue, r.raw_thanh_tien_sau_thue)}</td>
          <td class="contenteditable text-[#908CAA]" onblur="BoqExtractModule.onCellEdit(${idx}, 'ghi_chu', this.innerText)">${escapeHtml(r.ghi_chu || '')}</td>
        </tr>
      `;
    }).join('');
  }

  function onCellEdit(rowIndex, field, newText) {
    let flatIdx = 0;
    for (let res of _results) {
      for (let r of (res.boq_rows || [])) {
        if (flatIdx === rowIndex) {
          r[field] = newText.trim();
          if (['khoi_luong', 'don_gia', 'thanh_tien', 'dg_vat_tu', 'dg_nhan_cong', 'dg_may'].includes(field)) {
            r['raw_' + field] = newText.trim();
          }
          return;
        }
        flatIdx++;
      }
    }
  }

  function renderContractInfo() {
    const tbody = document.getElementById('boq-info-tbody');
    if (!tbody) return;

    let infoRows = [];
    _results.forEach(res => {
      (res.contract_values || []).forEach(cv => {
        infoRows.push(cv);
      });
    });

    if (infoRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-[#908CAA]">Chưa có dữ liệu giá trị hợp đồng</td></tr>';
      return;
    }

    tbody.innerHTML = infoRows.map((cv, idx) => `
      <tr class="hover text-xs border-b border-[#2E2E2A]">
        <td class="text-center font-medium">${idx + 1}</td>
        <td class="font-bold text-[#E0DEF4]">${escapeHtml(cv.pdf_name || '')}</td>
        <td class="text-right font-bold text-[#2ECC71]">${escapeHtml(cv.amount_str || '')} đ</td>
        <td class="text-center">
          <span class="badge badge-xs ${cv.vat_status === 'Đã gồm VAT' ? 'badge-success' : 'badge-warning'} text-[10px]">
            ${escapeHtml(cv.vat_status || '')}
          </span>
        </td>
        <td class="text-center text-[#908CAA]">${cv.page || 1}</td>
        <td class="text-[#908CAA] text-[11px] italic font-mono bg-[#191724] p-1 rounded">${escapeHtml(cv.raw_text || '')}</td>
      </tr>
    `).join('');
  }

  function renderWarnings() {
    const tbody = document.getElementById('boq-warn-tbody');
    if (!tbody) return;

    let warnRows = [];
    _results.forEach(res => {
      (res.warnings || []).forEach(w => {
        warnRows.push({
          pdf_name: res.pdf_name,
          ...w
        });
      });
    });

    if (warnRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-[#2ECC71]">✓ Không có cảnh báo nào cần kiểm tra</td></tr>';
      return;
    }

    tbody.innerHTML = warnRows.map((w, idx) => `
      <tr class="hover text-xs border-b border-[#2E2E2A] bg-[#2C1F1F]">
        <td class="text-center font-medium">${idx + 1}</td>
        <td class="font-bold text-[#E0DEF4]">${escapeHtml(w.pdf_name || '')}</td>
        <td class="text-center text-[#908CAA]">${w.page || 1}</td>
        <td class="text-center">
          <span class="badge badge-xs badge-error text-[10px]">${escapeHtml(w.warning_type || '')}</span>
        </td>
        <td class="text-[#FF7675] font-semibold">${escapeHtml(w.message || '')}</td>
        <td class="text-[#908CAA] font-mono text-[11px]">
            ${w.issue_id ? `<button class="btn btn-xs btn-warning" onclick="BoqExtractModule.openDecisionModal('${encodeURIComponent(JSON.stringify(w))}')">Quyết định</button>` : escapeHtml(w.raw_data || '')}
          </td>
      </tr>
    `).join('');
  }

  function switchResTab(tabKey) {
    _activeResTab = tabKey;
    document.querySelectorAll('.boq-res-tab-btn').forEach(btn => {
      if (btn.dataset.tab === tabKey) {
        btn.classList.add('btn-primary', 'font-bold');
        btn.classList.remove('btn-ghost');
      } else {
        btn.classList.remove('btn-primary', 'font-bold');
        btn.classList.add('btn-ghost');
      }
    });

    document.getElementById('boq-res-pane-excel').classList.toggle('hidden', tabKey !== 'excel');
    document.getElementById('boq-res-pane-grid').classList.toggle('hidden', tabKey !== 'grid');
    document.getElementById('boq-res-pane-info').classList.toggle('hidden', tabKey !== 'info');
    document.getElementById('boq-res-pane-warn').classList.toggle('hidden', tabKey !== 'warn');
  }

  
  let _currentIssue = null;

  function openDecisionModal(issueJson) {
    try {
      const issue = JSON.parse(decodeURIComponent(issueJson));
      _currentIssue = issue;
      
      document.getElementById('boq-dec-file').textContent = issue.pdf_name || 'Không rõ';
      document.getElementById('boq-dec-reason').textContent = issue.message || '';
      
      const imgEl = document.getElementById('boq-dec-img');
      if (issue.image_base64) {
        imgEl.src = 'data:image/png;base64,' + issue.image_base64;
      } else {
        imgEl.src = '';
      }

      const mapContainer = document.getElementById('boq-dec-mappings');
      let html = '';
      if (issue.headers && Array.isArray(issue.headers)) {
        issue.headers.forEach((h, idx) => {
          html += `
            <div class="flex items-center gap-2 bg-[#181816] p-2 rounded border border-[#2E2E2A]">
              <span class="w-1/2 text-[11px] truncate text-[#E0DEF4]" title="${h.raw_text}">${h.raw_text}</span>
              <select class="boq-dec-select select select-xs select-bordered bg-[#242421] text-[#908CAA] flex-1" data-idx="${idx}">
                <option value="">-- Bỏ qua --</option>
                <option value="2">Nội dung/Tên</option>
                <option value="9">Đơn vị</option>
                <option value="10">Khối lượng</option>
                <option value="14">Đơn giá Tổng</option>
                <option value="16">Đơn giá</option>
                <option value="20">Thành tiền</option>
                <option value="21">Thành tiền sau thuế</option>
              </select>
            </div>
          `;
        });
      }
      mapContainer.innerHTML = html;

      document.getElementById('boq-decision-modal').showModal();
    } catch(e) {
      console.error(e);
    }
  }

  async function submitDecision() {
    if (!_currentIssue) return;
    
    const selects = document.querySelectorAll('.boq-dec-select');
    const mapping = {};
    selects.forEach(sel => {
      if (sel.value) {
        mapping[sel.dataset.idx] = parseInt(sel.value);
      }
    });

    const scope = document.getElementById('boq-dec-scope').value;

    try {
      const res = await window.pywebview.api.resolve_boq_issue(_currentIssue.issue_id, mapping, scope);
      if (res.status === 'error') {
        alert('Lỗi: ' + res.message);
      } else {
        document.getElementById('boq-decision-modal').close();
        // Option to reload or continue processing
      }
    } catch(e) {
      console.error(e);
    }
  }

  return {
    openDecisionModal,
    submitDecision,
    init,
    selectFolder,
    selectFiles,
    selectOnlyStarFiles,
    onFilterChanged,
    toggleAll,
    onCheckAllChanged,
    onFileCheckChanged,
    startExtraction,
    stopExtraction,
    switchResTab,
    onCellEdit,
    onExcelCheckAllChanged,
    onExcelCheckChanged,
    moveSelectedExcelFiles
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  BoqExtractModule.init();
});
