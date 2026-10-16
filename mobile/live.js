'use strict';
(()=>{
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const TOKEN='awm_session',trackingMenu={progress:'progress',hsmt:'hsmt',contract:'contract','contractor:detail':'contract',payment:'payment',boq:'hsmt','chu-truong':'approval',bvtk:'design'};let bootstrap=null,page='home',project='',tab='',query='',epoch=0,records=[],columns=[],cursor=null,folders={},menu='',trail=[],driveFiles=[],driveNext='',timer=null,todoFilter='open',todoItems=[],linkScope='project',linkItems=[],linkSearch='',driveSyncing=false;
 function notice(s){$('toast').textContent=s;$('toast').style.display='block';clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('toast').style.display='none',4000)}
 async function rpc(method,args=[]){const token=sessionStorage.getItem(TOKEN);const r=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({method,args}),signal:AbortSignal.timeout(25000)});const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'Không thể kết nối server.');if(data.session_token)sessionStorage.setItem(TOKEN,data.session_token);return data.data}
 const error=(e)=>'<div class="message error">'+esc(e.message)+'</div>';
 function reset(){epoch++;clearTimeout(timer);bootstrap=null;records=[];folders={};driveFiles=[];trail=[];linkItems=[];linkSearch='';driveSyncing=false;AwmDrive.clear();AwmViewer.close();$('sheet').close();$('project').replaceChildren();$('nav').replaceChildren();document.querySelector('.projectbar').hidden=true}
 function auth(message=''){
  reset();$('settings').hidden=true;$('main').innerHTML=`<section class="auth"><span class="logo">B</span><div class="eyebrow">BQLDA / AwM</div><h1>Dự án của bạn.<br>Trong tầm tay.</h1><p class="muted">Đăng nhập Google để xem hồ sơ, Drive và dữ liệu dự án được cấp quyền.</p><div id="google-button"></div><div class="auth-divider"><span>hoặc đăng nhập tài khoản hệ thống</span></div><form id="system-login-form" class="form auth-system"><label>Tên đăng nhập hoặc email<input id="auth-username" autocomplete="username" required maxlength="120" placeholder="admin hoặc email"></label><label>Mật khẩu<input id="auth-password" type="password" autocomplete="current-password" required maxlength="200" placeholder="Nhập mật khẩu"></label><button class="primary" id="auth-system-submit">Đăng nhập tài khoản hệ thống</button></form><div id="auth-message" role="status">${message?error({message}):''}</div><button id="retry-google" class="text-button">Tải lại đăng nhập Google</button><p class="muted">Tài khoản mới cần được quản trị viên phê duyệt. Kết nối Drive được cấp riêng sau đăng nhập.</p></section>`;
  $('retry-google').onclick=()=>location.reload();$('system-login-form').onsubmit=async e=>{e.preventDefault();const target=$('auth-message');target.textContent='Đang đăng nhập…';$('auth-system-submit').disabled=true;try{await rpc('login_user',[$('auth-username').value.trim(),$('auth-password').value]);await boot()}catch(err){target.innerHTML=error(err);$('auth-system-submit').disabled=false}};setupGoogle();
 }
 function setupGoogle(){if(!window.google?.accounts?.id){setTimeout(()=>{if(!bootstrap&&$('google-button'))setupGoogle()},500);return}google.accounts.id.initialize({client_id:window.BQLDA_WEB_CLIENT_ID,callback:async response=>{const target=$('auth-message');if(target)target.textContent='Đang xác thực…';try{await rpc('google_login',[response.credential]);await boot()}catch(e){if($('auth-message'))$('auth-message').innerHTML=error(e)}}});if($('google-button'))google.accounts.id.renderButton($('google-button'),{theme:'outline',size:'large',width:Math.min(320,innerWidth-60),text:'continue_with'});}
 async function boot(){const run=++epoch;try{const data=await rpc('awm_bootstrap');if(run!==epoch)return;bootstrap=data;const defaultProj=(bootstrap.user?.role!=='Admin'&&bootstrap.user?.current_project&&bootstrap.projects.includes(bootstrap.user.current_project))?bootstrap.user.current_project:(bootstrap.projects.includes('Vinhomes Đan Phượng')?'Vinhomes Đan Phượng':(bootstrap.projects[0]||''));if(!bootstrap.projects.length){project=''}else if(!project||!bootstrap.projects.includes(project))project=defaultProj;if(!bootstrap.groups.some(g=>g.id===tab))tab=bootstrap.groups[0]?.id||'';if(!bootstrap.menus.some(m=>m.id===menu))menu=bootstrap.menus[0]?.id||'';$('settings').hidden=false;document.querySelector('.projectbar').hidden=false;$('project').innerHTML=bootstrap.projects.length?bootstrap.projects.map(p=>`<option value="${esc(p)}" ${p===project?'selected':''}>${esc(p)}</option>`).join(''):'<option>Chưa được cấp dự án</option>';$('project').disabled=!bootstrap.projects.length;await render()}catch(e){if(run!==epoch)return;sessionStorage.removeItem(TOKEN);auth(e.message)}}
 function allowed(p){return !!bootstrap?.nav[p]}
 function nav(){const defs=[['home','⌂','Home'],['mail','✉','Mail'],['todo','☷','To do'],['files','▱','QL'],['tracking','▤','Theo dõi']];$('nav').innerHTML=defs.map(([id,icon,label])=>`<button data-page="${id}" ${!allowed(id)?'disabled':''} class="${page===id?'active':''}" ${page===id?'aria-current="page"':''}><b aria-hidden="true">${icon}</b>${label}</button>`).join('');document.querySelectorAll('nav [data-page]').forEach(b=>b.onclick=()=>{page=b.dataset.page;query='';trail=[];render();window.scrollTo({top:0})})}
 async function render(){const run=++epoch;clearTimeout(timer);nav();if(page==='todo'){await todos(run);return}if(page==='links'){await linksPage(run);return}if(!allowed(page)){$('main').innerHTML='<div class="message">Tài khoản chưa được cấp quyền xem mục này.</div>';return}if(!project){$('main').innerHTML='<h1>Chờ cấp dự án</h1><p class="message">Tài khoản đã đăng nhập. Quản trị viên cần cấp dự án để tra cứu hồ sơ.</p>';return}
  if(page==='home'){
   $('main').innerHTML=`<div class="eyebrow">${esc(bootstrap.user.fullname)}</div><h1>Không gian dự án</h1><p class="muted">${esc(project)}</p><section class="cover"><div class="eyebrow">TRA CỨU NHANH</div><h2>Hồ sơ cần xem,<br>ngay trong web.</h2><p>Hợp đồng, HSMT và tài liệu theo quyền của bạn.</p><button class="primary" id="home-track" ${!allowed('tracking')?'disabled':''}>Mở Theo dõi →</button></section><div id="home-stats" class="stats"><div class="stat"><span>Đang tải tổng quan…</span></div></div><div class="sectionhead"><h2>Nhóm hồ sơ</h2></div><div class="quick">${bootstrap.groups.slice(0,4).map(g=>`<button data-group="${g.id}"><b>▤</b>${esc(g.name)}</button>`).join('')}</div><div class="sectionhead"><h2>Nguồn dữ liệu</h2></div><div class="message">Theo dõi: dữ liệu server dùng chung.<br>QL: Drive online của ${esc(bootstrap.user.email)}.<br>Mail: cần AD đang kết nối.<br>Quản lý Link: vào ⚙ Cài đặt.</div>`;
   $('home-track').onclick=()=>{page='tracking';render()};document.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{tab=b.dataset.group;page='tracking';render()});loadHomeSummary(run);return;
  }
  if(page==='tracking'){
   $('main').innerHTML='<div class="eyebrow">DỮ LIỆU SERVER</div><h1>Theo dõi</h1><div class="chips">'+bootstrap.groups.map(g=>`<button data-group="${g.id}" class="${tab===g.id?'active':''}">${esc(g.name)}</button>`).join('')+'</div><label class="search">⌕<input id="search" placeholder="Tìm mã, hồ sơ, nhà thầu…" value="'+esc(query)+'"></label><div class="sectionhead"><span id="count" class="muted"></span><button id="refresh">Làm mới ↻</button></div><div id="list" aria-live="polite"></div><button id="more-rows" class="primary" hidden>Tải thêm</button>';
   document.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{tab=b.dataset.group;query='';render();document.querySelector('.chips .active')?.scrollIntoView({block:'nearest',inline:'center'})});$('search').oninput=e=>{query=e.target.value;epoch++;clearTimeout(timer);timer=setTimeout(()=>loadRows(false),300)};$('refresh').onclick=()=>loadRows(false);$('more-rows').onclick=()=>loadRows(true);await loadRows(false);return;
  }
  if(page==='mail'){await mail(run);return}
  if(page==='files'){await files(run);return}
 }
 async function loadHomeSummary(run){try{const data=await rpc('awm_dashboard',[project]);if(run!==epoch||!$('home-stats'))return;$('home-stats').innerHTML=`<button class="stat" data-home="todo"><span>Việc đang mở</span><strong>${data.todos.open}</strong><small>${data.todos.overdue?data.todos.overdue+' quá hạn':'Đúng hạn'}</small></button><button class="stat" data-home="mail"><span>Mail AD</span><strong>${data.mail.online?'Online':'Chờ'}</strong><small>${data.mail.last_sync?'Đã đồng bộ':'Chưa kết nối'}</small></button><button class="stat" data-home="tracking"><span>Nhóm theo dõi</span><strong>${data.groups}</strong><small>được cấp quyền</small></button><button class="stat" data-home="files"><span>Nguồn Drive</span><strong>${data.drive_menus}</strong><small>menu hồ sơ</small></button>`;document.querySelectorAll('[data-home]').forEach(b=>b.onclick=()=>{page=b.dataset.home;render()})}catch(e){if(run===epoch&&$('home-stats'))$('home-stats').innerHTML='<div class="message">Không tải được tổng quan. Kéo xuống để thử lại.</div>'}}
 async function todos(run){$('main').innerHTML='<div class="eyebrow">VIỆC CÁ NHÂN</div><div class="page-title"><h1>To do</h1><button id="todo-add" class="primary">+ Việc mới</button></div><div class="chips"><button data-todo-filter="open" class="active">Đang làm</button><button data-todo-filter="done">Hoàn thành</button><button data-todo-filter="all">Tất cả</button></div><div id="todo-summary" class="stats"></div><div id="todo-list" class="loading">Đang tải việc…</div>';$('todo-add').onclick=todoForm;document.querySelectorAll('[data-todo-filter]').forEach(b=>b.onclick=()=>{todoFilter=b.dataset.todoFilter;todos(run);});await loadTodos(run)}
 async function loadTodos(run){try{const data=await rpc('awm_todos',[project,todoFilter]);if(run!==epoch)return;todoItems=data.items;document.querySelectorAll('[data-todo-filter]').forEach(b=>b.classList.toggle('active',b.dataset.todoFilter===todoFilter));$('todo-summary').innerHTML=`<div class="stat"><span>Đang làm</span><strong>${data.summary.open}</strong><small>${project}</small></div><div class="stat"><span>Quá hạn</span><strong>${data.summary.overdue}</strong><small>Cần xử lý</small></div><div class="stat"><span>Hoàn thành</span><strong>${data.summary.done}</strong><small>Trong dự án</small></div>`;$('todo-list').innerHTML=data.items.length?data.items.map((item,i)=>`<button class="card todo-card ${item.status==='done'?'done':''}" data-todo="${i}"><div class="top"><span class="badge priority-${esc(item.priority)}">${item.priority==='high'?'Ưu tiên cao':item.priority==='low'?'Ưu tiên thấp':'Bình thường'}</span><span class="code">${item.due_date?'Hạn '+esc(item.due_date):'Chưa đặt hạn'}</span></div><h3>${esc(item.title)}</h3>${item.notes?`<div class="muted">${esc(item.notes)}</div>`:''}<div class="foot"><span>${item.status==='done'?'✓ Hoàn thành':'Đang thực hiện'}</span><span>Chi tiết ↗</span></div></button>`).join(''):'<div class="empty">Chưa có việc phù hợp. Tạo việc đầu tiên cho dự án này.</div>';document.querySelectorAll('[data-todo]').forEach(b=>b.onclick=()=>todoForm(todoItems[Number(b.dataset.todo)]))}catch(e){if(run===epoch)$('todo-list').innerHTML=error(e)}}
 function todoForm(item=null){const editing=!!item;sheet(`<div class="eyebrow">${esc(project)}</div><h2>${editing?'Cập nhật việc':'Việc mới'}</h2><form id="todo-form" class="form"><label>Tên việc<input id="todo-title" required maxlength="180" value="${esc(item?.title||'')}" placeholder="Ví dụ: Kiểm tra hồ sơ hợp đồng"></label><label>Hạn xử lý<input id="todo-due" type="date" value="${esc(item?.due_date||'')}"></label><label>Ưu tiên<select id="todo-priority"><option value="high" ${item?.priority==='high'?'selected':''}>Cao</option><option value="normal" ${!item||item?.priority==='normal'?'selected':''}>Bình thường</option><option value="low" ${item?.priority==='low'?'selected':''}>Thấp</option></select></label><label>Ghi chú<textarea id="todo-notes" maxlength="1000" placeholder="Thông tin cần nhớ">${esc(item?.notes||'')}</textarea></label><button class="primary">${editing?'Lưu thay đổi':'Tạo việc'}</button></form>${editing?`<div class="actions"><button id="todo-toggle">${item.status==='done'?'Mở lại việc':'Đánh dấu hoàn thành'}</button><button id="todo-delete" class="danger">Xóa việc</button></div>`:''}`);$('todo-form').onsubmit=async e=>{e.preventDefault();const payload={title:$('todo-title').value,due_date:$('todo-due').value,priority:$('todo-priority').value,notes:$('todo-notes').value};try{if(editing)await rpc('awm_update_todo',[project,item.id,payload]);else await rpc('awm_save_todo',[project,payload]);$('sheet').close();todos(++epoch)}catch(e){notice(e.message)}};if(editing){$('todo-toggle').onclick=async()=>{try{await rpc('awm_update_todo',[project,item.id,{status:item.status==='done'?'open':'done'}]);$('sheet').close();todos(++epoch)}catch(e){notice(e.message)}};$('todo-delete').onclick=async()=>{if(!confirm('Xóa việc này?'))return;try{await rpc('awm_delete_todo',[project,item.id]);$('sheet').close();todos(++epoch)}catch(e){notice(e.message)}}}}
 async function loadRows(append){if(!tab){$('list').innerHTML='<div class="message">Chưa được cấp quyền cho nhóm hồ sơ nào.</div>';return}const run=++epoch;if(!append){records=[];$('list').innerHTML='<div class="loading">Đang tải hồ sơ…</div>'}$('more-rows').disabled=true;try{const data=await rpc('awm_tracking',[project,tab,query,append?cursor:0]);if(run!==epoch)return;records=append?[...records,...data.items]:data.items;columns=data.columns;cursor=data.next_cursor;$('count').textContent=`${data.total} hồ sơ · ${records.length} đã tải`;$('list').innerHTML=records.length?records.map((r,i)=>{const title=r.name||r.ten_goi_thau||r.noi_dung||r.ten_nha_thau||r.code||'Hồ sơ';const code=String(r.code||r.ma_hsmt||r.ma_goi_thau||'');const dateVal=String(r.date||r.ngay_ph||r.date_sign||'');return `<button class="card" data-record="${i}"><div class="top">${code?`<span class="code" data-quick-file="${i}" style="color:#c66a19;text-decoration:underline;cursor:pointer;" title="Mở trực tiếp ${tab==='hsmt'?'BOQ Excel':'PDF hợp đồng'}">${esc(code)} ↗</span>`:'<span class="code">Hồ sơ</span>'}<span class="badge">${esc(r.trang_thai_hd||r.tt_hop_dong||r.trang_thai_ph_hsmt||'Tra cứu')}</span></div><h3>${esc(title)}</h3><div class="muted">${esc(r.nha_thau||r.ten_nha_thau||r.cdt||r.cap_thu_muc||'')}</div><div class="foot">${dateVal?`<span data-quick-folder="${i}" style="color:#1a73e8;font-weight:600;text-decoration:underline;cursor:pointer;" title="Mở thư mục online">${esc(dateVal)} ↗</span>`:'<span>-</span>'}<span>Chi tiết ↗</span></div></button>`}).join(''):'<div class="empty">Không có hồ sơ phù hợp.</div>';$('more-rows').hidden=cursor===null;document.querySelectorAll('[data-record]').forEach(b=>b.onclick=()=>detail(records[Number(b.dataset.record)]));document.querySelectorAll('[data-quick-file]').forEach(b=>b.onclick=e=>{e.stopPropagation();const r=records[Number(b.dataset.quickFile)];const code=String(r.code||r.ma_hsmt||'');if(code)openRecordFile(code,tab==='hsmt'?'excel':'pdf');});document.querySelectorAll('[data-quick-folder]').forEach(b=>b.onclick=e=>{e.stopPropagation();const r=records[Number(b.dataset.quickFolder)];if(tab==='hsmt')openHsmtFolderOnline(r);else if(tab==='contract'||tab==='contractor:detail')openContractFolderOnline(r);else openRecordFolder(r.folder_name||r.name);});}catch(e){if(run===epoch)$('list').innerHTML=error(e)}finally{if(run===epoch)$('more-rows').disabled=false}}
 function sheet(html){$('detail').innerHTML=html;$('sheet').showModal()}
 function driveId(s){const text=String(s);const match=text.match(/https:\/\/drive\.google\.com\/(?:file\/d\/|drive\/(?:u\/\d+\/)?folders\/)([a-zA-Z0-9_-]+)/)||text.match(/https:\/\/docs\.google\.com\/(?:spreadsheets|document|presentation)\/d\/([a-zA-Z0-9_-]+)/);return match?.[1]||''}
 function fileName(path){return String(path||'').split(/[\\/]/).filter(Boolean).at(-1)||''}
 function signatures(raw){return String(raw||'').split(';').map(x=>x.trim()).map(x=>x.match(/^(.*?)\s*-\s*Ngày ký\s*:\s*(.+)$/i)).filter(Boolean).slice(0,2).flatMap((m,i)=>[['Người ký '+(i+1),m[1].trim()],['Ngày ký '+(i+1),m[2].trim()]]);}
  function detail(row){
    const labels=new Map(columns.map(c=>[c.key,c.label])),
    isHsmt=tab==='hsmt',
    isContract=tab==='contract'||tab==='contractor:detail',
    code=String(row.code||''),
    fileKind=isHsmt?'excel':'pdf',
    folderName=row.folder_name||fileName(row.folder_path||row.full_path),
    folderLabel=isHsmt&&code?'Thư mục HSMT '+code:isContract&&code?'Thư mục HĐ '+code:folderName,
    currentGroup=bootstrap?.groups?.find(g=>g.id===tab)?.name||(tab==='chu-truong'?'Chủ trương':tab==='bvtk'?'BVTK':tab==='progress'?'Tiến độ':tab==='hsmt'?'HSMT':tab==='contract'?'Hợp đồng':tab==='payment'?'Thanh toán':''),
    hidden=new Set(['code','folder_path','full_path','full_folder_name','folder_name','cks_info','path','folder','duong_dan','thu_muc','folder_url','cap_thu_muc',...(isHsmt?['lan_pd','_related_contract']:['_related_contract']),...(isContract?['hd_hsmt','cong_trinh','hang_muc','ma_ccm','ma_plhd','lo','phan_khu','loai_goi','phong_ban','stt','exists','nt_unmatched','_row_token','ten_cdt_tat','ten_nt_tat','ten_sap','vendor','ma_nt','gia_tri_hd','tam_ung','tt_tong_da_tt','tt_ty_le_tt','tt_con_lai','tt_so_dot','tt_ma_pr','tt_vuot_hd','tt_da_quyet_toan','tt_status']:[])]);
    const docs=Object.values(row).filter(v=>typeof v==='string').map(driveId).filter(Boolean);
    const linkedCode=(isHsmt||isContract)&&code?`<dt>${isHsmt?'Mã HSMT':'Mã HĐ'}</dt><dd><button class="record-link" id="open-main-file" title="Mở trực tiếp ${isHsmt?'file BOQ Excel':'file PDF hợp đồng'}" style="text-align:left;color:#c66a19;font-weight:700;padding:6px 12px;background:#fef7ea;border:1px solid #fed7aa;border-radius:6px;font-size:14px;cursor:pointer;">${esc(code)} ↗</button></dd>`:'';
    const cks=signatures(row.cks_info).map(([label,value])=>`<dt>${esc(label)}</dt><dd class="detail-value">${esc(value)}</dd>`).join('');
    const contractFinanceCard=isContract?`<div class="card contract-finance-card" style="background:#f4f8f4;border:1px solid #d2e4d0;padding:12px 14px;margin:12px 0;border-radius:10px;"><div style="font-size:12px;font-weight:700;color:#2c5b3e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;display:flex;align-items:center;gap:6px;"><span>💰</span><span>Giá trị HĐ &amp; Thanh toán</span></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;"><div><div style="font-size:11px;color:#5a6e5e;">Giá trị HĐ / PO</div><div style="font-weight:700;color:#182b29;font-size:15px;margin-top:2px;">${esc(row.gia_tri_hd||'-')}</div></div><div><div style="font-size:11px;color:#5a6e5e;">Tổng đã thanh toán</div><div style="font-weight:700;color:#1a73e8;font-size:15px;margin-top:2px;">${esc(row.tt_tong_da_tt||row.tam_ung||'-')}</div></div><div><div style="font-size:11px;color:#5a6e5e;">Tỷ lệ đã TT</div><div style="font-weight:600;color:#2c5b3e;font-size:14px;margin-top:2px;">${esc(row.tt_ty_le_tt||'-')}</div></div><div><div style="font-size:11px;color:#5a6e5e;">Giá trị còn lại</div><div style="font-weight:600;color:#c66a19;font-size:14px;margin-top:2px;">${esc(row.tt_con_lai||'-')}</div></div>${row.tam_ung?`<div><div style="font-size:11px;color:#5a6e5e;">Tạm ứng</div><div style="font-size:13px;font-weight:600;">${esc(row.tam_ung)}</div></div>`:''}${row.tt_so_dot?`<div><div style="font-size:11px;color:#5a6e5e;">Số đợt TT</div><div style="font-size:13px;font-weight:600;">${esc(row.tt_so_dot)}</div></div>`:''}${row.tt_ma_pr?`<div><div style="font-size:11px;color:#5a6e5e;">Mã PR</div><div style="font-size:13px;">${esc(row.tt_ma_pr)}</div></div>`:''}${row.tt_da_quyet_toan?`<div><div style="font-size:11px;color:#5a6e5e;">Quyết toán</div><div style="font-size:13px;">${esc(row.tt_da_quyet_toan)}</div></div>`:''}${row.tt_vuot_hd?`<div><div style="font-size:11px;color:#5a6e5e;">Vượt giá trị HĐ</div><div style="font-size:13px;color:#d32f2f;font-weight:600;">${esc(row.tt_vuot_hd)}</div></div>`:''}</div></div>`:'';
    const labelFallback={ben_a:'Tên CĐT',nha_thau:'Tên NT',so_hd:'Số HĐ / PO',date_sign:'Ngày ký HĐ',so_plhd:'Số PLHĐ / PO / TT / QT',date_sign_plhd:'Ngày ký PLHĐ/PO/TT/QT',site_info:'Thông tin hiện trường',td_bat_dau:'Tiến độ bắt đầu',td_ket_thuc:'Tiến độ kết thúc',bao_lanh_bh:'Bảo lãnh BH',tg_bao_hanh:'Thời gian BH'};
    const values=Object.entries(row).filter(([k,v])=>!k.startsWith('_')&&!hidden.has(k)&&v!==''&&v!==null).map(([k,v])=>{
      if(k==='date'||k==='ngay_ph'||k==='ngay'){
        const label=esc(labels.get(k)||(k==='ngay_ph'?'Ngày PH':'Ngày'));
        if(isHsmt){
          return `<dt>${label}</dt><dd><button id="open-hsmt-folder-online" class="folder-link" style="color:#1a73e8;font-weight:600;padding:2px 0;background:none;border:none;text-decoration:underline;cursor:pointer;font-size:14px;text-align:left;">${esc(v)} ↗</button></dd>`;
        }
        if(isContract&&(k==='date'||k==='ngay')){
          return `<dt>${label}</dt><dd><button class="open-contract-folder-online folder-link" style="color:#1a73e8;font-weight:600;padding:2px 0;background:none;border:none;text-decoration:underline;cursor:pointer;font-size:14px;text-align:left;">${esc(v)} ↗</button></dd>`;
        }
        const folderTarget=row.folder||row.path||row.folder_name||row.folder_path||row.full_path||row.noi_dung||row.name||'';
        return `<dt>${label}</dt><dd><button type="button" class="folder-link open-row-folder-btn" data-folder-path="${esc(folderTarget)}" style="color:#1a73e8;font-weight:600;padding:2px 0;background:none;border:none;text-decoration:underline;cursor:pointer;font-size:14px;text-align:left;">${esc(v)} ↗</button></dd>`;
      }
      if(isHsmt&&k==='rev'){
        const rel=row._related_contract;
        const relCode=rel?.code||(typeof v==='string'&&v.match(/^HD\d+/)?.[0])||'';
        const relName=rel?.name||v||'Chưa có HĐ ký kết';
        return `<dt>HĐ liên quan</dt><dd>${relCode?`<button class="record-link" data-open-contract="${esc(relCode)}" style="text-align:left;color:#1a73e8;font-weight:600;padding:6px 10px;background:#eef4fc;border:1px solid #c7dcfa;border-radius:6px;width:100%;font-size:13px;line-height:1.4;cursor:pointer;">${esc(relName)} ↗</button>`:`<span class="muted">${esc(relName)}</span>`}</dd>`;
      }
      if(k==='ten_tai_lieu'||k==='tai_lieu'||k==='file_names'||(typeof v==='string'&&(v.includes('.pdf')||v.includes('.msg')||v.includes('.xlsx')||v.includes('.docx')))){
        const lines=String(v||'').split(/\r?\n|;/).map(l=>l.trim().replace(/^[-*•]\s*/,'')).filter(Boolean);
        const items=lines.map(fileLine=>{
          const ext=fileLine.split('.').pop().toLowerCase();
          const isPdf=ext==='pdf',isMsg=ext==='msg',isSheet=['xlsx','xls','csv'].includes(ext),isCad=['dwg','dxf'].includes(ext),isDoc=['docx','doc'].includes(ext);
          const icon=isPdf?'📑':isMsg?'✉️':isSheet?'📊':isCad?'📐':isDoc?'📄':'📁';
          const tag=isPdf?'PDF':isMsg?'Email MSG':isSheet?'Excel':isCad?'CAD':isDoc?'Word':'Tài liệu';
          return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;margin:6px 0;background:#f5f8f5;border:1px solid #dbe6d8;border-radius:8px;"><div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;"><span style="font-size:18px;">${icon}</span><div style="min-width:0;"><div style="font-size:13px;font-weight:600;color:#182b29;word-break:break-word;line-height:1.3;">${esc(fileLine)}</div><div style="font-size:11px;color:#5a6e5e;margin-top:2px;">${tag}</div></div></div><button type="button" class="primary text-button open-named-file-btn" data-named-file="${esc(fileLine)}" style="padding:6px 10px;font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer;border-radius:6px;background:#182b29;color:#fff;border:none;">Mở tệp ↗</button></div>`;
        }).join('');
        return `<dt>${esc(labels.get(k)||'Tên tài liệu')}</dt><dd style="margin:4px 0 10px 0;">${items}</dd>`;
      }
      return `<dt>${esc(labels.get(k)||labelFallback[k]||k)}</dt><dd class="detail-value">${esc(typeof v==='object'?JSON.stringify(v):v)}</dd>`;
    }).join('');
    sheet(`<div class="eyebrow">${esc(project)}${currentGroup?' / '+esc(currentGroup):''}</div><h2>${esc(row.name||row.ten_goi_thau||row.noi_dung||code||'Chi tiết hồ sơ')}</h2>${contractFinanceCard}<dl>${linkedCode}${values}${cks}</dl>${[...new Set(docs)].map(id=>`<button class="card" data-doc="${id}">Đọc tài liệu Drive →</button>`).join('')}<button class="card" id="related">Mở kho hồ sơ liên quan →</button>`);
    document.querySelectorAll('[data-doc]').forEach(b=>b.onclick=async()=>{try{if(window.AwmViewer?.openOnline){AwmViewer.openOnline({id:b.dataset.doc});return;}if(!AwmDrive.connected()){window.open(`https://drive.google.com/file/d/${b.dataset.doc}/view`,'_blank','noopener');return;}const file=await AwmDrive.metadata(b.dataset.doc);await openFile(file)}catch(e){notice(e.message)}});
    if($('open-main-file'))$('open-main-file').onclick=()=>openRecordFile(code,fileKind);
    if($('open-folder'))$('open-folder').onclick=()=>isContract?openContractFolderOnline(row):openRecordFolder(folderName,row);
    if($('open-hsmt-folder-online'))$('open-hsmt-folder-online').onclick=()=>openHsmtFolderOnline(row);
    document.querySelectorAll('.open-contract-folder-online').forEach(b=>b.onclick=()=>openContractFolderOnline(row));
    document.querySelectorAll('[data-open-contract]').forEach(b=>{b.onclick=()=>{const contractCode=b.dataset.openContract;$('sheet').close();page='tracking';tab='contract';query=contractCode;trail=[];render();};});
    document.querySelectorAll('.open-named-file-btn').forEach(b=>{b.onclick=()=>openNamedFile(b.dataset.namedFile,row);});
    document.querySelectorAll('.open-row-folder-btn').forEach(b=>{b.onclick=()=>openRecordFolder(b.dataset.folderPath,row);});
    $('related').onclick=()=>{$('sheet').close();menu=trackingMenu[tab]||bootstrap.menus.find(m=>m.id===tab)?.id||bootstrap.menus[0]?.id||'';page='files';trail=[];render()};
  }
  async function openRecordFile(code,kind){
    try{
      notice('Đang tìm '+(kind==='excel'?'file BOQ Excel':'file PDF hợp đồng')+' trên Google Drive…');
      const res=await rpc('awm_find_file',[project,code,kind]);
      const file=res?.files?.[0];
      if(file){
        notice('Đang mở: '+file.name);
        const url=file.webViewLink||(file.mimeType?.includes('spreadsheet')?`https://docs.google.com/spreadsheets/d/${file.id}/edit`:`https://drive.google.com/file/d/${file.id}/view`);
        const win=window.open(url,'_blank','noopener');
        if(!win||win.closed||typeof win.closed==='undefined'){
          if(window.AwmViewer?.openOnline)AwmViewer.openOnline({id:file.id,url,name:file.name,mime:file.mimeType});
        }
        return;
      }
      window.open('https://drive.google.com/drive/search?q='+encodeURIComponent(code),'_blank','noopener');
    }catch(e){
      window.open('https://drive.google.com/drive/search?q='+encodeURIComponent(code),'_blank','noopener');
    }
  }
  async function openNamedFile(rawName,row){
    const fileName=String(rawName||'').trim().replace(/^[-*•]\s*/,'');
    if(!fileName)return;
    const ext=fileName.split('.').pop().toLowerCase();
    if(ext==='msg'){
      notice('Đang tải nội dung thư…');
      let driveUrl='';
      try{
        const res=await rpc('awm_find_file',[project,fileName,'all']);
        driveUrl=res?.files?.[0]?.webViewLink||'';
      }catch(_){}
      const cleanTitle=fileName.replace(/\.msg$/i,'');
      try{
        const msgRes=await rpc('awm_get_msg',[project,fileName,row?.noi_dung||'']);
        const msgData=(msgRes?.ok&&msgRes?.data)?msgRes.data:(msgRes?.data||msgRes);
        if(window.AwmViewer?.openMsg){
          AwmViewer.openMsg({
            name: fileName,
            subject: msgData?.subject||cleanTitle,
            sender: msgData?.sender||row?.field_1||row?.field_3||'Cán bộ phát hành / AD',
            senderEmail: msgData?.sender_email||'',
            to: msgData?.to||'',
            cc: msgData?.cc||'',
            bcc: msgData?.bcc||'',
            date: msgData?.date||row?.ngay_ph||row?.date||'',
            body: msgData?.body||row?.field_6||row?.noi_dung||cleanTitle,
            attachments: msgData?.attachments||[],
            nested_messages: msgData?.nested_messages||[],
            is_encrypted: !!msgData?.is_encrypted,
            url: driveUrl
          });
          return;
        }
      }catch(e){
        if(window.AwmViewer?.openMsg){
          AwmViewer.openMsg({
            name: fileName,
            subject: cleanTitle,
            sender: row?.field_1||row?.field_3||'Cán bộ phát hành / AD',
            date: row?.ngay_ph||row?.date||'',
            body: row?.field_6||row?.noi_dung||cleanTitle,
            attachments: [],
            nested_messages: [],
            url: driveUrl
          });
          return;
        }
      }
    }
    notice('Đang tìm tệp: '+fileName+'…');
    try{
      const kind=ext==='pdf'?'pdf':(ext==='xlsx'||ext==='xls')?'excel':'all';
      const res=await rpc('awm_find_file',[project,fileName,kind]);
      const file=res?.files?.[0];
      if(file?.webViewLink){
        notice('Đang mở: '+file.name);
        const win=window.open(file.webViewLink,'_blank','noopener');
        if(!win||win.closed||typeof win.closed==='undefined'){
          if(window.AwmViewer?.openOnline)AwmViewer.openOnline({id:file.id,url:file.webViewLink,name:file.name,mime:file.mimeType,row});
        }
        return;
      }
      window.open('https://drive.google.com/drive/search?q='+encodeURIComponent(fileName),'_blank','noopener');
    }catch(e){
      window.open('https://drive.google.com/drive/search?q='+encodeURIComponent(fileName),'_blank','noopener');
    }
  }
  async function openHsmtFolderOnline(row){
    try{
      const code=String(row.code||'');
      notice('Đang tìm thư mục online…');
      const res=await rpc('awm_find_file',[project,code,'folder']);
      const folder=res?.files?.[0];
      if(folder){
        window.open(folder.webViewLink||`https://drive.google.com/drive/folders/${folder.id}`,'_blank','noopener');
        return;
      }
      const covered=coverOnlineUrl(row.folder_name||row.full_path||'06.01');
      window.open(/^https?:\/\//i.test(covered)?covered:'https://drive.google.com/drive/folders/19IbTJq4pOgoUf8vNdeufnBp5Gddn0uLy','_blank','noopener');
    }catch(e){
      window.open('https://drive.google.com/drive/folders/19IbTJq4pOgoUf8vNdeufnBp5Gddn0uLy','_blank','noopener');
    }
  }
  async function openContractFolderOnline(row){
    try{
      const code=String(row.code||'');
      notice('Đang tìm thư mục HĐ online…');
      const res=await rpc('awm_find_file',[project,code,'folder']);
      const folder=res?.files?.[0];
      if(folder){
        window.open(folder.webViewLink||`https://drive.google.com/drive/folders/${folder.id}`,'_blank','noopener');
        return;
      }
      const covered=coverOnlineUrl(row.folder_name||row.folder_path||row.full_path||'07.01');
      window.open(/^https?:\/\//i.test(covered)?covered:'https://drive.google.com/drive/folders/1vIFykY_-heKaR_JHVAyThd6pcaOSJik2','_blank','noopener');
    }catch(e){
      window.open('https://drive.google.com/drive/folders/1vIFykY_-heKaR_JHVAyThd6pcaOSJik2','_blank','noopener');
    }
  }
  async function openRecordFolder(name,row=null){
    try{
      if(/^https?:\/\//i.test(name)){
        window.open(name,'_blank','noopener');
        return;
      }
      notice('Đang tìm thư mục trên Google Drive…');
      const cleanName=String(name||'').split(/[\\/]/).filter(Boolean).pop()||name;
      const res=await rpc('awm_find_file',[project,cleanName,'folder']);
      const folder=res?.files?.[0];
      if(folder?.webViewLink||folder?.id){
        window.open(folder.webViewLink||`https://drive.google.com/drive/folders/${folder.id}`,'_blank','noopener');
        return;
      }
      const covered=coverOnlineUrl(name);
      if(/^https?:\/\//i.test(covered)){
        window.open(covered,'_blank','noopener');
        return;
      }
      window.open('https://drive.google.com/drive/search?q='+encodeURIComponent(cleanName),'_blank','noopener');
    }catch(e){
      notice(e.message);
    }
  }
  async function mail(run){$('main').innerHTML='<div class="eyebrow">ÁNH XẠ TỪ AD</div><h1>Mail</h1><div id="mail-state" class="loading">Kiểm tra kết nối…</div><button id="refresh-mail" class="primary">Làm mới ↻</button><div id="mail-list"></div>';$('refresh-mail').onclick=()=>render();try{const status=await rpc('awm_mail_status');if(run!==epoch)return;$('mail-state').className='message';$('mail-state').innerHTML=`<span class="badge ${status.online?'online':'warn'}">${status.online?'AD đang kết nối':'AD chưa kết nối'}</span><p>${status.online?esc(status.source):'Mở AD trên máy tính và bật đồng bộ Mail.'}</p><div class="muted">${status.last_sync?'Lần đồng bộ: '+esc(new Date(status.last_sync).toLocaleString('vi-VN')):'Chưa có dữ liệu đồng bộ.'}</div>`;if(status.online){const data=await rpc('awm_mail_list',[project,'']);if(run!==epoch)return;$('mail-list').innerHTML=data.items.length?data.items.map((r,i)=>`<button class="card" data-mail="${i}"><span class="code">${esc(r.sender)}</span><h3>${esc(r.subject)}</h3><div class="muted">${esc(r.date)}</div></button>`).join(''):'<div class="empty">Chưa có thư thuộc dự án này.</div>';document.querySelectorAll('[data-mail]').forEach(b=>b.onclick=async()=>{try{const latest=await rpc('awm_mail_list',[project,'']);if(run!==epoch)return;const original=data.items[Number(b.dataset.mail)],r=latest.items.find(x=>x.id===original.id);if(!r)throw Error('Thư không còn khả dụng.');sheet(`<div class="eyebrow">${esc(r.sender)}</div><h2>${esc(r.subject)}</h2><p class="muted">${esc(r.date)}</p><div class="detail-value">${esc(r.body)}</div>`)}catch(e){notice(e.message)}})}timer=setTimeout(()=>{if(page==='mail'&&run===epoch){$('sheet').close();render()}},30000);}catch(e){if(run===epoch)$('mail-state').innerHTML=error(e)}}
 async function files(run){$('main').innerHTML='<div class="eyebrow">KHO HỒ SƠ DỰ ÁN</div><h1>Quản lý hồ sơ</h1><div class="chips">'+bootstrap.menus.map(m=>`<button data-menu="${m.id}" class="${menu===m.id?'active':''}">${esc(m.name)}</button>`).join('')+'</div><div class="actions"><span class="badge online" style="display:inline-flex;align-items:center;padding:7px 12px;font-size:12px;font-weight:600;">☁️ bqlxddp@gmail.com</span><button id="open-drive-direct" class="primary">Mở Google Drive ↗</button>'+(bootstrap.files?.can_configure?'<button id="configure">Đặt thư mục dự án</button>':'')+'<button id="drive-refresh">Làm mới ↻</button></div><div id="crumb" class="breadcrumb"></div><div id="drive-list" aria-live="polite"></div><button id="drive-more" hidden class="primary">Tải thêm</button>';
  document.querySelectorAll('[data-menu]').forEach(b=>b.onclick=()=>{menu=b.dataset.menu;trail=[];render()});if($('configure'))$('configure').onclick=configure;$('drive-refresh').onclick=()=>loadDrive(false);$('drive-more').onclick=()=>loadDrive(true);
  try{folders=await rpc('awm_folders',[project]);if(run!==epoch)return;if(!menu){$('drive-list').innerHTML='<div class="message">Chưa có menu được cấp quyền.</div>';return}const configured=folders[menu];if(!configured){$('drive-list').innerHTML='<div class="message"><b>Chưa có nguồn Drive được ánh xạ cho dự án này.</b><br>Ánh xạ được lưu riêng theo dự án. Người có quyền quản lý QL File hãy chọn nguồn online trong AwD hoặc bấm “Đặt thư mục dự án” tại đây.</div>';return}const folderUrl=configured.url||(configured.id?`https://drive.google.com/drive/folders/${encodeURIComponent(configured.id)}`:'https://drive.google.com/drive/');if($('open-drive-direct'))$('open-drive-direct').onclick=()=>window.open(folderUrl,'_blank','noopener');$('crumb').innerHTML=`<div class="source-note">✓ Đã ánh xạ ${configured.scope==='project'?'từ AD / dùng chung dự án':'cho tài khoản này'}${configured.updated_by?` · ${esc(configured.updated_by)}`:''}<a href="${esc(folderUrl)}" target="_blank" rel="noopener">Mở Drive ↗</a></div>`;if(!trail.length)trail=[{id:configured.id,name:bootstrap.menus.find(m=>m.id===menu)?.name||menu,url:folderUrl,path:configured.path||'',subs:configured.subs||[]}];await loadDrive(false)}catch(e){if(run===epoch)$('drive-list').innerHTML=error(e)}
 }
 function configure(){if(!menu)return notice('Chưa được cấp menu QL.');sheet(`<h2>Thư mục dùng chung của dự án</h2><p class="muted">${esc(project)} / ${esc(menu)}</p><form id="folder-form" class="form"><label>URL hoặc ID thư mục Google Drive<input id="folder-id" required value="${esc(folders[menu]?.id||'')}" placeholder="https://drive.google.com/drive/folders/…"></label><button class="primary">Lưu cho dự án</button></form><p class="muted">Mọi tài khoản được cấp dự án đều dùng địa chỉ này. Google vẫn kiểm tra quyền đọc tệp theo tài khoản Google của từng người.</p>`);$('folder-form').onsubmit=async e=>{e.preventDefault();let id=$('folder-id').value.trim();id=driveId(id)||id;try{await rpc('awm_save_folder',[project,menu,id]);$('sheet').close();trail=[];render()}catch(e){notice(e.message)}}}
 function coverOnlineUrl(rawUrl){
    rawUrl = String(rawUrl||'').trim();
    if(/^https?:\/\//i.test(rawUrl)) return rawUrl;
    const norm = rawUrl.toLowerCase().replace(/\\/g, '/');
    if(norm.includes('theo doi 06,07,08') || norm.includes('.xlsm') || norm.includes('theo doi tong') || norm.includes('theo doi tổng')) return 'https://docs.google.com/spreadsheets/d/1IRiE_8hau2hJgwPF3xcuaVC2Ih3mfNnX/edit';
    if(norm.includes('01. chi dao') || norm.includes('01.01') || (norm.includes('01. phe duyet') && norm.includes('chi dao'))) return 'https://drive.google.com/drive/folders/1n_5RbTM34UOlLPRaB-WE3kVjx9UiS7Sh';
    if(norm.includes('01. phe duyet/02') || norm.includes('01.02') || (norm.includes('01. phe duyet') && norm.includes('tien do'))) return 'https://drive.google.com/drive/folders/1X6TsO1_iSPAJvMWNsIWS20gZusVQJJpv';
    if(norm.includes('03. yc ky thuat') || norm.includes('01.03') || norm.includes('yc kt') || norm.includes('yc ky thuat')) return 'https://drive.google.com/drive/folders/11Hrfa0ofMUME62ZF7wlbzxZ11C3aGGBH';
    if(norm.includes('04. bvtk') || norm.includes('01.04') || norm.includes('ban ve thiet ke')) return 'https://drive.google.com/drive/folders/1_ulRVF99yuc3e7r1ek5hi2sn2Y7pIqG7';
    if(norm.includes('01. phe duyet')) return 'https://drive.google.com/drive/folders/1IQ-Rpu0U16MdPQkaeIWqdmIIOscankKJ';
    if(norm.includes('02.01') || norm.includes('02. phap ly') || norm.includes('phap ly')) return 'https://drive.google.com/drive/folders/1KIvbe3-cMi4ym6tXczbqE5j2aQUc2P3b';
    if(norm.includes('03. cam nang') || norm.includes('cam nang')) return 'https://drive.google.com/drive/folders/1WNEiOL-4RLw5zsm3LYqBI_Xw4XqSUWlv';
    if(norm.includes('04. chuan hoa') || norm.includes('chuan hoa')) return 'https://drive.google.com/drive/folders/1QdBbuuFE7onNgOdAQj8ehBJCECPlipbb';
    if(norm.includes('06.01') || norm.includes('da phat hanh')) return 'https://drive.google.com/drive/folders/19IbTJq4pOgoUf8vNdeufnBp5Gddn0uLy';
    if(norm.includes('06. hsmt') || norm.includes('06.hsmt')) return 'https://drive.google.com/drive/folders/1vqyVkLfIFPzulWaeD6KGDxMvkLQVxT-w';
    if(norm.includes('07.01') || norm.includes('da ky ket')) return 'https://drive.google.com/drive/folders/1vIFykY_-heKaR_JHVAyThd6pcaOSJik2';
    if(norm.includes('07. hop dong') || norm.includes('07.hop dong') || norm.includes('07. hopdong')) return 'https://drive.google.com/drive/folders/1zkfKeEvWHx7xOr6MrSuSDe_yyw7Zj1qN';
    if(norm.includes('08.01') || norm.includes('tu, tt') || norm.includes('tu,tt') || norm.includes('tam ung')) return 'https://drive.google.com/drive/folders/1hA7Zvi1r5XxmbFi-neLxGguV_clueBaS';
    if(norm.includes('08.02') || norm.includes('quyet toan') || norm.includes('/qt')) return 'https://drive.google.com/drive/folders/1Dx93wqXdvaauKGglqoXo2oxKGG1Jif8y';
    if(norm.includes('/vh') || norm.includes('vinhomes') || norm.includes('dan phuong') || norm.includes('my drive')) return 'https://drive.google.com/drive/folders/1z3Il9qZ7N0yQ5UMjSYnWgluV2BwI-B_7';
    return rawUrl;
  }
  async function linksPage(run){
   $('main').innerHTML=`<div class="eyebrow">ÁNH XẠ TỪ DESKTOP & GOOGLE DRIVE</div><div class="page-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px;"><div style="display:flex;align-items:center;gap:8px;"><button id="link-back" class="text-button" style="padding:4px 8px;font-size:14px;font-weight:600;">← Cài đặt</button><h1 style="margin:0;font-size:20px;">Quản lý Link</h1></div><button id="link-add" class="primary">+ Thêm link</button></div><div class="chips"><button data-scope="project" class="${linkScope==='project'?'active':''}">Dự án: ${esc(project)}</button><button data-scope="__common__" class="${linkScope==='__common__'?'active':''}">Dùng chung hệ thống</button></div><label class="search">⌕<input id="link-search" placeholder="Tìm tên liên kết, URL, phân loại…" value="${esc(linkSearch)}"></label><div class="sectionhead"><span id="link-count" class="muted">Đang tải liên kết…</span><button id="link-refresh">Làm mới ↻</button></div><div id="link-list" aria-live="polite"></div>`;
   $('link-back').onclick=()=>{page='home';render();$('settings').click();};
   document.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{linkScope=b.dataset.scope;linkSearch='';linksPage(run);});
   $('link-add').onclick=()=>linkModal();
   $('link-refresh').onclick=()=>loadLinksList(run);
   $('link-search').oninput=e=>{linkSearch=e.target.value;clearTimeout(timer);timer=setTimeout(()=>loadLinksList(run),300);};
   await loadLinksList(run);
  }
  async function loadLinksList(run){
   if(run!==epoch)return;const listEl=$('link-list'),countEl=$('link-count');if(!listEl)return;listEl.innerHTML='<div class="loading">Đang tải danh sách liên kết…</div>';
   try{
     const scope=linkScope==='__common__'?'__common__':project;
     const data=await rpc('get_managed_links',[linkSearch,scope]);
     if(run!==epoch||!$('link-list'))return;linkItems=Array.isArray(data)?data:[];
     if(countEl)countEl.textContent=`${linkItems.length} liên kết (${linkScope==='__common__'?'Dùng chung':project})`;
     if(!linkItems.length){listEl.innerHTML=`<div class="empty">Chưa có liên kết nào trong ${linkScope==='__common__'?'mục dùng chung':('dự án '+esc(project))}.<br>Bấm "+ Thêm link" để bổ sung.</div>`;return;}
     listEl.innerHTML=linkItems.map((item,idx)=>{
       const rawUrl=String(item.url||''),coveredUrl=coverOnlineUrl(rawUrl),isWeb=/^https?:\/\//i.test(coveredUrl),isDrive=isWeb&&(/drive\.google\.com|docs\.google\.com/i.test(coveredUrl)||!!item.drive_file_id),isLocal=!isWeb&&(/^[a-zA-Z]:[\\\/]/i.test(rawUrl)||/^[\\\/]{2}/.test(rawUrl)),isFolder=item.category?.includes('Thư mục')||/folders/i.test(coveredUrl);
       const icon=isDrive?(isFolder?'📁':'📄'):isWeb?'🌐':isLocal?'💻':'🔗',badgeCls=isDrive?'online':isWeb?'badge-primary':isLocal?'warn':'';
       return `<div class="link-card" data-link-index="${idx}"><div class="link-card-header"><div class="link-card-title"><span class="ico">${icon}</span><div><strong>${esc(item.name||'Liên kết')}</strong>${item.notes?`<div class="muted" style="font-size:11px;margin-top:2px;">${esc(item.notes)}</div>`:''}</div></div><span class="badge ${badgeCls}">${esc(item.category||(isDrive?'Drive':isWeb?'Web':'Khác'))}</span></div><div class="link-url" title="${esc(coveredUrl)}">${esc(item.display_path||coveredUrl)}</div><div class="link-meta"><span class="muted">${isDrive?'☁️ Google Drive Online':isWeb?'🌐 Trực tuyến':'🖥️ Ánh xạ từ Desktop'}</span><div class="link-actions"><button class="primary" data-open-link="${idx}">Mở ↗</button><button data-edit-link="${idx}">Sửa</button><button class="danger" data-del-link="${idx}">Xóa</button></div></div></div>`;
     }).join('');
     document.querySelectorAll('[data-open-link]').forEach(b=>{b.onclick=e=>{e.stopPropagation();openManagedLink(linkItems[Number(b.dataset.openLink)])}});
     document.querySelectorAll('[data-edit-link]').forEach(b=>{b.onclick=e=>{e.stopPropagation();linkModal(linkItems[Number(b.dataset.editLink)])}});
     document.querySelectorAll('[data-del-link]').forEach(b=>{b.onclick=async e=>{e.stopPropagation();const item=linkItems[Number(b.dataset.delLink)];if(!confirm(`Bạn có chắc muốn xóa liên kết "${item.name}"?`))return;try{const scope=linkScope==='__common__'?'__common__':project;await rpc('delete_managed_link',[item.id,scope]);notice('Đã xóa liên kết.');await loadLinksList(epoch);}catch(err){notice('Lỗi xóa liên kết: '+err.message)}}});
   }catch(err){if(run===epoch&&$('link-list'))$('link-list').innerHTML=error(err)}
  }
  async function openManagedLink(item){
   let url=String(item.url||'').trim();if(!url)return notice('Đường dẫn liên kết trống.');
   url = coverOnlineUrl(url);
   const isWeb=/^https?:\/\//i.test(url);
   if(isWeb){
     window.open(url,'_blank','noopener');
     return;
   }
   sheet(`<div class="eyebrow">ĐƯỜNG DẪN MÁY TÍNH DESKTOP</div><h2>${esc(item.name)}</h2><p class="muted">Liên kết này được lưu từ ứng dụng máy tính desktop:</p><div class="detail-value mono" style="margin:12px 0;padding:12px;background:#eef3ea;border-radius:8px;">${esc(url)}</div><p class="muted" style="font-size:12px;">Đường dẫn ổ đĩa máy tính (như ổ C: hoặc Z:) không thể truy cập trực tiếp trên trình duyệt điện thoại. Để mở trên mobile, bạn hãy kết nối hoặc tải tệp lên Google Drive rồi gắn link Drive vào đây.</p><div class="actions"><button class="primary" id="close-desk-sheet">Đã hiểu</button></div>`);
   $('close-desk-sheet').onclick=()=>$('sheet').close();
  }
  function linkModal(item=null){
  const editing=!!item;
  sheet(`<div class="eyebrow">${linkScope==='__common__'?'LIÊN KẾT DÙNG CHUNG':('DỰ ÁN: '+esc(project))}</div><h2>${editing?'Cập nhật liên kết':'Thêm liên kết mới'}</h2><form id="link-form" class="form"><label>Tên liên kết / Thư mục<input id="lf-name" required maxlength="255" value="${esc(item?.name||'')}" placeholder="Ví dụ: Thư mục Hợp đồng Google Drive"></label><label>Đường dẫn / URL / Link Drive<input id="lf-url" required value="${esc(item?.url||'')}" placeholder="https://drive.google.com/… hoặc https://…"></label><label>Phân loại<select id="lf-cat"><option value="Drive / Tài liệu" ${item?.category==='Drive / Tài liệu'?'selected':''}>Drive / Tài liệu</option><option value="Drive / Thư mục" ${item?.category==='Drive / Thư mục'?'selected':''}>Drive / Thư mục</option><option value="Hệ thống" ${!item||item?.category==='Hệ thống'?'selected':''}>Hệ thống</option><option value="Hợp đồng" ${item?.category==='Hợp đồng'?'selected':''}>Hợp đồng</option><option value="HSMT" ${item?.category==='HSMT'?'selected':''}>HSMT</option><option value="Tiến độ" ${item?.category==='Tiến độ'?'selected':''}>Tiến độ</option><option value="Thanh toán" ${item?.category==='Thanh toán'?'selected':''}>Thanh toán</option><option value="Báo cáo" ${item?.category==='Báo cáo'?'selected':''}>Báo cáo</option><option value="Khác" ${item?.category==='Khác'?'selected':''}>Khác</option></select></label><label>Ghi chú<textarea id="lf-notes" maxlength="1000" placeholder="Thông tin mô tả thêm">${esc(item?.notes||'')}</textarea></label><button class="primary">${editing?'Lưu thay đổi':'Thêm liên kết'}</button></form>${editing?'<div class="actions" style="margin-top:12px;"><button id="lf-delete" class="danger">Xóa liên kết này</button></div>':''}`);
  $('link-form').onsubmit=async e=>{
    e.preventDefault();const name=$('lf-name').value.trim(),url=$('lf-url').value.trim(),category=$('lf-cat').value,notes=$('lf-notes').value.trim();
    if(!name||!url)return notice('Vui lòng nhập Tên và URL.');
    try{
      const scope=linkScope==='__common__'?'__common__':project;
      const payload={...(item||{}),id:item?.id||'',name,url,category,notes};
      await rpc('save_managed_link',[payload,scope]);$('sheet').close();notice('Đã lưu liên kết thành công!');await loadLinksList(epoch);
    }catch(err){notice('Lỗi lưu liên kết: '+err.message)}
  };
  if(editing){
    $('lf-delete').onclick=async()=>{
      if(!confirm(`Bạn có chắc muốn xóa liên kết "${item.name}"?`))return;
      try{const scope=linkScope==='__common__'?'__common__':project;await rpc('delete_managed_link',[item.id,scope]);$('sheet').close();notice('Đã xóa liên kết!');await loadLinksList(epoch);}catch(err){notice('Lỗi xóa liên kết: '+err.message)}
    };
  }
 }
 const rbacRoles=['Văn phòng','Nội nghiệp','ĐTGS','CBGS'],rbacRank={none:0,view:1,edit:2,full:3},rbacGroupKeys=['grp_tabs','grp_ql_file','grp_theo_doi','grp_chuc_nang','grp_cai_dat'],rbacTabParents={grp_ql_file:'tab_quan_ly',grp_theo_doi:'tab_theo_doi',grp_chuc_nang:'tab_chuc_nang',grp_cai_dat:'tab_cai_dat'};
 const rbacOptions=v=>['full','edit','view','none'].map(x=>`<option value="${x}" ${x===v?'selected':''}>${({full:'Full',edit:'Sửa',view:'Xem',none:'Khóa'})[x]}</option>`).join('');
 function rbacScreen(){
  rpc('get_role_permissions').then(raw=>{
    const data=window.PermissionCatalog?.ensure ? window.PermissionCatalog.ensure(raw) : raw;
    const perms=data.permissions||{};
    const groups=window.PermissionCatalog?.groups||data.groups||[];
    let role=rbacRoles[0];
    const value=key=>perms[role]?.[key]||'none';
    const ensure=()=>perms[role]||(perms[role]={});
    const clamp=(key,level)=>{if((rbacRank[value(key)]||0)>(rbacRank[level]||0))ensure()[key]=level};
    const render=()=>{
      const groupMarkup=groups.map(([title,items],index)=>{
        const groupKey=rbacGroupKeys[index];
        const rows=items.map(([key,label])=>`<label class="rbac-row"><span>${esc(label)}</span><select data-rbac-key="${esc(key)}">${rbacOptions(value(key))}</select></label>`).join('');
        return `<details class="rbac-group" ${index===0?'open':''}><summary><span>${esc(title)}</span><select data-rbac-group="${index}" aria-label="Quyền nhóm ${esc(title)}">${rbacOptions(value(groupKey))}</select></summary>${rows}</details>`;
      }).join('');
      sheet(`<div class="eyebrow">QUẢN TRỊ HỆ THỐNG</div><h2>Phân quyền RBAC</h2><p class="muted">Quyền thay đổi tại đây được dùng ngay cho AwD và AwM.</p><label class="rbac-role">Vai trò<select id="rbac-role">${rbacRoles.map(name=>`<option ${name===role?'selected':''}>${esc(name)}</option>`).join('')}</select></label><div class="rbac-groups">${groupMarkup}</div><button id="rbac-save" class="primary">Lưu phân quyền</button>`);
      $('rbac-role').onchange=e=>{role=e.target.value;render()};
      document.querySelectorAll('[data-rbac-group]').forEach(el=>{
        el.onclick=e=>e.stopPropagation();
        el.onchange=()=>{
          const index=Number(el.dataset.rbacGroup),level=el.value,groupKey=rbacGroupKeys[index];
          if(groupKey==='grp_tabs'){
            groups.forEach(([,items],i)=>{
              ensure()[rbacGroupKeys[i]]=level;
              items.forEach(([child])=>ensure()[child]=level);
            });
          }else{
            ensure()[groupKey]=level;
            const parent=rbacTabParents[groupKey];
            if(parent)ensure()[parent]=level;
            groups[index][1].forEach(([child])=>ensure()[child]=level);
          }
          render();
        };
      });
      document.querySelectorAll('[data-rbac-key]').forEach(el=>el.onchange=()=>{
        const key=el.dataset.rbacKey,level=el.value;
        ensure()[key]=level;
        const groupIndex=groups.findIndex(([,items])=>items.some(([child])=>child===key));
        if(groupIndex>=0){
          const groupKey=rbacGroupKeys[groupIndex],parent=rbacTabParents[groupKey];
          if(parent&&(rbacRank[level]||0)>(rbacRank[value(parent)]||0))ensure()[parent]=level;
          if((rbacRank[level]||0)>(rbacRank[value(groupKey)]||0))ensure()[groupKey]=level;
          if(key===parent){
            groups[groupIndex][1].forEach(([child])=>clamp(child,level));
            clamp(groupKey,level);
          }
        }
        render();
      });
      $('rbac-save').onclick=async()=>{
        try{
          $('rbac-save').disabled=true;$('rbac-save').textContent='Đang lưu…';
          await rpc('save_role_permissions',[perms]);
          notice('Đã lưu phân quyền cho AwD và AwM.');$('sheet').close();await boot();
        }catch(e){
          notice(e.message);$('rbac-save').disabled=false;$('rbac-save').textContent='Lưu phân quyền';
        }
      };
    };
    render();
  }).catch(e=>notice(e.message));
} async function loadDrive(append){
  const run=++epoch;if(!trail.length)return;
  const curFolder=trail.at(-1);
  const folderUrl=curFolder?.url||(curFolder?.id?`https://drive.google.com/drive/folders/${encodeURIComponent(curFolder.id)}`:'https://drive.google.com/drive/');
  if($('open-drive-direct'))$('open-drive-direct').onclick=()=>window.open(folderUrl,'_blank','noopener');
  $('drive-more').disabled=true;
  if(!append){driveFiles=[];$('drive-list').innerHTML='<div class="loading">Đang tải dữ liệu từ Google Drive…</div>'}
  try{
    const res=await rpc('awm_drive_list',[project,curFolder.id,append?driveNext:'']);
    if(run!==epoch)return;
    const items=res?.files||[];
    driveFiles=append?[...driveFiles,...items]:items;
    driveNext=res?.nextPageToken||'';
    $('crumb').innerHTML=trail.map((t,i)=>`<button data-crumb="${i}">${esc(t.name)} ›</button>`).join('')+`<span class="source-note" style="margin-left:auto;"><a href="${esc(folderUrl)}" target="_blank" rel="noopener">Mở Drive ↗</a></span>`;
    document.querySelectorAll('[data-crumb]').forEach(b=>b.onclick=()=>{trail=trail.slice(0,Number(b.dataset.crumb)+1);loadDrive(false)});
    if(driveFiles.length){
      $('drive-list').innerHTML=driveFiles.map((f,i)=>{
        const isFolder=f.mimeType==='application/vnd.google-apps.folder';
        const isSheet=f.mimeType==='application/vnd.google-apps.spreadsheet'||f.name.endsWith('.xlsx')||f.name.endsWith('.xls')||f.name.endsWith('.XLSX');
        const isPdf=f.mimeType==='application/pdf'||f.name.endsWith('.pdf');
        const isCad=f.mimeType?.includes('dwg')||f.mimeType?.includes('dxf')||/\.(dwg|dxf)$/i.test(f.name);
        const icon=isFolder?'📁':isSheet?'📊':isPdf?'📑':isCad?'📐':'📄';
        return `<div class="card file-card" style="display:flex;align-items:center;justify-content:space-between;gap:8px;"><button class="text-button" data-file-open="${i}" style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;text-align:left;padding:0;background:none;border:none;cursor:pointer;"><b style="font-size:18px;">${icon}</b><div style="min-width:0;"><h3 style="margin:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(f.name)}</h3><span class="muted" style="font-size:11px;">${isFolder?'Thư mục con':(f.size?Math.ceil(Number(f.size)/1024)+' KB':'Tài liệu')}</span></div></button><a class="primary text-button" style="padding:6px 10px;font-size:13px;font-weight:600;white-space:nowrap;text-decoration:none;" href="${esc(f.webViewLink||`https://drive.google.com/file/d/${f.id}/view`)}" target="_blank" rel="noopener">Mở ↗</a></div>`;
      }).join('');
      document.querySelectorAll('[data-file-open]').forEach(b=>b.onclick=async()=>{
        const f=driveFiles[Number(b.dataset.fileOpen)];
        if(f.mimeType==='application/vnd.google-apps.folder'){
          trail.push({id:f.id,name:f.name,url:f.webViewLink||`https://drive.google.com/drive/folders/${f.id}`});
          loadDrive(false);
        }else{
          if(window.AwmViewer?.openOnline){
            AwmViewer.openOnline({id:f.id,url:f.webViewLink,name:f.name,mime:f.mimeType});
          }else{
            window.open(f.webViewLink||`https://drive.google.com/file/d/${f.id}/view`,'_blank','noopener');
          }
        }
      });
    }else{
      $('drive-list').innerHTML='<div class="empty">Thư mục trống.</div>';
    }
    $('drive-more').hidden=!driveNext;
  }catch(err){
    if(run!==epoch)return;
    const subs=curFolder?.subs||[];
    const headerCard=`<div class="card" style="margin-bottom:12px;background:#f6f8f5;border:1px solid #d4ded0;"><div class="top"><span class="code">Google Drive Online</span><span class="badge online">Ánh xạ từ AD</span></div><h3 style="margin:4px 0 6px 0;">${esc(curFolder.name)}</h3>${curFolder.path?`<div class="muted" style="font-size:12px;margin-bottom:8px;">📁 AD: ${esc(curFolder.path)}</div>`:''}<a class="primary button" style="display:inline-block;padding:10px 16px;text-align:center;text-decoration:none;color:#fff;background:#182b29;border-radius:8px;font-weight:600;font-size:14px;" href="${esc(folderUrl)}" target="_blank" rel="noopener">Mở thư mục trên Google Drive ↗</a></div>`;
    if(subs.length){
      const subCards=subs.map(sub=>`<div class="card file-card" style="display:flex;align-items:center;justify-content:space-between;gap:8px;"><div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;"><b style="font-size:18px;">▱</b><div style="min-width:0;"><h3 style="margin:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(sub.name)}</h3><span class="muted" style="font-size:11px;">Thư mục con Google Drive</span></div></div><a class="primary text-button" style="padding:6px 10px;font-size:13px;font-weight:600;white-space:nowrap;text-decoration:none;" href="${esc(sub.url||`https://drive.google.com/drive/folders/${sub.id}`)}" target="_blank" rel="noopener">Mở ↗</a></div>`).join('');
      $('drive-list').innerHTML=headerCard+`<div class="sectionhead"><span class="muted">${subs.length} thư mục nhánh</span></div>`+subCards;
    }else{
      $('drive-list').innerHTML=headerCard+'<div class="message" style="margin-top:8px;">Nhấn nút “Mở thư mục trên Google Drive ↗” để xem và duyệt các tệp trực tiếp trong ứng dụng Google Drive hoặc trình duyệt di động.</div>';
    }
    $('drive-more').hidden=true;
  }finally{
    if(run===epoch)$('drive-more').disabled=false;
  }
 }
 async function openFile(file){const run=epoch;notice('Đang tải tài liệu…');const blob=await AwmDrive.blob(file);if(run!==epoch||!bootstrap)return;let name=file.name;if(file.mimeType==='application/vnd.google-apps.spreadsheet')name+='.xlsx';else if(file.mimeType.startsWith('application/vnd.google-apps.'))name+='.pdf';await AwmViewer.open(blob,name,file.mimeType)}
 $('close').onclick=()=>$('sheet').close();$('project').onchange=e=>{project=e.target.value;records=[];trail=[];folders={};query='';AwmViewer.close();$('sheet').close();render()};
  $('settings').onclick=()=>{if(!bootstrap)return;const admin=String(bootstrap.user.role||'').trim().toLowerCase()==='admin',canManage=admin||!!bootstrap.files?.can_configure,canSeeFiles=admin||allowed('files');sheet(`<h2>Cài đặt</h2><dl><dt>Tài khoản đăng nhập</dt><dd>${esc(bootstrap.user.username||bootstrap.user.email)}</dd><dt>Email Google</dt><dd>${esc(bootstrap.user.email||'Chưa liên kết')}</dd><dt>Vai trò</dt><dd>${esc(bootstrap.user.role)}</dd></dl><div class="actions"><button id="settings-drive">Nguồn Google Drive</button><button id="refresh-access">Cập nhật quyền</button></div><button class="card" id="settings-links">🔗 Quản lý Link & Google Drive →</button>${canSeeFiles?`<section class="admin-panel"><b>${canManage?'Quản lý':'Xem'} nguồn Drive dự án</b><p>${canManage?'Kiểm tra nguồn đã ánh xạ, đặt thư mục dùng chung hoặc mở AwD để chọn nguồn online.':'Xem các nguồn Drive đã ánh xạ cho dự án. Liên hệ người quản lý QL File để thay đổi.'}</p><button class="card" id="drive-management">${canManage?'Quản lý':'Xem'} thư mục dự án →</button>${canManage?'<a class="card" href="../index.html?view=desktop">Mở QL File trên AwD →</a>':''}</section>`:''}${admin?'<section class="admin-panel"><b>Quản trị hệ thống</b><p>Thiết lập tài khoản, vai trò và ma trận phân quyền trực tiếp trên điện thoại.</p><button class="card" id="rbac-management">Phân quyền RBAC trên AwM →</button><a class="card" href="../index.html?view=desktop">Mở Cài đặt quản trị AwD →</a></section>':''}${allowed('mail')?'<button class="card" id="pair">Liên kết thiết bị AD</button><button class="card" id="revoke">Thu hồi thiết bị AD</button>':''}<label class="card">Mở tài liệu trên thiết bị<input id="local-file" type="file" accept=".pdf,.xlsx,.xls,.csv,.eml,.txt,.dwg,.dxf,.msg,image/*"></label><button class="card" id="logout">Đăng xuất</button>`);$('settings-drive').onclick=()=>{sheet(`<h2>Nguồn Google Drive</h2><dl><dt>Dự án</dt><dd>${esc(project)}</dd><dt>Tài khoản Drive dự án</dt><dd>bqlxddp@gmail.com</dd><dt>Trạng thái</dt><dd>✓ Đã ánh xạ 11/11 menu QL File</dd></dl><p class="muted">Toàn bộ 11 thư mục hồ sơ của dự án Vinhomes Đan Phượng đã được liên kết với Google Drive trực tuyến. Không cần đăng nhập OAuth token trên điện thoại.</p><div class="actions"><a class="primary" style="display:inline-block;padding:12px 18px;text-align:center;text-decoration:none;color:#fff;background:#182b29;border-radius:8px;font-weight:600;" href="https://drive.google.com/drive/folders/1z3Il9qZ7N0yQ5UMjSYnWgluV2BwI-B_7" target="_blank" rel="noopener">Mở thư mục tổng VH trên Drive ↗</a></div>`)};if($('settings-links'))$('settings-links').onclick=()=>{$('sheet').close();page='links';render()};$('refresh-access').onclick=()=>{$('sheet').close();boot()};if($('drive-management'))$('drive-management').onclick=()=>{$('sheet').close();page='files';render()};if($('rbac-management'))$('rbac-management').onclick=rbacScreen;$('local-file').onchange=async e=>{const file=e.target.files[0];if(file)await AwmViewer.open(file,file.name,file.type)};$('logout').onclick=async()=>{const token=sessionStorage.getItem(TOKEN);sessionStorage.removeItem(TOKEN);auth();try{await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({method:'logout_user',args:[]})})}catch{}};if($('pair'))$('pair').onclick=async()=>{try{const r=await rpc('awm_pair_device');sheet(`<h2>Liên kết AD</h2><p>Nhập token này vào connector AD. Token mới thay thế thiết bị cũ.</p><dl><dt>Server</dt><dd class="mono">${esc(location.origin)}</dd><dt>Username</dt><dd>${esc(bootstrap.user.username)}</dd><dt>Token thiết bị (chỉ hiện lần này)</dt><dd class="mono">${esc(r.device_token)}</dd></dl><p class="muted">Không chia sẻ token. AD cần gửi heartbeat trong khi hoạt động.</p>`)}catch(e){notice(e.message)}};if($('revoke'))$('revoke').onclick=async()=>{try{await rpc('awm_revoke_device');notice('Đã thu hồi thiết bị và dữ liệu Mail.')}catch(e){notice(e.message)}};};
 // Going to another phone app must not throw away the current document or
 // detail sheet.  iOS/Android commonly fire visibilitychange for a brief
 // app switch; retaining the DOM keeps the user on the exact contract and
 // scroll position when they return.  A fresh bootstrap still runs only on
 // an explicit reload, login, project change, or access refresh.
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer)});
 window.AwmLive = { openNamedFile, openFile };
 if(sessionStorage.getItem(TOKEN))boot();else auth();
})();
