/**
 * mail.js — Quản lý Thư tín, Phân loại Email Outlook & Tệp .msg
 * Đồng bộ toàn diện tính năng của OutlookMailTab trên phiên bản Desktop.
 */
'use strict';

const MailModule = (function() {
  let _currentCategory = 'all';
  let _searchQuery = '';
  let _messages = [];
  let _activeMessageId = null;
  let _status = 'Sẵn sàng';
  let _currentScanFolder = '';

  const SAMPLE_MAILS = [
    {
      id: 'msg-001',
      sender: 'Nguyễn Văn Hùng (Ban QLDA)',
      email: 'hung.nv@vinhomes.vn',
      subject: 'Thông báo Phát hành HSMT Gói thầu Thi công Kết cấu Thân Lô 01-03',
      date: '14/10/2026 09:30',
      category: 'hsmt',
      categoryLabel: 'HSMT',
      project: 'Vinhomes Đan Phượng',
      body: `Kính gửi các Đơn vị và Nhà thầu liên quan,

Ban Quản lý Dự án xin thông báo phát hành Hồ sơ Mời thầu (HSMT) số 01/2026/TB-HSMT cho:
- Gói thầu: Thi công Kết cấu Thân Lô 01-03
- Dự án: Vinhomes Đan Phượng
- Thời hạn nộp hồ sơ dự thầu: Trước 17h00 ngày 25/10/2026.
- Hồ sơ đính kèm gồm: File HSMT (.docx) và bảng Tiên lượng Khối lượng BOQ (.xlsx).

Đề nghị các bộ phận Kỹ thuật, Đấu thầu phối hợp kiểm tra và cập nhật tiến độ vào hệ thống theo dõi.

Trân trọng,
Nguyễn Văn Hùng - Ban QLDA`,
      attachments: ['HSMT_Ket_Cau_Than_Lo_01-03.docx', 'BOQ_Du_Toan_Chi_Tiet.xlsx'],
      unread: true
    },
    {
      id: 'msg-002',
      sender: 'Trần Thị Mai (Phòng Đấu thầu)',
      email: 'mai.tt@vinhomes.vn',
      subject: 'Ký kết Hợp đồng Kinh tế số 1151/2026/HĐ-VHM - Nhà thầu Coteccons',
      date: '13/10/2026 15:45',
      category: 'contract',
      categoryLabel: 'Hợp đồng',
      project: 'Vinhomes Đan Phượng',
      body: `Kính gửi Ban Giám đốc và các Phòng ban,

Đã hoàn tất thủ tục thương thảo và ký kết Hợp đồng kinh tế số 1151/2026/HĐ-VHM:
- Nhà thầu thi công: Công ty Cổ phần Xây dựng Coteccons
- Nội dung: Thi công Cọc khoan nhồi Phân khu 1
- Giá trị hợp đồng: 45.820.000.000 VNĐ (đã bao gồm thuế GTGT)
- File PDF đính kèm đã có Chữ ký số CKS hợp lệ từ hai bên.

Kính chuyển bộ phận Theo dõi cập nhật vào danh mục Hợp đồng và chuẩn bị thủ tục tạm ứng đợt 1.

Trân trọng!`,
      attachments: ['HopDong_1151_2026_CKS_Signed.pdf'],
      unread: false
    },
    {
      id: 'msg-003',
      sender: 'Lê Hoàng Long (Bộ phận Quản lý Khối lượng)',
      email: 'long.lh@vinhomes.vn',
      subject: 'Hồ sơ Đề nghị Thanh toán Đợt 03 - Nhà thầu Hòa Bình (Mã CCM-089)',
      date: '12/10/2026 11:20',
      category: 'payment',
      categoryLabel: 'TƯ, TT',
      project: 'Vinhomes Đan Phượng',
      body: `Kính gửi Phòng Tài chính - Kế toán & Ban QLDA,

Bộ phận Quản lý Khối lượng đã hoàn tất kiểm tra và xác nhận khối lượng hoàn thành Đợt 3:
- Nhà thầu: Công ty CP Tập đoàn Xây dựng Hòa Bình
- Hợp đồng số: 98/2025/HĐ-VHM
- Giá trị đề nghị thanh toán đợt 3: 4.850.000.000 VNĐ
- Mã CCM SAP: CCM-2026-089
- Tình trạng: KSTĐ và TVGS đã ký duyệt đủ hồ sơ chất lượng.

Kính trình Ban Giám đốc xem xét duyệt chi tạm ứng/thanh toán.`,
      attachments: ['Bang_Xac_Nhan_Khoi_Luong_Dot_3.xlsx', 'De_Nghi_Thanh_Toan_HB.pdf'],
      unread: false
    },
    {
      id: 'msg-004',
      sender: 'Vũ Đức Thịnh (KSTK Kiến trúc)',
      email: 'thinh.vd@vinhomes.vn',
      subject: 'Bàn giao Bản vẽ Thiết kế Thi công (BVTK) Tòa HH1 đợt 2 (Kèm CKS)',
      date: '11/10/2026 14:10',
      category: 'bvtk',
      categoryLabel: 'BVTK',
      project: 'Vinhomes Đan Phượng',
      body: `Kính gửi Ban QLDA Vinhomes Đan Phượng,

Bộ phận Kiểm soát Thiết kế xin bàn giao bộ Bản vẽ thiết kế thi công (BVTK) Tòa HH1 (đợt 2):
- Bao gồm bản vẽ kiến trúc, kết cấu và MEP chi tiết đã điều chỉnh.
- Toàn bộ các file PDF đã được ký số xác nhận bởi Chủ nhiệm đồ án.
- Đề nghị phòng Đấu thầu đối chiếu liên kết với Mã HSMT tương ứng.

Trân trọng,
Vũ Đức Thịnh`,
      attachments: ['BVTK_Toa_HH1_KienTruc_Rev02.pdf', 'Thuyet_Minh_Dieu_Chinh.docx'],
      unread: false
    },
    {
      id: 'msg-005',
      sender: 'Ban Thư ký HĐQT',
      email: 'thuky@vinhomes.vn',
      subject: 'Quyết định Phê duyệt Chủ trương Đầu tư & Lựa chọn Nhà thầu Hạ tầng',
      date: '10/10/2026 08:15',
      category: 'chu-truong',
      categoryLabel: 'Chủ trương',
      project: 'Vinhomes Đan Phượng',
      body: `Kính gửi các Trưởng phòng ban và Ban QLDA,

Chủ tịch HĐQT đã ký ban hành Quyết định phê duyệt Chủ trương đầu tư và phương án chỉ định/chào hàng cạnh tranh gói thầu Hạ tầng kỹ thuật số 02.
- Số quyết định: 88/2026/QĐ-CT-VHM
- Ngày ban hành: 10/10/2026.

Đề nghị các bộ phận thực hiện theo đúng kế hoạch tiến độ được phê duyệt.`,
      attachments: ['QD_Chu_Truong_88_2026.pdf'],
      unread: false
    }
  ];

  function init() {
    if (_messages.length === 0) {
      _messages = [...SAMPLE_MAILS];
    }
    renderCategoryCounters();
    renderMailList();
    if (_messages.length > 0 && !_activeMessageId) {
      selectMail(_messages[0].id);
    }
  }

  function setCategory(cat) {
    _currentCategory = cat;
    document.querySelectorAll('.mail-cat-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cat === cat);
    });
    renderMailList();
  }

  function onSearch(val) {
    _searchQuery = (val || '').toLowerCase().trim();
    renderMailList();
  }

  function getFilteredMails() {
    return _messages.filter(m => {
      if (_currentCategory !== 'all' && m.category !== _currentCategory) return false;
      if (_searchQuery) {
        const text = `${m.subject} ${m.sender} ${m.email} ${m.body} ${(m.attachments || []).join(' ')}`.toLowerCase();
        if (!text.includes(_searchQuery)) return false;
      }
      return true;
    });
  }

  function renderCategoryCounters() {
    const counts = { all: _messages.length, hsmt: 0, contract: 0, payment: 0, bvtk: 0, 'chu-truong': 0 };
    _messages.forEach(m => {
      if (counts[m.category] !== undefined) counts[m.category]++;
    });
    Object.entries(counts).forEach(([cat, num]) => {
      const el = document.getElementById(`mail-badge-${cat}`);
      if (el) el.textContent = num;
    });
  }

  function renderMailList() {
    const container = document.getElementById('mail-list-container');
    if (!container) return;
    const mails = getFilteredMails();

    if (mails.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center p-8 text-[#908CAA] text-xs space-y-2">
          <span class="text-3xl">📭</span>
          <span>Không có email nào phù hợp với bộ lọc hiện tại</span>
        </div>
      `;
      return;
    }

    container.innerHTML = mails.map(m => {
      const isSelected = m.id === _activeMessageId;
      const catBadgeColor = m.category === 'hsmt' ? 'bg-[#3498DB]' :
                            m.category === 'contract' ? 'bg-[#9B59B6]' :
                            m.category === 'payment' ? 'bg-[#0F6E56]' :
                            m.category === 'bvtk' ? 'bg-[#F39C12]' : 'bg-[#E74C3C]';

      return `
        <div class="mail-item p-2.5 rounded-lg border border-[#2E2E2A] cursor-pointer transition-all ${isSelected ? 'bg-[#2A2A27] border-[#0F6E56]' : 'bg-[#1E1E1C] hover:bg-[#232320]'}" onclick="MailModule.selectMail('${m.id}')">
          <div class="flex items-center justify-between text-[11px] mb-1">
            <span class="font-bold text-[#EDEDEA] truncate flex-1 pr-2">${window.escapeHtml(m.sender)}</span>
            <span class="text-[#888780] flex-shrink-0 font-mono">${m.date.split(' ')[0]}</span>
          </div>
          <div class="font-semibold text-xs text-[#E0DEF4] line-clamp-1 mb-1">
            ${m.unread ? '<span class="inline-block w-2 h-2 rounded-full bg-[#3498DB] mr-1.5"></span>' : ''}
            ${window.escapeHtml(m.subject)}
          </div>
          <div class="text-[11px] text-[#908CAA] line-clamp-2 leading-relaxed mb-2">
            ${window.escapeHtml(m.body.replace(/\n+/g, ' '))}
          </div>
          <div class="flex items-center justify-between text-[10px]">
            <span class="${catBadgeColor} text-white px-2 py-0.5 rounded font-bold">${m.categoryLabel}</span>
            ${(m.attachments && m.attachments.length) ? `
              <span class="text-[#F1C40F] flex items-center gap-1 font-bold">
                <span>📎</span><span>${m.attachments.length} tệp</span>
              </span>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    const countEl = document.getElementById('mail-total-count');
    if (countEl) countEl.textContent = `${mails.length} thư`;
  }

  function selectMail(id) {
    _activeMessageId = id;
    const msg = _messages.find(m => m.id === id);
    if (!msg) return;
    msg.unread = false;
    renderMailList();

    const detailContainer = document.getElementById('mail-detail-container');
    if (!detailContainer) return;

    detailContainer.innerHTML = `
      <div class="flex flex-col h-full overflow-hidden bg-[#181816] rounded-xl border border-[#2E2E2A]">
        <!-- Mail Header Toolbar -->
        <div class="p-3 border-b border-[#2E2E2A] flex items-center justify-between bg-[#1E1E1C] flex-shrink-0 flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <button class="btn btn-xs bg-[#0F6E56] hover:bg-[#0D5C48] text-white font-bold border-none rounded gap-1" onclick="MailModule.sendToB1Word('${msg.id}')">
              <span>🚀</span><span>Chuyển sang B1. Tạo Word</span>
            </button>
            <button class="btn btn-xs bg-[#242421] hover:bg-[#312F44] text-[#E0DEF4] border border-[#312F44] rounded gap-1" onclick="MailModule.sendToHsmt('${msg.id}')">
              <span>📑</span><span>Gán sang B6.1 Đọc HSMT</span>
            </button>
            <button class="btn btn-xs bg-[#242421] hover:bg-[#312F44] text-[#E0DEF4] border border-[#312F44] rounded gap-1" onclick="MailModule.exportMailText('${msg.id}')">
              <span>📋</span><span>Sao chép thư</span>
            </button>
          </div>
          <span class="text-xs text-[#908CAA] font-mono">${msg.date}</span>
        </div>

        <!-- Subject & Sender Info -->
        <div class="p-4 border-b border-[#2E2E2A] flex flex-col gap-2 bg-[#1B1B18] flex-shrink-0">
          <h2 class="text-base font-extrabold text-[#EDEDEA] leading-snug">${window.escapeHtml(msg.subject)}</h2>
          <div class="flex items-center justify-between text-xs text-[#908CAA]">
            <div class="flex items-center gap-2">
              <span class="font-bold text-[#E0DEF4]">${window.escapeHtml(msg.sender)}</span>
              <span>&lt;${window.escapeHtml(msg.email)}&gt;</span>
            </div>
            <span class="bg-[#242421] text-[#F39C12] border border-[#312F44] px-2 py-0.5 rounded text-[11px] font-bold">
              🏢 ${window.escapeHtml(msg.project)}
            </span>
          </div>
        </div>

        <!-- Attachments List -->
        ${(msg.attachments && msg.attachments.length) ? `
          <div class="px-4 py-2 bg-[#20201D] border-b border-[#2E2E2A] flex items-center gap-2 flex-wrap flex-shrink-0 text-xs">
            <span class="font-bold text-[#F1C40F] flex items-center gap-1">
              <span>📎</span><span>Tệp đính kèm (${msg.attachments.length}):</span>
            </span>
            ${msg.attachments.map(att => `
              <span class="bg-[#2A2A27] border border-[#3A3A37] text-[#E0DEF4] px-2.5 py-1 rounded flex items-center gap-1.5 cursor-pointer hover:border-[#0F6E56]" onclick="toast('Mở file đính kèm: ${window.escapeHtml(att)}', 'info')">
                <span>📄</span><span>${window.escapeHtml(att)}</span>
              </span>
            `).join('')}
          </div>
        ` : ''}

        <!-- Mail Body Content -->
        <div class="flex-1 p-4 overflow-y-auto text-xs text-[#EDEDEA] leading-relaxed whitespace-pre-wrap select-text font-sans">
          ${window.escapeHtml(msg.body)}
        </div>
      </div>
    `;
  }

  async function connectOutlook() {
    toast('Đang kết nối dịch vụ Outlook Classic...', 'info');
    const res = await API.call('connect_outlook');
    if (res && res.ok) {
      toast('Kết nối Outlook thành công!', 'success');
      _status = 'Đã kết nối Outlook';
    } else {
      toast('Không tìm thấy tiến trình Outlook trên máy. Hiển thị kho thư lưu trữ sẵn có.', 'info');
    }
  }

  async function chooseScanFolder() {
    const res = await API.call('select_folder_dialog', 'Chọn thư mục chứa file Email (.msg)');
    if (res && res.folder) {
      _currentScanFolder = res.folder;
      toast(`Đang quét thư mục: ${res.folder}...`, 'info');
      const scanRes = await API.call('scan_msg_folder', res.folder);
      if (scanRes && scanRes.ok && scanRes.data?.files) {
        const files = scanRes.data.files;
        toast(`Tìm thấy ${files.length} file email (.msg)!`, 'success');
        files.forEach((f, i) => {
          _messages.unshift({
            id: `scanned-${i}`,
            sender: f.sender || 'Email quét từ ổ đĩa',
            email: f.email || 'local@disk.msg',
            subject: f.subject || f.filename || 'Thư mục gói thầu',
            date: f.date || 'Hôm nay',
            category: 'hsmt',
            categoryLabel: 'HSMT',
            project: 'Vinhomes Đan Phượng',
            body: f.body || `Nội dung trích xuất từ file: ${f.filename}\nĐường dẫn: ${f.full_path}`,
            attachments: f.attachments || [f.filename],
            unread: true
          });
        });
        renderCategoryCounters();
        renderMailList();
        selectMail(_messages[0].id);
      }
    }
  }

  function sendToB1Word(id) {
    const msg = _messages.find(m => m.id === id);
    if (!msg) return;
    toast(`Đã gán email "${msg.subject.substring(0, 30)}..." sang B1. Tạo Word`, 'success');
    switchTopNav('chuc_nang');
    switchChucNangSubTab('word');
  }

  function sendToHsmt(id) {
    const msg = _messages.find(m => m.id === id);
    if (!msg) return;
    toast(`Đã gán email "${msg.subject.substring(0, 30)}..." sang B6.1 Đọc HSMT`, 'success');
    switchTopNav('chuc_nang');
    switchChucNangSubTab('cn-skill-hsmt');
  }

  function exportMailText(id) {
    const msg = _messages.find(m => m.id === id);
    if (!msg) return;
    const text = `Tiêu đề: ${msg.subject}\nNgười gửi: ${msg.sender} <${msg.email}>\nNgày: ${msg.date}\n\n${msg.body}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast('Đã sao chép nội dung thư vào Clipboard!', 'success');
    }
  }

  return {
    init,
    setCategory,
    onSearch,
    selectMail,
    connectOutlook,
    chooseScanFolder,
    sendToB1Word,
    sendToHsmt,
    exportMailText
  };
})();
