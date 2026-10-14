/**
 * compare.js — Module So Sánh & Đối Chiếu Dữ Liệu Chuyên Sâu
 * Hỗ trợ 4 chế độ: HSMT vs HĐ, Dự toán vs BOQ Trúng thầu, Giá trị HĐ vs TƯ TT, AI OCR Đối chiếu
 */
'use strict';

const CompareModule = (() => {
  let _activeMode = 'hsmt_vs_hd';
  let _onlyDiff = false;
  let _searchQuery = '';
  let _items = [];

  const MODE_TITLES = {
    'hsmt_vs_hd': 'ĐỐI CHIẾU HỒ SƠ MỜI THẦU (HSMT) VỚI HỢP ĐỒNG ĐÃ KÝ',
    'boq_diff': 'ĐỐI CHIẾU BẢNG KHỐI LƯỢNG (BOQ) DỰ TOÁN VS TRÚNG THẦU',
    'payment_vs_contract': 'ĐỐI CHIẾU GIÁ TRỊ HỢP ĐỒNG VỚI LŨY KẾ THANH TOÁN (TƯ, TT)',
    'ai_ocr_diff': 'AI ĐỐI CHIẾU BÓC TÁCH OCR (GEMINI VS REGEX TRÍCH XUẤT)'
  };

  async function init() {
    await runComparison();
  }

  function setMode(mode) {
    _activeMode = mode;
    document.querySelectorAll('.cmp-mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    const titleEl = document.getElementById('cmp-view-title');
    if (titleEl) titleEl.textContent = MODE_TITLES[mode] || 'ĐỐI CHIẾU DỮ LIỆU';
    runComparison();
  }

  function toggleOnlyDiff() {
    _onlyDiff = !_onlyDiff;
    const btn = document.getElementById('cmp-btn-only-diff');
    if (btn) {
      btn.classList.toggle('btn-warning', _onlyDiff);
      btn.classList.toggle('btn-outline', !_onlyDiff);
    }
    renderTable();
  }

  async function runComparison() {
    setLoading(true);
    try {
      // Build realistic comparison datasets based on active mode
      if (_activeMode === 'hsmt_vs_hd') {
        _items = [
          {
            ma_hsmt: '7000182931',
            ma_hd: 'HD00132763',
            ten_goi: 'Thi công cọc khoan nhồi Phân khu Ánh Dương',
            du_toan: 48000000000,
            gia_hd: 45200000000,
            nt_hsmt: 'Đang đấu thầu',
            nt_hd: 'Công ty Cổ phần VinCons',
            ngay_ph: '12/08/2026',
            ngay_ky: '15/09/2026',
            status: 'MATCHED',
            note: 'Tiết kiệm 5.8% so với ngân sách'
          },
          {
            ma_hsmt: '7000182932',
            ma_hd: 'HD00132764',
            ten_goi: 'Thi công kết cấu thân Lô CX1',
            du_toan: 85000000000,
            gia_hd: 88500000000,
            nt_hsmt: 'Nhà thầu XD',
            nt_hd: 'Công ty XD Hòa Bình',
            ngay_ph: '20/08/2026',
            ngay_ky: '28/09/2026',
            status: 'OVER_BUDGET',
            note: 'Vượt ngân sách +4.1% (Có tờ trình phê duyệt bổ sung)'
          },
          {
            ma_hsmt: '7000182933',
            ma_hd: 'HD00132765',
            ten_goi: 'Cung cấp và lắp đặt thiết bị cơ điện ME',
            du_toan: 32100000000,
            gia_hd: 32100000000,
            nt_hsmt: 'Tập đoàn REE Corp',
            nt_hd: 'Tập đoàn REE Corp',
            ngay_ph: '05/09/2026',
            ngay_ky: '10/10/2026',
            status: 'MATCHED',
            note: 'Khớp 100% giá dự toán'
          },
          {
            ma_hsmt: '7000182934',
            ma_hd: '—',
            ten_goi: 'Cung cấp thép xây dựng Hòa Phát đợt 3',
            du_toan: 22000000000,
            gia_hd: 0,
            nt_hsmt: 'Công ty CP Thép Hòa Phát',
            nt_hd: 'Chưa ký HĐ',
            ngay_ph: '10/09/2026',
            ngay_ky: '—',
            status: 'PENDING_CONTRACT',
            note: 'Đang thương thảo hoàn thiện hợp đồng'
          },
          {
            ma_hsmt: '7000182935',
            ma_hd: 'HD00132767',
            ten_goi: 'Tư vấn giám sát thi công hạ tầng',
            du_toan: 5200000000,
            gia_hd: 4800000000,
            nt_hsmt: 'Coninco',
            nt_hd: 'Công ty TVGS Coninco',
            ngay_ph: '15/09/2026',
            ngay_ky: '02/10/2026',
            status: 'MATCHED',
            note: 'Tiết kiệm 7.7%'
          }
        ];
      } else if (_activeMode === 'boq_diff') {
        _items = [
          {
            ma: 'BOQ-001',
            noi_dung: 'Bê tông cọc khoan nhồi D1000 mác M350',
            dvt: 'm3',
            kl_du_toan: 3800,
            kl_trung_thau: 3800,
            dg_du_toan: 1850000,
            dg_trung_thau: 1780000,
            status: 'MATCHED',
            note: 'Đơn giá giảm 70.000 đ/m3'
          },
          {
            ma: 'BOQ-002',
            noi_dung: 'Thép cốt bê tông CB400 đường kính d10-d32',
            dvt: 'tấn',
            kl_du_toan: 820,
            kl_trung_thau: 845,
            dg_du_toan: 17200000,
            dg_trung_thau: 17200000,
            status: 'QTY_DIFF',
            note: 'Khối lượng tăng +25 tấn so với thiết kế ban đầu'
          },
          {
            ma: 'BOQ-003',
            noi_dung: 'Đào móng đất cấp 3 vận chuyển đổ thải',
            dvt: 'm3',
            kl_du_toan: 15400,
            kl_trung_thau: 15400,
            dg_du_toan: 110000,
            dg_trung_thau: 105000,
            status: 'MATCHED',
            note: 'Khớp khối lượng'
          }
        ];
      } else if (_activeMode === 'payment_vs_contract') {
        _items = [
          {
            ma_hd: 'HD00132763',
            so_hd: '132/2026/HĐTC',
            nt: 'Công ty Cổ phần VinCons',
            gia_tri_hd: 115400000000,
            luy_ke_tt: 41580000000,
            ty_le_tt: '36.0%',
            con_lai: 73820000000,
            status: 'NORMAL',
            note: 'Tiến độ thanh toán bình thường'
          },
          {
            ma_hd: 'HD00132764',
            so_hd: '135/2026/HĐMB',
            nt: 'Công ty Cổ phần Cadivi',
            gia_tri_hd: 28600000000,
            luy_ke_tt: 25740000000,
            ty_le_tt: '90.0%',
            con_lai: 2860000000,
            status: 'NEARING_LIMIT',
            note: 'Đã giải ngân 90%, giữ lại 10% bảo hành'
          },
          {
            ma_hd: 'HD00132769',
            so_hd: '142/2026/HĐXL',
            nt: 'Công ty Thăng Long M&C',
            gia_tri_hd: 14200000000,
            luy_ke_tt: 14500000000,
            ty_le_tt: '102.1%',
            con_lai: -300000000,
            status: 'OVER_DISBURSED',
            note: 'CẢNH BÁO: Vượt giá trị HĐ 300 triệu (Cần bổ sung PLHĐ)'
          }
        ];
      } else {
        _items = [
          { truong: 'Mã Hợp Đồng', ocr_val: 'HD 00132763', ai_val: 'HD00132763', conf: '99%', status: 'MATCHED', note: 'AI tự động bỏ dấu cách thừa' },
          { truong: 'Giá trị Hợp đồng', ocr_val: '115.400.000.000 đ', ai_val: '115400000000', conf: '98%', status: 'MATCHED', note: 'Đúng số tiền số và chữ' },
          { truong: 'Thời hạn hoàn thành', ocr_val: '360 ngày', ai_val: '15/08/2027', conf: '85%', status: 'WARNING', note: 'AI tự quy đổi ngày từ ngày ký' },
          { truong: 'Chữ ký số bên B', ocr_val: 'Hợp lệ (Viettel-CA)', ai_val: 'Hợp lệ', conf: '100%', status: 'MATCHED', note: 'Chứng thư số còn hiệu lực' }
        ];
      }

      updateSummaryChips();
      renderTable();
    } finally {
      setLoading(false);
    }
  }

  function updateSummaryChips() {
    let matched = 0;
    let diff = 0;
    let pending = 0;

    _items.forEach(item => {
      if (item.status === 'MATCHED' || item.status === 'NORMAL') matched++;
      else if (item.status === 'PENDING_CONTRACT') pending++;
      else diff++;
    });

    const setT = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setT('cmp-count-matched', `${matched} mục`);
    setT('cmp-count-diff', `${diff} mục`);
    setT('cmp-count-pending', `${pending} mục`);
  }

  function renderTable() {
    const thead = document.getElementById('cmp-table-head');
    const tbody = document.getElementById('cmp-table-body');
    const countEl = document.getElementById('cmp-record-count');
    if (!thead || !tbody) return;

    let filtered = _items;
    if (_onlyDiff) {
      filtered = filtered.filter(x => x.status !== 'MATCHED' && x.status !== 'NORMAL');
    }
    if (_searchQuery) {
      const q = _searchQuery.toLowerCase();
      filtered = filtered.filter(x => JSON.stringify(x).toLowerCase().includes(q));
    }

    let headers = [];
    let rows = [];

    if (_activeMode === 'hsmt_vs_hd') {
      headers = ['STT', 'Mã HSMT', 'Mã Hợp Đồng', 'Tên gói thầu / Nội dung', 'Ngân sách HSMT', 'Giá trị Hợp đồng', 'Chênh lệch (VNĐ)', 'Tỷ lệ %', 'Kết quả đối chiếu', 'Ghi chú'];
      rows = filtered.map((r, i) => {
        const diffVal = r.du_toan && r.gia_hd ? (r.gia_hd - r.du_toan) : 0;
        const diffPct = r.du_toan && r.gia_hd ? ((diffVal / r.du_toan) * 100).toFixed(1) + '%' : '—';
        const diffColor = diffVal > 0 ? 'text-error' : (diffVal < 0 ? 'text-emerald-400' : 'text-base-content/70');
        const badge = r.status === 'MATCHED'
          ? '<span class="badge badge-sm badge-success font-bold">✅ Đã khớp</span>'
          : (r.status === 'OVER_BUDGET'
            ? '<span class="badge badge-sm badge-error font-bold">⚠️ Vượt dự toán</span>'
            : '<span class="badge badge-sm badge-warning font-bold">⏳ Chờ ký HĐ</span>');

        return [
          i + 1,
          `<span class="font-mono font-bold text-primary">${r.ma_hsmt}</span>`,
          `<span class="font-mono font-bold text-secondary">${r.ma_hd}</span>`,
          `<div class="max-w-xs truncate">${r.ten_goi}</div>`,
          `<span class="font-mono text-right">${r.du_toan.toLocaleString('vi-VN')} đ</span>`,
          `<span class="font-mono font-bold text-right">${r.gia_hd ? r.gia_hd.toLocaleString('vi-VN') + ' đ' : '—'}</span>`,
          `<span class="font-mono font-bold text-right ${diffColor}">${diffVal ? (diffVal > 0 ? '+' : '') + diffVal.toLocaleString('vi-VN') + ' đ' : '—'}</span>`,
          `<span class="font-mono font-semibold ${diffColor}">${diffPct}</span>`,
          badge,
          `<span class="text-xs text-base-content/70">${r.note}</span>`
        ];
      });
    } else if (_activeMode === 'boq_diff') {
      headers = ['STT', 'Mã hiệu', 'Nội dung công việc', 'ĐVT', 'KL Dự toán', 'KL Trúng thầu', 'Lệch KL', 'Đơn giá DT', 'Đơn giá TT', 'Kết luận'];
      rows = filtered.map((r, i) => {
        const diffKl = r.kl_trung_thau - r.kl_du_toan;
        return [
          i + 1,
          `<span class="font-mono font-bold text-primary">${r.ma}</span>`,
          r.noi_dung,
          `<span class="badge badge-xs">${r.dvt}</span>`,
          `<span class="font-mono">${r.kl_du_toan.toLocaleString('vi-VN')}</span>`,
          `<span class="font-mono font-bold">${r.kl_trung_thau.toLocaleString('vi-VN')}</span>`,
          `<span class="font-mono font-bold ${diffKl > 0 ? 'text-warning' : (diffKl < 0 ? 'text-emerald-400' : '')}">${diffKl ? (diffKl > 0 ? '+' : '') + diffKl : '0'}</span>`,
          `<span class="font-mono">${r.dg_du_toan.toLocaleString('vi-VN')}</span>`,
          `<span class="font-mono font-bold">${r.dg_trung_thau.toLocaleString('vi-VN')}</span>`,
          r.status === 'MATCHED'
            ? '<span class="badge badge-sm badge-success font-bold">Khớp chuẩn</span>'
            : '<span class="badge badge-sm badge-warning font-bold">Lệch khối lượng</span>'
        ];
      });
    } else if (_activeMode === 'payment_vs_contract') {
      headers = ['STT', 'Mã HĐ', 'Số HĐ', 'Nhà thầu', 'Giá trị Hợp đồng', 'Lũy kế thanh toán', 'Tỷ lệ % TT', 'Giá trị còn lại', 'Tình trạng'];
      rows = filtered.map((r, i) => {
        return [
          i + 1,
          `<span class="font-mono font-bold text-primary">${r.ma_hd}</span>`,
          `<span class="font-semibold">${r.so_hd}</span>`,
          r.nt,
          `<span class="font-mono font-bold">${r.gia_tri_hd.toLocaleString('vi-VN')} đ</span>`,
          `<span class="font-mono font-bold text-emerald-400">${r.luy_ke_tt.toLocaleString('vi-VN')} đ</span>`,
          `<span class="badge badge-sm badge-info font-bold">${r.ty_le_tt}</span>`,
          `<span class="font-mono font-bold ${r.con_lai < 0 ? 'text-error animate-pulse' : 'text-amber-400'}">${r.con_lai.toLocaleString('vi-VN')} đ</span>`,
          r.con_lai < 0
            ? '<span class="badge badge-sm badge-error font-bold">⚠️ VƯỢT GIÁ TRỊ</span>'
            : '<span class="badge badge-sm badge-success font-semibold">An toàn</span>'
        ];
      });
    } else {
      headers = ['STT', 'Trường thông tin', 'Giá trị OCR', 'Giá trị AI trích xuất', 'Độ tin cậy', 'Tình trạng', 'Ghi chú'];
      rows = filtered.map((r, i) => [
        i + 1,
        `<span class="font-bold">${r.truong}</span>`,
        `<span class="font-mono text-base-content/80">${r.ocr_val}</span>`,
        `<span class="font-mono font-bold text-primary">${r.ai_val}</span>`,
        `<span class="badge badge-sm badge-ghost font-bold">${r.conf}</span>`,
        r.status === 'MATCHED'
          ? '<span class="badge badge-sm badge-success font-bold">Khớp</span>'
          : '<span class="badge badge-sm badge-warning font-bold">Xem lại</span>',
        r.note
      ]);
    }

    thead.innerHTML = `<tr>${headers.map(h => `<th class="py-2.5 px-3 whitespace-nowrap">${h}</th>`).join('')}</tr>`;
    tbody.innerHTML = rows.map(r => `
      <tr class="hover:bg-base-200/50 border-b border-[#2E2E2A] text-xs transition-colors">
        ${r.map(c => `<td class="py-2 px-3">${c}</td>`).join('')}
      </tr>
    `).join('');

    if (countEl) countEl.textContent = `${filtered.length} mục`;
  }

  function exportExcel() {
    const title = MODE_TITLES[_activeMode] || 'Bao_Cao_Doi_Chieu';
    const filename = `${title.replace(/[\s\/:*?"<>|]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    const table = document.getElementById('cmp-main-table');
    if (!table) return;

    let csv = [];
    const rows = table.querySelectorAll('tr');
    rows.forEach(r => {
      const cols = r.querySelectorAll('th, td');
      const rowData = [];
      cols.forEach(c => {
        let t = c.innerText.replace(/"/g, '""').trim();
        rowData.push(`"${t}"`);
      });
      csv.push(rowData.join(','));
    });

    const csvContent = '\uFEFF' + csv.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    if (typeof toast === 'function') toast(`Đã xuất báo cáo đối chiếu: ${filename}`, 'success');
  }

  async function openDriveFolder() {
    if (typeof DrivePicker !== 'undefined' && DrivePicker.promptFolder) {
      await DrivePicker.promptFolder('Chọn thư mục Google Drive để đối chiếu hồ sơ');
    } else {
      window.open('https://drive.google.com/drive/my-drive', '_blank');
    }
  }

  function onSearch(val) {
    _searchQuery = val;
    renderTable();
  }

  return {
    init,
    setMode,
    toggleOnlyDiff,
    runComparison,
    exportExcel,
    openDriveFolder,
    onSearch
  };
})();
