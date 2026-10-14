'use strict';
const DrivePicker = (() => {
  let target=null, selected=null, generation=0;
  function status(text){
    const el = document.getElementById('drive-picker-status');
    if (el) el.textContent = text;
  }

  async function open(tab){
    target={id:tab.id,name:tab.name,project:tab.project||''};selected=null;generation++;
    const titleEl = document.getElementById('drive-picker-title');
    if (titleEl) titleEl.textContent='Chọn nguồn online — '+(tab.name||'Google Drive');
    const addBtn = document.getElementById('drive-picker-add');
    if (addBtn) addBtn.disabled=true;
    const tree=document.getElementById('drive-picker-tree');
    if (tree) tree.replaceChildren();
    const modal = document.getElementById('drive-picker-modal');
    if (modal) modal.showModal();
    status('Đang tải tài khoản…');
    const res=await API.call('get_drive_accounts');
    if(!res.ok){status(res.error);return;}
    if(!res.data.length){status('Chưa đăng nhập Drive. Vào Cài đặt → Quản lý Link để thêm tài khoản.');return;}
    status('Mở tài khoản và thư mục, bấm Chọn thư mục rồi Thêm.');
    for(const a of res.data){
      const group=document.createElement('details'),title=document.createElement('summary');
      group.className='p-2 border border-base-300 rounded-lg';title.className='cursor-pointer font-bold';title.textContent='👤 '+(a.email||a.name);group.append(title);
      group.append(node(a.id,{id:'root',name:'Drive của tôi'},true),node(a.id,{id:'shared',name:'Được chia sẻ với tôi'},false));
      if (tree) tree.append(group);
      let sharedLoaded=false;
      group.addEventListener('toggle',async()=>{
        if(!group.open||sharedLoaded)return;sharedLoaded=true;
        const shared=await API.call('get_drive_shared_drives',a.id);
        if(shared.ok && Array.isArray(shared.data))for(const d of shared.data)group.append(node(a.id,{id:d.id,name:'Bộ nhớ dùng chung: '+d.name}));
        else if(!shared.ok){const msg=document.createElement('p');msg.className='text-xs';msg.textContent=shared.error;group.append(msg);}
      });
    }
  }

  function node(account,folder,selectable=true){
    const details=document.createElement('details'),summary=document.createElement('summary'),label=document.createElement('span'),children=document.createElement('div');
    details.className='pl-3';summary.className='cursor-pointer py-1';label.textContent='📁 '+folder.name;summary.append(label);
    if(selectable){
      const b=document.createElement('button');b.className='btn btn-xs btn-outline ml-2';b.textContent='Chọn thư mục';
      b.onclick=e=>{
        e.preventDefault();e.stopPropagation();
        selected={account,folder};
        const addBtn = document.getElementById('drive-picker-add');
        if (addBtn) addBtn.disabled=false;
        status('Đã chọn: '+folder.name+' → '+(target?target.name:''));
        // If an input exists in drive-link-modal, update it
        const input = document.getElementById('drive-link-input');
        if (input) input.value = `https://drive.google.com/drive/folders/${folder.id}`;
      };
      summary.append(b);
    }
    details.append(summary,children);let loaded=false,busy=false;const version=generation;
    details.addEventListener('toggle',async()=>{
      if(!details.open||loaded||busy)return;busy=true;children.textContent='Đang tải…';
      try{
        const res=await API.call('get_drive_folder_children',account,folder.id,true);
        if(version!==generation)return;if(!res.ok)throw new Error(res.error);
        children.replaceChildren();for(const f of res.data)children.append(node(account,f));
        if(!res.data.length)children.textContent='Không có thư mục con';loaded=true;
      }catch(e){children.textContent=e.message+' — đóng rồi mở lại để thử.';}finally{busy=false;}
    });return details;
  }

  async function add(){
    if(!selected||!target)return;
    const addBtn = document.getElementById('drive-picker-add');
    if (addBtn) addBtn.disabled=true;
    status('Đang thêm nguồn…');
    const res=await API.call('add_explorer_online_source',target.id,selected.account,selected.folder.id,target.project);
    if(!res.ok){
      status(res.error);
      if (addBtn) addBtn.disabled=false;
      return;
    }
    const pickerModal = document.getElementById('drive-picker-modal');
    if (pickerModal) pickerModal.close();
    if (typeof ExplorerModule !== 'undefined' && ExplorerModule.applyOnlineSource) {
      await ExplorerModule.applyOnlineSource(target.id,res.data);
    }
    if (typeof toast === 'function') toast('Đã thêm nguồn Drive: '+res.data.name,'success');
  }

  // ── Prompt Folder via Google Drive Link Modal ────────────────────────────
  function extractDriveFolderName(url) {
    if (!url) return 'Thư mục Google Drive';
    if (url.includes('02.0') || url.toLowerCase().includes('hsmt')) return '02.0 HSMT (Google Drive)';
    if (url.includes('03.0') || url.toLowerCase().includes('hop dong') || url.toLowerCase().includes('hợp đồng')) return '03.0 Hợp đồng CKS (Google Drive)';
    if (url.includes('08.01') || url.toLowerCase().includes('tu, tt') || url.toLowerCase().includes('thanh toan')) return '08.01. TƯ, TT (Google Drive)';
    if (url.includes('01.01') || url.toLowerCase().includes('phe duyet')) return '01.01 Phê duyệt (Google Drive)';
    if (url.includes('01.02') || url.toLowerCase().includes('tien do')) return '01.02 Tiến độ (Google Drive)';
    const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (m) return `Thư mục Drive [${m[1].slice(0, 8)}...]`;
    return 'Thư mục Google Drive';
  }

  function getRecentDriveFolders() {
    try {
      const saved = localStorage.getItem('recent_drive_folders');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return [
      { name: '📁 02.0 HSMT Dự án', url: 'https://drive.google.com/drive/folders/1_HSMT_DanPhuong_Official' },
      { name: '📁 03.0 Hợp đồng CKS', url: 'https://drive.google.com/drive/folders/1_HD_DanPhuong_Official' },
      { name: '📁 08.01. TƯ, TT (Thanh toán)', url: 'https://drive.google.com/drive/folders/1_TUTT_DanPhuong_Official' },
      { name: '📁 01.01. Tờ trình phê duyệt', url: 'https://drive.google.com/drive/folders/1_PheDuyet_DanPhuong' },
      { name: '📁 File Quản lý Tổng hợp', url: 'https://drive.google.com/drive/folders/1_QLDA_DanPhuong_Official' }
    ];
  }

  function saveRecentDriveFolder(url, name) {
    if (!url) return;
    try {
      const list = getRecentDriveFolders();
      const existing = list.find(x => x.url === url);
      if (!existing) {
        list.unshift({ name: name || extractDriveFolderName(url), url: url });
        if (list.length > 8) list.pop();
        localStorage.setItem('recent_drive_folders', JSON.stringify(list));
      }
    } catch (_) {}
  }

  function renderRecentDriveLinks() {
    const listEl = document.getElementById('drive-link-recent-list');
    if (!listEl) return;
    const folders = getRecentDriveFolders();
    listEl.innerHTML = folders.map(f => `
      <button type="button" class="btn btn-xs btn-outline justify-start gap-1.5 text-left text-xs truncate max-w-full hover:bg-primary/20"
              onclick="document.getElementById('drive-link-input').value='${f.url}'">
        <span>📂</span>
        <span class="truncate font-semibold">${window.escapeHtml ? window.escapeHtml(f.name) : f.name}</span>
      </button>
    `).join('');
  }

  function promptFolder(title, defaultVal) {
    return new Promise((resolve) => {
      const modal = document.getElementById('drive-link-modal');
      if (!modal) {
        const url = prompt((title || 'Nhập Link hoặc ID thư mục Google Drive') + ':', defaultVal || 'https://drive.google.com/drive/folders/...');
        if (url && url.trim()) {
          const u = url.trim();
          saveRecentDriveFolder(u);
          resolve({ ok: true, data: { folder: u, name: extractDriveFolderName(u), isDrive: true } });
        } else {
          resolve({ ok: false, error: 'Người dùng đã hủy chọn thư mục' });
        }
        return;
      }

      const titleEl = document.getElementById('drive-link-title');
      const inputEl = document.getElementById('drive-link-input');
      const confirmBtn = document.getElementById('drive-link-confirm');
      const cancelBtn = document.getElementById('drive-link-cancel');
      const openPickerBtn = document.getElementById('drive-link-open-picker');

      if (titleEl) titleEl.textContent = title || 'Kết nối Thư mục Google Drive';
      if (inputEl) inputEl.value = defaultVal || '';

      renderRecentDriveLinks();

      function onConfirm() {
        const val = inputEl ? inputEl.value.trim() : '';
        if (!val) {
          if (typeof toast === 'function') toast('Vui lòng nhập Link hoặc mã thư mục Google Drive!', 'warning');
          return;
        }
        cleanup();
        modal.close();
        saveRecentDriveFolder(val);
        resolve({ ok: true, data: { folder: val, name: extractDriveFolderName(val), isDrive: true } });
      }

      function onCancel() {
        cleanup();
        modal.close();
        resolve({ ok: false, error: 'Người dùng đã hủy chọn thư mục' });
      }

      function onOpenPicker() {
        modal.close();
        cleanup();
        DrivePicker.open({
          id: 'selected_folder',
          name: title || 'Thư mục Google Drive',
          project: (window.currentProject || 'Dự án')
        });
      }

      function cleanup() {
        if (confirmBtn) confirmBtn.removeEventListener('click', onConfirm);
        if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
        if (openPickerBtn) openPickerBtn.removeEventListener('click', onOpenPicker);
      }

      if (confirmBtn) confirmBtn.addEventListener('click', onConfirm);
      if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
      if (openPickerBtn) openPickerBtn.addEventListener('click', onOpenPicker);

      modal.showModal();
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      }
    });
  }

  return { open, add, promptFolder, extractDriveFolderName, getRecentDriveFolders, saveRecentDriveFolder, renderRecentDriveLinks };
})();
