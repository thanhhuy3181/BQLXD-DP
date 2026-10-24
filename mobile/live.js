'use strict';
(()=>{
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const TOKEN='awm_session',trackingMenu={progress:'progress',hsmt:'hsmt',contract:'contract','contractor:detail':'contract',payment:'payment',boq:'hsmt','chu-truong':'approval',bvtk:'design'};let mailAccount='',mailFolder='Inbox';const fmtMailDate=v=>{const d=new Date(v);return v&&!isNaN(d)?d.toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):String(v||'')};let bootstrap=null,page='home',project='',tab='',query='',epoch=0,records=[],columns=[],cursor=null,folders={},menu='',trail=[],driveFiles=[],driveNext='',timer=null,mailPollTimer=null,mailSeen=new Set(),todoFilter='open',todoItems=[],linkScope='project',linkItems=[],linkSearch='',driveSyncing=false,driveSearch='',driveSort='za';
 async function pollMail(){if(!bootstrap||!allowed('mail'))return;try{const data=await rpc('awm_mail_list',[project,'']);const items=Array.isArray(data?.items)?data.items:(Array.isArray(data)?data:[]);const ids=items.map(x=>String(x.id||x.message_id||x.subject||x.file_name||''));if(mailSeen.size){const fresh=ids.filter(id=>id&&!mailSeen.has(id));if(fresh.length){notice(`Có ${fresh.length} mail mới từ AD`);if('Notification' in window&&Notification.permission==='granted')new Notification('BQLDA có mail mới',{body:`${fresh.length} thư mới đã đồng bộ`})}}mailSeen=new Set(ids)}catch(_){} }
 function notice(s){$('toast').textContent=s;$('toast').style.display='block';clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('toast').style.display='none',4000)}
 function addAdminAccountLink(){if(String(bootstrap?.user?.role||'').trim().toLowerCase()!=='admin')return;const panels=document.querySelectorAll('.admin-panel'),panel=panels[panels.length-1];if(!panel)return;const items=[['account-management','👥 Quản lý tài khoản →','../index.html?view=desktop&settings=accounts'],['appearance-management','🎨 Tùy biến Tab & Màu sắc →','../index.html?view=desktop&settings=appearance'],['project-management','🏢 QL HM/CT →','../index.html?view=desktop&settings=projects']];items.forEach(([id,text,href])=>{if($(id))return;const a=document.createElement('a');a.id=id;a.className='card';a.href=href;a.textContent=text;panel.append(a)})}
 const adminSettingsObserver=new MutationObserver(addAdminAccountLink);adminSettingsObserver.observe(document.body,{childList:true,subtree:true});
 function bindSettingsControls(){
  const back=()=>{closeSheet();page='home';render().then(()=>setTimeout(()=>{if(bootstrap)$('settings').click()},0))};
  $('rbac-back')?.addEventListener('click',back);
  const open=(id,title,text)=>$(id)?.addEventListener('click',async()=>{let config={};try{config=await rpc('get_app_config_full')}catch(e){notice(e.message)}const key='awm_'+id;const saved=config[key]||'';let body='';if(id==='appearance-management')body='<label>Chủ đề<select id="settings-child-value"><option value="default">Mặc định xanh</option><option value="rose_pine">Rose Pine</option><option value="dark">Tối</option></select></label><label>Cỡ chữ<select id="settings-child-font"><option>sm</option><option selected>md</option><option>lg</option></select></label>';else if(id==='project-management')body='<label>Dự án đang chỉnh<select id="settings-child-value">'+(bootstrap.projects||[]).map(p=>`<option>${esc(p)}</option>`).join('')+'</select></label><p class="message">Các menu QL HM/CT được điều khiển theo quyền RBAC và nguồn Drive của dự án.</p>';else body='<div id="settings-child-users" class="loading">Đang tải danh sách tài khoản…</div><button type="button" class="primary" id="settings-child-refresh">Làm mới danh sách</button>';sheet(`<button class="back-button" id="settings-child-back">← Cài đặt</button><h2>${title}</h2><p class="muted">${text}</p><form id="settings-child-form" class="form">${body}${id!=='account-management'?'<button class="primary">Lưu thay đổi</button>':''}</form>`);$('settings-child-back').onclick=back;if(id==='account-management'){const load=async()=>{try{const users=await rpc('get_users_list');$('settings-child-users').innerHTML=(users||[]).map(u=>`<div class="card"><b>${esc(u.fullname||u.username)}</b><small>${esc(u.email||'')} · ${esc(u.role||'')}</small></div>`).join('')||'Chưa có tài khoản'}catch(e){$('settings-child-users').textContent=e.message}};load();$('settings-child-refresh').onclick=load}else{$('settings-child-form').onsubmit=async e=>{e.preventDefault();try{await rpc('save_app_config_full',[{[key]:$('settings-child-value').value.trim(),font_size:$('settings-child-font')?.value||'md'}]);notice('Đã đồng bộ cấu hình cho AwD và AwM.')}catch(err){notice(err.message)}}}});
  open('appearance-management','Tùy biến Tab & Màu sắc','Thiết lập giao diện AwM.');
  open('project-management','QL HM/CT','Quản lý nhóm hồ sơ và chủ trương.');
  open('account-management','QL ACC (Tài khoản)','Quản lý tài khoản và cấp dự án.');
 }
 function bindLinkDriveControls(){
  $('link-project')?.addEventListener('click',()=>openProjectModal());
  $('link-drive')?.addEventListener('click',()=>{
   if(linkScope==='__common__'){
    sheet(`<button class="back-button" id="link-drive-back">← Quản lý Link</button><h2>Nguồn Drive dùng chung</h2><p class="message">Nguồn Drive dùng chung được quản lý theo hệ thống.</p>`);
    $('link-drive-back').onclick=()=>closeSheet();
   }else{page='files';render()}
  });
 }
 async function rpc(method,args=[]){const token=sessionStorage.getItem(TOKEN);const r=await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({method,args}),signal:AbortSignal.timeout(25000)});const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'Không thể kết nối server.');if(data.session_token)sessionStorage.setItem(TOKEN,data.session_token);return data.data}
 const error=(e)=>'<div class="message error">'+esc(e.message)+'</div>';
 function removeVietnameseTones(str){return String(str||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim()}
 function highlightMatch(text,query){if(!query||!query.trim())return esc(text);const qClean=removeVietnameseTones(query);const tClean=removeVietnameseTones(text);const idx=tClean.indexOf(qClean);if(idx===-1)return esc(text);const matchLen=query.trim().length;const before=text.slice(0,idx);const matched=text.slice(idx,idx+matchLen);const after=text.slice(idx+matchLen);return `${esc(before)}<mark class="project-match-highlight">${esc(matched)}</mark>${esc(after)}`}
 function updateProjectDisplay(){if($('project-display'))$('project-display').textContent=project||'Chọn dự án';if($('project'))$('project').value=project;if($('project-btn'))$('project-btn').setAttribute('aria-label','Dự án: '+(project||'Chưa chọn')+'. Chạm để gõ tìm và đổi dự án')}
 function projectFavoriteKey(){return `awm_favorite_projects_${String(bootstrap?.user?.email||bootstrap?.user?.username||'guest').toLowerCase()}`}
 function favoriteProjects(){try{return new Set(JSON.parse(localStorage.getItem(projectFavoriteKey())||'[]'))}catch{return new Set()}}
 function toggleFavoriteProject(name){const favorites=favoriteProjects();favorites.has(name)?favorites.delete(name):favorites.add(name);localStorage.setItem(projectFavoriteKey(),JSON.stringify([...favorites]));const q=$('project-search-input')?.value||'';renderProjectSuggestions(q)}
 function renderProjectSuggestions(query=''){const listEl=$('project-suggestions');if(!listEl)return;const allProjects=bootstrap?.projects||[];const favorites=favoriteProjects();const qTrim=String(query||'').trim();const qClean=removeVietnameseTones(qTrim);let filtered=allProjects;if(qClean){filtered=allProjects.filter(p=>removeVietnameseTones(p).includes(qClean))}filtered.sort((a,b)=>(Number(favorites.has(b))-Number(favorites.has(a)))||a.localeCompare(b,'vi',{numeric:true,sensitivity:'base'}));const countEl=$('project-modal-count');if(countEl){countEl.textContent=qTrim?`${filtered.length} dự án phù hợp (trong ${allProjects.length} dự án)`:`${allProjects.length} dự án được cấp quyền · ${favorites.size} đã lưu`}if(!filtered.length){listEl.innerHTML=`<div class="empty" style="padding:28px 12px;">Không tìm thấy dự án nào khớp với “<strong>${esc(qTrim)}</strong>”.<br><small class="muted" style="margin-top:6px;display:block;">Thử gõ không dấu hoặc kiểm tra lại tên dự án.</small></div>`;return}listEl.innerHTML=filtered.map(p=>{const isCur=(p===project),isFav=favorites.has(p);const label=qClean?highlightMatch(p,qTrim):esc(p);return `<button type="button" class="project-item ${isCur?'active':''}" data-project-pick="${esc(p)}" role="option" aria-selected="${isCur}"><div class="project-item-info"><span class="project-item-icon">🏢</span><div class="project-item-name">${label}</div></div><span class="project-item-actions" style="margin-left:auto;display:inline-flex;align-items:center;gap:8px;"><span class="project-star ${isFav?'saved':''}" data-project-star="${esc(p)}" role="button" tabindex="0" style="font-size:22px;line-height:1;min-width:28px;text-align:center;color:#9aa69d;cursor:pointer;" aria-label="${isFav?'Bỏ lưu':'Lưu'} dự án" title="${isFav?'Bỏ khỏi dự án hay dùng':'Lưu dự án hay dùng'}">${isFav?'★':'☆'}</span>${isCur?'<span class="project-item-check" title="Dự án hiện tại">✓</span>':''}</span></button>`}).join('');listEl.querySelectorAll('[data-project-pick]').forEach(btn=>{btn.onclick=e=>{if(e.target.closest('[data-project-star]'))return;selectProject(btn.dataset.projectPick)}});listEl.querySelectorAll('[data-project-star]').forEach(btn=>{btn.onclick=e=>{e.stopPropagation();toggleFavoriteProject(btn.dataset.projectStar)}})}
 function openProjectModal(){if(!bootstrap?.projects?.length){notice('Tài khoản chưa được cấp dự án.');return}const modal=$('project-modal');if(!modal)return;const searchInput=$('project-search-input');if(searchInput){searchInput.value='';if($('project-search-clear'))$('project-search-clear').hidden=true}renderProjectSuggestions('');modal.showModal();modal.scrollTop=0;if(history.state?.awm_modal!=='project')history.pushState({awm_modal:'project'},'');if(searchInput){setTimeout(()=>{try{searchInput.focus()}catch(_){}},100)}}
 function closeProjectModal(fromPopstate=false){const modal=$('project-modal');if(!modal?.open)return;modal.close();if(!fromPopstate&&history.state?.awm_modal==='project')history.back()}
 function selectProject(newProject){if(!newProject){closeProjectModal();return}const changed=(newProject!==project);project=newProject;updateProjectDisplay();closeProjectModal();if(changed){if(window.CollaborationWorkspace?.unmount)window.CollaborationWorkspace.unmount();records=[];trail=[];folders={};query='';driveSearch='';driveSort='za';AwmViewer.close();closeSheet();notice('Đã chuyển sang dự án: '+newProject);render()}}
 function reset(){if(window.CollaborationWorkspace?.unmount)window.CollaborationWorkspace.unmount();epoch++;clearTimeout(timer);bootstrap=null;records=[];folders={};driveFiles=[];trail=[];driveSearch='';driveSort='za';linkItems=[];linkSearch='';driveSyncing=false;AwmDrive.clear();AwmViewer.close();$('sheet').close();$('project-modal')?.close();$('project').replaceChildren();updateProjectDisplay();$('nav').replaceChildren();document.querySelector('.projectbar').hidden=true}
 function auth(message=''){
  reset();$('settings').hidden=true;
  $('main').innerHTML=`<section class="auth"><span class="logo">B</span><div class="eyebrow">BQLDA / AwM</div><h1>Dự án của bạn.<br>Trong tầm tay.</h1><p class="muted">Đăng nhập bằng Google hoặc tài khoản hệ thống đã được Admin cấp quyền.</p><div id="google-button"></div><div class="auth-divider"><span>hoặc tài khoản hệ thống</span></div><form id="system-login-form" class="form auth-system"><label>Tên đăng nhập hoặc email<input id="auth-username" autocomplete="username" required maxlength="120" placeholder="Tên đăng nhập hoặc email"></label><label>Mật khẩu<div class="password-field"><input id="auth-password" type="password" autocomplete="current-password" required maxlength="200" placeholder="Mật khẩu"><button type="button" class="password-toggle" id="toggle-auth-password" aria-label="Hiện mật khẩu">👁</button></div></label><button class="primary" id="auth-system-submit">Đăng nhập</button></form><button type="button" id="show-register" class="text-button">Tạo tài khoản mới</button><form id="system-register-form" class="form auth-system" hidden><label>Họ và tên<input id="reg-fullname" required maxlength="100" placeholder="Nguyễn Văn A"></label><label>Tên đăng nhập<input id="reg-username" autocomplete="username" required maxlength="30" placeholder="Ví dụ: nguyenvana"></label><label>Mật khẩu<div class="password-field"><input id="reg-password" type="password" autocomplete="new-password" required maxlength="200" placeholder="Tối thiểu 8 ký tự"><button type="button" class="password-toggle" id="toggle-reg-password" aria-label="Hiện mật khẩu">👁</button></div></label><button class="primary" id="auth-register-submit">Gửi đăng ký</button></form><div id="auth-message" role="status">${message?error({message}):''}</div><p class="muted">Tài khoản mới cần Admin phê duyệt và cấp dự án trước khi truy cập.</p></section>`;
  const bindPasswordToggle=(buttonId,inputId)=>$(buttonId).onclick=()=>{const input=$(inputId),show=input.type==='password';input.type=show?'text':'password';$(buttonId).textContent=show?'🙈':'👁';$(buttonId).setAttribute('aria-label',show?'Ẩn mật khẩu':'Hiện mật khẩu')};
  bindPasswordToggle('toggle-auth-password','auth-password');bindPasswordToggle('toggle-reg-password','reg-password');
  $('show-register').onclick=()=>{$('system-register-form').hidden=!$('system-register-form').hidden};
  $('system-login-form').onsubmit=async e=>{e.preventDefault();const target=$('auth-message');target.textContent='Đang đăng nhập…';$('auth-system-submit').disabled=true;try{await rpc('login_user',[$('auth-username').value.trim(),$('auth-password').value]);await boot()}catch(err){target.innerHTML=error(err);$('auth-system-submit').disabled=false}};
  $('system-register-form').onsubmit=async e=>{e.preventDefault();const target=$('auth-message');target.textContent='Đang gửi đăng ký…';$('auth-register-submit').disabled=true;try{await rpc('register_user',[{username:$('reg-username').value.trim(),fullname:$('reg-fullname').value.trim(),password:$('reg-password').value}]);target.textContent='Đã gửi đăng ký. Admin cần phê duyệt trước khi bạn đăng nhập.';$('auth-register-submit').disabled=false}catch(err){target.innerHTML=error(err);$('auth-register-submit').disabled=false}};
  setupGoogle();
 }
 function setupGoogle(){if(!window.google?.accounts?.id){setTimeout(()=>{if(!bootstrap&&$('google-button'))setupGoogle()},500);return}google.accounts.id.initialize({client_id:window.BQLDA_WEB_CLIENT_ID,callback:async response=>{const target=$('auth-message');if(target)target.textContent='Đang xác thực…';try{await rpc('google_login',[response.credential]);await boot()}catch(e){if($('auth-message'))$('auth-message').innerHTML=error(e)}}});if($('google-button'))google.accounts.id.renderButton($('google-button'),{theme:'outline',size:'large',width:Math.min(320,innerWidth-60),text:'continue_with'});}
 async function boot(){const run=++epoch;try{const data=await rpc('awm_bootstrap');if(run!==epoch)return;bootstrap=data;const defaultProj=(bootstrap.user?.role!=='Admin'&&bootstrap.user?.current_project&&bootstrap.projects.includes(bootstrap.user.current_project))?bootstrap.user.current_project:(bootstrap.projects.includes('Vinhomes Đan Phượng')?'Vinhomes Đan Phượng':(bootstrap.projects[0]||''));if(!bootstrap.projects.length){project=''}else if(!project||!bootstrap.projects.includes(project))project=defaultProj;if(!bootstrap.groups.some(g=>g.id===tab))tab=bootstrap.groups[0]?.id||'';if(!bootstrap.menus.some(m=>m.id===menu))menu=bootstrap.menus[0]?.id||'';$('settings').hidden=false;$('settings').disabled=!allowed('settings');document.querySelector('.projectbar').hidden=false;$('project').innerHTML=bootstrap.projects.length?bootstrap.projects.map(p=>`<option value="${esc(p)}" ${p===project?'selected':''}>${esc(p)}</option>`).join(''):'<option>Chưa được cấp dự án</option>';$('project').disabled=!bootstrap.projects.length;updateProjectDisplay();await render();clearInterval(mailPollTimer);mailPollTimer=setInterval(pollMail,30000);pollMail()}catch(e){if(run!==epoch)return;sessionStorage.removeItem(TOKEN);auth(e.message)}}
 function allowed(p){if(!bootstrap)return false;if(p==='settings'||p==='cai_dat'){if(bootstrap.nav?.settings!==undefined)return !!bootstrap.nav.settings;if(bootstrap.nav?.cai_dat!==undefined)return !!bootstrap.nav.cai_dat;if(bootstrap.nav?.tab_cai_dat!==undefined)return !!bootstrap.nav.tab_cai_dat;return false}return !!bootstrap.nav?.[p]}
 function nav(){const defs=[['home','⌂','Home'],['mail','✉','Mail'],['todo','☷','To do'],['files','▱','QL File'],['tracking','▤','Theo dõi'],['settings','⚙','Cài đặt']];$('nav').innerHTML=defs.map(([id,icon,label])=>`<button data-page="${id}" ${!allowed(id)?'disabled':''} class="${page===id?'active':''}" ${page===id?'aria-current="page"':''}><b aria-hidden="true">${icon}</b>${label}</button>`).join('');document.querySelectorAll('nav [data-page]').forEach(b=>b.onclick=()=>{if(b.dataset.page==='settings'){if(!allowed('settings'))return;$('settings')?.click();return}page=b.dataset.page;query='';trail=[];render();window.scrollTo({top:0})})}
 async function render(){const run=++epoch;clearTimeout(timer);$('settings').disabled=!allowed('settings');nav();if(page!=='todo'){if(window.CollaborationWorkspace?.unmount)window.CollaborationWorkspace.unmount();}if(page==='todo'){if(!allowed('todo')){$('main').innerHTML='<div class="message">Tài khoản chưa được cấp quyền xem mục này.</div>';return}if(!project){$('main').innerHTML='<h1>Chờ cấp dự án</h1><p class="message">Tài khoản đã đăng nhập. Quản trị viên cần cấp dự án để tra cứu hồ sơ.</p>';return}if(window.CollaborationWorkspace?.mount){try{await window.CollaborationWorkspace.mount($('main'),{rpc,project})}catch(err){if(run===epoch)$('main').innerHTML=`<div class="message error">Không thể tải không gian cộng tác: ${esc(err?.message||err)}</div>`}}else{$('main').innerHTML='<div class="message">Không gian cộng tác To do tạm thời không khả dụng trên thiết bị này.</div>'}return}if(page==='links'){await linksPage(run);return}if(!allowed(page)){$('main').innerHTML='<div class="message">Tài khoản chưa được cấp quyền xem mục này.</div>';return}if(!project){$('main').innerHTML='<h1>Chờ cấp dự án</h1><p class="message">Tài khoản đã đăng nhập. Quản trị viên cần cấp dự án để tra cứu hồ sơ.</p>';return}
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
  function todoForm(item=null){const editing=!!item;sheet(`<div class="eyebrow">${esc(project)}</div><h2>${editing?'Cập nhật việc':'Việc mới'}</h2><form id="todo-form" class="form"><label>Tên việc<input id="todo-title" required maxlength="180" value="${esc(item?.title||'')}" placeholder="Ví dụ: Kiểm tra hồ sơ hợp đồng"></label><label>Hạn xử lý<input id="todo-due" type="date" value="${esc(item?.due_date||'')}"></label><label>Ưu tiên<select id="todo-priority"><option value="high" ${item?.priority==='high'?'selected':''}>Cao</option><option value="normal" ${!item||item?.priority==='normal'?'selected':''}>Bình thường</option><option value="low" ${item?.priority==='low'?'selected':''}>Thấp</option></select></label><label>Ghi chú<textarea id="todo-notes" maxlength="1000" placeholder="Thông tin cần nhớ">${esc(item?.notes||'')}</textarea></label><button class="primary">${editing?'Lưu thay đổi':'Tạo việc'}</button></form>${editing?`<div class="actions"><button id="todo-toggle">${item.status==='done'?'Mở lại việc':'Đánh dấu hoàn thành'}</button><button id="todo-delete" class="danger">Xóa việc</button></div>`:''}`);$('todo-form').onsubmit=async e=>{e.preventDefault();const payload={title:$('todo-title').value,due_date:$('todo-due').value,priority:$('todo-priority').value,notes:$('todo-notes').value};try{if(editing)await rpc('awm_update_todo',[project,item.id,payload]);else await rpc('awm_save_todo',[project,payload]);closeSheet();todos(++epoch)}catch(e){notice(e.message)}};if(editing){$('todo-toggle').onclick=async()=>{try{await rpc('awm_update_todo',[project,item.id,{status:item.status==='done'?'open':'done'}]);closeSheet();todos(++epoch)}catch(e){notice(e.message)}};$('todo-delete').onclick=async()=>{if(!confirm('Xóa việc này?'))return;try{await rpc('awm_delete_todo',[project,item.id]);closeSheet();todos(++epoch)}catch(e){notice(e.message)}}}}
 async function loadRows(append){if(!tab){$('list').innerHTML='<div class="message">Chưa được cấp quyền cho nhóm hồ sơ nào.</div>';return}const run=++epoch;if(!append){records=[];$('list').innerHTML='<div class="loading">Đang tải hồ sơ…</div>'}$('more-rows').disabled=true;try{const data=await rpc('awm_tracking',[project,tab,query,append?cursor:0]);if(run!==epoch)return;records=append?[...records,...data.items]:data.items;columns=data.columns;cursor=data.next_cursor;$('count').textContent=`${data.total} hồ sơ · ${records.length} đã tải`;$('list').innerHTML=records.length?records.map((r,i)=>{const title=r.name||r.ten_goi_thau||r.noi_dung||r.ten_nha_thau||r.code||'Hồ sơ';const code=String(r.code||r.ma_hsmt||r.ma_goi_thau||'');const dateVal=String(r.date||r.ngay_ph||r.date_sign||'');return `<button class="card" data-record="${i}"><div class="top">${code?`<span class="code" data-quick-file="${i}" style="color:#c66a19;text-decoration:underline;cursor:pointer;" title="Mở trực tiếp ${tab==='hsmt'?'BOQ Excel':'PDF hợp đồng'}">${esc(code)} ↗</span>`:'<span class="code">Hồ sơ</span>'}<span class="badge">${esc(r.trang_thai_hd||r.tt_hop_dong||r.trang_thai_ph_hsmt||'Tra cứu')}</span></div><h3>${esc(title)}</h3><div class="muted">${esc(r.nha_thau||r.ten_nha_thau||r.cdt||r.cap_thu_muc||'')}</div><div class="foot">${dateVal?`<span data-quick-folder="${i}" style="color:#1a73e8;font-weight:600;text-decoration:underline;cursor:pointer;" title="Mở thư mục online">${esc(dateVal)} ↗</span>`:'<span>-</span>'}<span>Chi tiết ↗</span></div></button>`}).join(''):'<div class="empty">Không có hồ sơ phù hợp.</div>';$('more-rows').hidden=cursor===null;document.querySelectorAll('[data-record]').forEach(b=>b.onclick=()=>detail(records[Number(b.dataset.record)]));document.querySelectorAll('[data-quick-file]').forEach(b=>b.onclick=e=>{e.stopPropagation();const r=records[Number(b.dataset.quickFile)];const code=String(r.code||r.ma_hsmt||'');if(code)openRecordFile(code,tab==='hsmt'?'excel':'pdf');});document.querySelectorAll('[data-quick-folder]').forEach(b=>b.onclick=e=>{e.stopPropagation();const r=records[Number(b.dataset.quickFolder)];if(tab==='hsmt')openHsmtFolderOnline(r);else if(tab==='contract'||tab==='contractor:detail')openContractFolderOnline(r);else{const target=r.folder||r.path||r.folder_name||r.folder_path||r.full_path||r.noi_dung||r.name||r.code||'';openRecordFolder(target,r);}});}catch(e){if(run===epoch)$('list').innerHTML=error(e)}finally{if(run===epoch)$('more-rows').disabled=false}}
 function closeSheet(fromPopstate=false){if(!$('sheet')?.open)return;$('sheet').close();$('sheet').style.transform='';if(!fromPopstate&&history.state?.awm_modal==='sheet')history.back();}
 function sheet(html){$('detail').innerHTML=html;$('sheet').showModal();$('sheet').scrollTop=0;$('sheet').style.transform='';if(history.state?.awm_modal!=='sheet')history.pushState({awm_modal:'sheet'},'');}
 function isOutsideSheet(e){const r=$('sheet').getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;}
 $('sheet').addEventListener('click',e=>{if(e.target===$('sheet')&&isOutsideSheet(e))closeSheet();});
 let bdropTouch=false;
 $('sheet').addEventListener('touchstart',e=>{bdropTouch=(e.target===$('sheet')&&isOutsideSheet(e.touches[0]));},{passive:true});
 $('sheet').addEventListener('touchend',e=>{if(bdropTouch&&e.target===$('sheet')&&e.changedTouches.length&&isOutsideSheet(e.changedTouches[0])){bdropTouch=false;closeSheet();}bdropTouch=false;},{passive:true});
 let sTouchX=0,sTouchY=0,sTouchT=0,sSwiping=false;
 $('sheet').addEventListener('touchstart',e=>{if(e.touches.length!==1)return;sTouchX=e.touches[0].clientX;sTouchY=e.touches[0].clientY;sTouchT=Date.now();sSwiping=false;$('sheet').style.transition='none';},{passive:true});
 $('sheet').addEventListener('touchmove',e=>{if(e.touches.length!==1)return;const cx=e.touches[0].clientX,cy=e.touches[0].clientY,dx=cx-sTouchX,dy=cy-sTouchY;if(dx>12&&dx>Math.abs(dy)*1.1&&sTouchX<160){sSwiping=true;$('sheet').style.transform=`translateX(${Math.max(0,dx)}px)`;}else if(dy>12&&dy>Math.abs(dx)*1.1&&$('sheet').scrollTop<=0){sSwiping=true;$('sheet').style.transform=`translateY(${Math.max(0,dy)}px)`;}},{passive:true});
 $('sheet').addEventListener('touchend',e=>{if(!sSwiping){$('sheet').style.transform='';return;}const cx=e.changedTouches[0].clientX,cy=e.changedTouches[0].clientY,dx=cx-sTouchX,dy=cy-sTouchY,dt=Date.now()-sTouchT;const isRight=(dx>80&&dx>Math.abs(dy))||(dx>40&&dt<300&&dx>Math.abs(dy));const isDown=(dy>80&&dy>Math.abs(dx)&&$('sheet').scrollTop<=0);if(isRight){$('sheet').style.transition='transform .2s cubic-bezier(.2,.9,.3,1)';$('sheet').style.transform='translateX(100%)';setTimeout(()=>{closeSheet();$('sheet').style.transform='';$('sheet').style.transition='';},190);}else if(isDown){$('sheet').style.transition='transform .2s cubic-bezier(.2,.9,.3,1)';$('sheet').style.transform='translateY(100%)';setTimeout(()=>{closeSheet();$('sheet').style.transform='';$('sheet').style.transition='';},190);}else{$('sheet').style.transition='transform .2s ease-out';$('sheet').style.transform='';setTimeout(()=>{$('sheet').style.transition='';},200);}sSwiping=false;},{passive:true});
 window.addEventListener('popstate',()=>{if($('viewer')?.open){if(window.AwmViewer?.hasHistory&&window.AwmViewer.hasHistory())window.AwmViewer.goBack(true);else if(window.AwmViewer)window.AwmViewer.close(true,true);else $('viewer').close();return;}if($('project-modal')?.open){closeProjectModal(true);return;}if($('sheet')?.open){closeSheet(true);return;}});
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
          return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;margin:6px 0;background:#f5f8f5;border:1px solid #dbe6d8;border-radius:8px;"><div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;"><span style="font-size:18px;">${icon}</span><div style="min-width:0;"><div style="font-size:13px;font-weight:600;color:#182b29;word-break:break-word;line-height:1.3;">${esc(fileLine)}</div><div style="font-size:11px;color:#5a6e5e;margin-top:2px;">${tag} <span class="named-file-size" data-file-name="${esc(fileLine)}">· Đang tải dung lượng…</span></div></div></div><button type="button" class="primary text-button open-named-file-btn" data-named-file="${esc(fileLine)}" style="padding:6px 10px;font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer;border-radius:6px;background:#182b29;color:#fff;border:none;">Mở tệp ↗</button></div>`;
        }).join('');
        return `<dt>${esc(labels.get(k)||'Tên tài liệu')}</dt><dd style="margin:4px 0 10px 0;">${items}</dd>`;
      }
      return `<dt>${esc(labels.get(k)||labelFallback[k]||k)}</dt><dd class="detail-value">${esc(typeof v==='object'?JSON.stringify(v):v)}</dd>`;
    }).join('');
    sheet(`<div class="eyebrow">${esc(project)}${currentGroup?' / '+esc(currentGroup):''}</div><h2>${esc(row.name||row.ten_goi_thau||row.noi_dung||code||'Chi tiết hồ sơ')}</h2>${contractFinanceCard}<dl>${linkedCode}${values}${cks}</dl>${[...new Set(docs)].map(id=>`<button class="card" data-doc="${id}">Đọc tài liệu Drive →</button>`).join('')}<button class="card" id="related">Mở kho hồ sơ liên quan →</button>`);
    document.querySelectorAll('[data-doc]').forEach(b=>b.onclick=async()=>{try{if(window.AwmViewer?.openOnline){await AwmViewer.openOnline({id:b.dataset.doc,project});return;}throw Error('Kênh xem tài liệu nội bộ chưa sẵn sàng.');}catch(e){notice(e.message)}});
    if($('open-main-file'))$('open-main-file').onclick=()=>openRecordFile(code,fileKind);
    if($('open-folder'))$('open-folder').onclick=()=>isContract?openContractFolderOnline(row):openRecordFolder(folderName,row);
    if($('open-hsmt-folder-online'))$('open-hsmt-folder-online').onclick=()=>openHsmtFolderOnline(row);
    document.querySelectorAll('.open-contract-folder-online').forEach(b=>b.onclick=()=>openContractFolderOnline(row));
    document.querySelectorAll('[data-open-contract]').forEach(b=>{b.onclick=()=>{const contractCode=b.dataset.openContract;$('sheet').close();page='tracking';tab='contract';query=contractCode;trail=[];render();};});
    document.querySelectorAll('.open-named-file-btn').forEach(b=>{b.onclick=()=>openNamedFile(b.dataset.namedFile,row);});document.querySelectorAll('.named-file-size').forEach(async el=>{try{const r=await rpc('awm_find_file',[project,el.dataset.fileName,'all']);const f=r?.files?.[0];el.textContent=f?.size?'· '+(Number(f.size)>1048576?(Number(f.size)/1048576).toFixed(1)+' MB':(Number(f.size)/1024).toFixed(0)+' KB'):'· Chưa xác định';}catch{el.textContent='· Chưa xác định'}});
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
    const ext=fileName.split('.').pop().toLowerCase();
    const isEmail=ext==='msg'||fileName.toLowerCase().endsWith('.msg')||fileName.toLowerCase().includes('.msg')||/^(fw|re)\s*[:\s]/i.test(fileName);
    if(isEmail){
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
        if(window.AwmViewer?.openOnline){
          AwmViewer.openOnline({id:file.id,url:file.webViewLink,name:file.name,mime:file.mimeType,row});
        }else{
          window.open(file.webViewLink,'_blank','noopener');
        }
        return;
      }
      if(window.AwmViewer?.openOnline){
        AwmViewer.openOnline({id:'',url:'https://drive.google.com/drive/search?q='+encodeURIComponent(fileName),name:fileName,mime:'',row});
      }else{
        window.open('https://drive.google.com/drive/search?q='+encodeURIComponent(fileName),'_blank','noopener');
      }
    }catch(e){
      if(window.AwmViewer?.openOnline){
        AwmViewer.openOnline({id:'',url:'https://drive.google.com/drive/search?q='+encodeURIComponent(fileName),name:fileName,mime:'',row});
      }else{
        window.open('https://drive.google.com/drive/search?q='+encodeURIComponent(fileName),'_blank','noopener');
      }
    }
  }
  async function openHsmtFolderOnline(row){
    try{
      const code=String(row?.code||row?.ma_hsmt||'').trim();
      notice('Đang tìm thư mục online…');
      if(code){
        try{
          const res=await rpc('awm_find_file',[project,code,'folder']);
          const folder=res?.files?.[0];
          if(folder?.webViewLink||folder?.id){
            window.open(folder.webViewLink||`https://drive.google.com/drive/folders/${folder.id}`,'_blank','noopener');
            return;
          }
        }catch(_){}
      }
      const covered=coverOnlineUrl(row?.folder_name||row?.folder_path||row?.full_path||row?.folder||row?.path||'06.01');
      window.open(/^https?:\/\//i.test(covered)?covered:'https://drive.google.com/drive/folders/19IbTJq4pOgoUf8vNdeufnBp5Gddn0uLy','_blank','noopener');
    }catch(e){
      window.open('https://drive.google.com/drive/folders/19IbTJq4pOgoUf8vNdeufnBp5Gddn0uLy','_blank','noopener');
    }
  }
  async function openContractFolderOnline(row){
    try{
      const code=String(row?.code||row?.so_hd||'').trim();
      notice('Đang tìm thư mục HĐ online…');
      if(code){
        try{
          const res=await rpc('awm_find_file',[project,code,'folder']);
          const folder=res?.files?.[0];
          if(folder?.webViewLink||folder?.id){
            window.open(folder.webViewLink||`https://drive.google.com/drive/folders/${folder.id}`,'_blank','noopener');
            return;
          }
        }catch(_){}
      }
      const covered=coverOnlineUrl(row?.folder_name||row?.folder_path||row?.full_path||row?.folder||row?.path||'07.01');
      window.open(/^https?:\/\//i.test(covered)?covered:'https://drive.google.com/drive/folders/1vIFykY_-heKaR_JHVAyThd6pcaOSJik2','_blank','noopener');
    }catch(e){
      window.open('https://drive.google.com/drive/folders/1vIFykY_-heKaR_JHVAyThd6pcaOSJik2','_blank','noopener');
    }
  }
  async function openRecordFolder(name,row=null){
    try{
      const target=String(name||row?.folder||row?.path||row?.folder_path||row?.full_path||row?.noi_dung||row?.folder_name||row?.name||row?.code||'').trim();
      if(/^https?:\/\//i.test(target)){
        window.open(target,'_blank','noopener');
        return;
      }
      notice('Đang tìm thư mục trên Google Drive…');
      const cleanName=target.split(/[\\/]/).filter(Boolean).pop()||target;
      const searchCode=(row?.code||cleanName.match(/^\d{6}/)?.[0]||cleanName).trim();
      const covered=coverOnlineUrl(target)||(row?.cap_thu_muc?coverOnlineUrl(row.cap_thu_muc):'')||(tab?coverOnlineUrl(tab):'');
      if(searchCode){
        try{
          const res=await rpc('awm_find_file',[project,searchCode,'folder']);
          const folder=res?.files?.[0];
          if(folder?.webViewLink||folder?.id){
            window.open(folder.webViewLink||`https://drive.google.com/drive/folders/${folder.id}`,'_blank','noopener');
            return;
          }
        }catch(_){}
      }
      if(/^https?:\/\//i.test(covered)){
        window.open(covered,'_blank','noopener');
        return;
      }
      window.open('https://drive.google.com/drive/search?q='+encodeURIComponent(searchCode||cleanName),'_blank','noopener');
    }catch(e){
      const fallbackUrl=coverOnlineUrl(row?.cap_thu_muc||tab||'01. phe duyet');
      if(/^https?:\/\//i.test(fallbackUrl))window.open(fallbackUrl,'_blank','noopener');
      else notice(e.message);
    }
  }
  // ---- Thông báo đẩy Mail (iPhone: cần mở từ biểu tượng ở Màn hình chính, iOS 16.4+) ----
  const pushSupported=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  async function pushState(){if(!pushSupported())return 'unsupported';if(Notification.permission==='denied')return 'denied';try{const reg=await navigator.serviceWorker.getRegistration('/mobile/');const sub=reg&&await reg.pushManager.getSubscription();return sub&&Notification.permission==='granted'?'on':'off'}catch(_){return 'off'}}
  function keyBytes(b64){const s=atob(b64.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((b64.length+3)%4));return Uint8Array.from(s,c=>c.charCodeAt(0));}
  async function enablePush(){
    if(!pushSupported()){notice(/iPhone|iPad/.test(navigator.userAgent)&&!isStandalone()?'Trên iPhone: bấm Chia sẻ → "Thêm vào MH chính", rồi mở BQLDA từ biểu tượng đó để bật thông báo.':'Trình duyệt này chưa hỗ trợ thông báo đẩy.');return}
    try{
      const perm=await Notification.requestPermission();if(perm!=='granted'){notice('Bạn chưa cho phép thông báo. Vào Cài đặt → Thông báo → BQLDA để bật.');return}
      const reg=await navigator.serviceWorker.register('/mobile/sw.js',{scope:'/mobile/'});await navigator.serviceWorker.ready;
      const {publicKey}=await rpc('awm_push_key');
      let sub=await reg.pushManager.getSubscription();
      if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(publicKey)});
      await rpc('awm_push_subscribe',[sub.toJSON(),(navigator.userAgent.match(/iPhone|iPad|Android|Windows|Mac/)||['Thiết bị'])[0]]);
      await rpc('awm_push_test');notice('Đã bật thông báo Mail. Bạn sẽ nhận một thông báo thử.');
      if($('push-mail'))$('push-mail').hidden=true;
    }catch(e){notice('Không bật được thông báo: '+e.message)}
  }
  if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='awm-open'){page='mail';render()}});
  if(location.hash==='#mail')page='mail';
  function openCompose(kind,message){const go=()=>{clearTimeout(timer);window.MailCompose.open({rpc,kind,message,project,me:message?.account||mailAccount})};if(window.MailCompose)return go();const sc=document.createElement('script');sc.src='/js/mail_compose.js?v=2';sc.onload=go;sc.onerror=()=>notice('Không tải được màn hình soạn thư.');document.head.appendChild(sc);}
  async function mail(run){
    $('main').innerHTML='<div class="eyebrow">ÁNH XẠ TỪ AD</div><h1>Mail</h1><div id="mail-state" class="loading">Kiểm tra kết nối…</div><div style="display:flex;gap:8px"><button id="refresh-mail" class="primary">Làm mới ↻</button><button id="new-mail">✉️ Thư mới</button><button id="push-mail" hidden>🔔 Bật thông báo</button></div><div id="mail-list"></div>';
    $('refresh-mail').onclick=()=>render();
    $('push-mail').onclick=enablePush;pushState().then(st=>{if($('push-mail'))$('push-mail').hidden=st==='on'});
    $('new-mail').onclick=()=>openCompose('new',mailAccount?{account:mailAccount,id:'',subject:'',body:''}:null);
    try{
      let status={online:false,source:'',last_sync:null};
      try{ status=await rpc('awm_mail_status'); }catch(_){}
      if(run!==epoch)return;
      $('mail-state').className='message';
      $('mail-state').innerHTML=`<span class="badge ${status.online?'online':'warn'}">${status.online?'AD đang kết nối':'AD chưa kết nối'}</span><p>${status.online?esc(status.source):'Mở AD trên máy tính để tự động đồng bộ hòm thư Outlook.'}</p><div class="muted">${status.last_sync?'Lần đồng bộ: '+esc(new Date(status.last_sync).toLocaleString('vi-VN')):'Chưa có kết nối trực tiếp.'}</div>`;
      
      let items=[];
      if(status.online){
        try{
          let data=await rpc('awm_mail_list',[project,'',mailAccount,mailFolder]);
          const accs=data?.accounts||[];
          if(accs.length&&!accs.some(a=>a.account===mailAccount&&a.folders.some(f=>f.name===mailFolder))){mailAccount=accs[0].account;mailFolder=(accs[0].folders.find(f=>f.name==='Inbox')||accs[0].folders[0]).name;data=await rpc('awm_mail_list',[project,'',mailAccount,mailFolder]);}
          if(run!==epoch)return;
          if(data&&data.items) items=data.items;
          if(accs.length){
            const cur=accs.find(a=>a.account===mailAccount)||accs[0];
            const bar=document.createElement('div');bar.className='mail-accounts';bar.style.cssText='margin:12px 0;display:flex;flex-direction:column;gap:8px';
            bar.innerHTML=`<label style="font-size:12px;font-weight:600">Tài khoản Outlook<select id="mail-account" style="width:100%;margin-top:4px;padding:10px;border-radius:10px;border:1px solid #d6d3c8;background:#fff">${accs.map(a=>`<option value="${esc(a.account)}" ${a.account===mailAccount?'selected':''}>${esc(a.account)}</option>`).join('')}</select></label><div style="display:flex;gap:6px;flex-wrap:wrap">${cur.folders.map(f=>`<button type="button" data-mail-folder="${esc(f.name)}" class="chip" style="padding:6px 12px;border-radius:16px;border:1px solid #c9d3cf;font-size:12px;${f.name===mailFolder?'background:#1d2f2c;color:#fff;':'background:#fff;color:#1d2f2c;'}">${f.name==='Inbox'?'📥 Hộp thư đến':f.name==='Sent Items'?'📤 Đã gửi':esc(f.name)} · ${f.count}</button>`).join('')}</div>`;
            $('mail-list').before(bar);
            $('mail-account').onchange=e=>{mailAccount=e.target.value;mailFolder='Inbox';render();};
            bar.querySelectorAll('[data-mail-folder]').forEach(b=>b.onclick=()=>{mailFolder=b.dataset.mailFolder;render();});
          }
        }catch(_){}
      }
      
      if(!items.length){
        try{
          const shareData=await rpc('mailshare_list',[project]);
          if(Array.isArray(shareData?.items)&&shareData.items.length){
            items=shareData.items.map(m=>({id:m.id,sender:m.sender||'Cán bộ dự án',subject:m.subject||'Thư được chia sẻ',date:m.date||m.created_at||'',body:m.body||'',attachments:m.attachments||[],project:m.project||project}));
            $('mail-state').innerHTML+=`<div style="margin-top:6px;font-size:12px;color:#182b29;font-weight:600;">📬 Hiển thị ${items.length} thư được chia sẻ trong dự án</div>`;
          }
        }catch(_){}
      }
      
      if(run!==epoch)return;
      $('mail-list').innerHTML=items.length?items.map((r,i)=>`<button class="card" data-mail="${i}"><span class="code">${esc(r.sender)}</span><h3>${esc(r.subject)}</h3><div class="muted">${esc(fmtMailDate(r.date))}${r.attachments&&r.attachments.length?' · 📎 '+r.attachments.length+' tệp':''}</div></button>`).join(''):'<div class="empty">Chưa có thư thuộc dự án này. Mở AD trên máy tính để đồng bộ hòm thư Outlook.</div>';
      
      document.querySelectorAll('[data-mail]').forEach(b=>b.onclick=()=>{
        const r=items[Number(b.dataset.mail)];
        if(!r)return;
        const attHtml=(r.attachments&&r.attachments.length)?`<div style="margin:10px 0;padding:8px 12px;background:#f6f8f5;border-radius:8px;font-size:12px;color:#b45309;"><span style="font-weight:700;">📎 ${r.attachments.length} tệp đính kèm:</span><br>${esc(r.attachments.join(', '))}</div>`:'';
        sheet(`<div class="eyebrow">${esc(r.sender)}</div><h2>${esc(r.subject)}</h2><p class="muted">${esc(fmtMailDate(r.date))}${r.project?' · 🏢 '+esc(r.project):''}</p>${status.online&&r.account?`<div class="actions" style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0"><button class="primary" data-compose="reply">↩ Trả lời</button><button data-compose="reply_all">↩↩ Tất cả</button><button data-compose="forward">↪ Chuyển tiếp</button></div>`:''}${attHtml}<div class="detail-value">${esc(r.body)}</div>`);
        document.querySelectorAll('[data-compose]').forEach(x=>x.onclick=()=>{const kind=x.dataset.compose;$('sheet').close();openCompose(kind,{...r,date:fmtMailDate(r.date)});});
      });
      
      timer=setTimeout(()=>{if(page==='mail'&&run===epoch){$('sheet').close();render()}},30000);
    }catch(e){
      if(run===epoch)$('mail-state').innerHTML=error(e);
    }
  }
 async function files(run){
  $('main').innerHTML='<div class="eyebrow">KHO HỒ SƠ DỰ ÁN</div><h1>Quản lý hồ sơ</h1><div class="chips">'+bootstrap.menus.map(m=>`<button data-menu="${m.id}" class="${menu===m.id?'active':''}">${esc(m.name)}</button>`).join('')+'</div>'+(bootstrap.files?.can_configure?'<div style="margin:4px 0 6px 0;"><button id="configure" class="text-button" style="font-size:12px;">⚙️ Đặt thư mục dự án</button></div>':'')+'<div id="crumb" class="breadcrumb"></div><div class="drive-toolbar"><label class="search" style="margin:0;flex:1;min-width:0;display:flex;align-items:center;background:#fff;border:1px solid #ced9c6;border-radius:8px;padding:0 10px;height:38px;"><span style="color:#718477;font-size:14px;margin-right:6px;">⌕</span><input id="drive-search" type="search" placeholder="Tìm kiếm tệp, thư mục…" value="'+esc(driveSearch)+'" style="border:none;outline:none;background:transparent;width:100%;font-size:13px;padding:6px 0;margin:0;"></label><div class="sort-grp"><button id="sort-za" class="sort-btn '+(driveSort==='za'?'active':'')+'">ZA</button><button id="sort-az" class="sort-btn '+(driveSort==='az'?'active':'')+'">AZ</button></div><button id="drive-refresh" class="icon-btn" title="Làm mới" style="border:1px solid #ced9c6;background:#fff;border-radius:8px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:15px;color:#3c5b52;flex-shrink:0;">↻</button></div><div id="drive-list" aria-live="polite"></div><button id="drive-more" hidden class="primary">Tải thêm</button>';
  document.querySelectorAll('[data-menu]').forEach(b=>b.onclick=()=>{menu=b.dataset.menu;trail=[];driveSearch='';render()});
  if($('configure'))$('configure').onclick=configure;
  if($('drive-refresh'))$('drive-refresh').onclick=()=>loadDrive(false);
  if($('drive-more'))$('drive-more').onclick=()=>loadDrive(true);
  bindDriveToolbar();
  try{folders=await rpc('awm_folders',[project]);if(run!==epoch)return;if(!menu){$('drive-list').innerHTML='<div class="message">Chưa có menu được cấp quyền.</div>';return}const configured=folders[menu];if(!configured){$('drive-list').innerHTML='<div class="message"><b>Chưa có nguồn Drive được ánh xạ cho dự án này.</b><br>Ánh xạ được lưu riêng theo dự án. Người có quyền quản lý QL File hãy chọn nguồn online trong AwD hoặc bấm “Đặt thư mục dự án” tại đây.</div>';return}const folderUrl=configured.url||(configured.id?`https://drive.google.com/drive/folders/${encodeURIComponent(configured.id)}`:'https://drive.google.com/drive/');if(!trail.length)trail=[{id:configured.id,name:bootstrap.menus.find(m=>m.id===menu)?.name||menu,url:folderUrl,path:configured.path||'',subs:configured.subs||[]}];await loadDrive(false)}catch(e){if(run===epoch)$('drive-list').innerHTML=error(e)}
 }
 function configure(){if(!menu)return notice('Chưa được cấp menu QL.');sheet(`<h2>Thư mục dùng chung của dự án</h2><p class="muted">${esc(project)} / ${esc(menu)}</p><form id="folder-form" class="form"><label>URL hoặc ID thư mục Google Drive<input id="folder-id" required value="${esc(folders[menu]?.id||'')}" placeholder="https://drive.google.com/drive/folders/…"></label><button class="primary">Lưu cho dự án</button></form><p class="muted">Mọi tài khoản được cấp dự án đều dùng địa chỉ này. Google vẫn kiểm tra quyền đọc tệp theo tài khoản Google của từng người.</p>`);$('folder-form').onsubmit=async e=>{e.preventDefault();let id=$('folder-id').value.trim();id=driveId(id)||id;try{await rpc('awm_save_folder',[project,menu,id]);$('sheet').close();trail=[];render()}catch(e){notice(e.message)}}}
 function coverOnlineUrl(rawUrl){
    rawUrl = String(rawUrl||'').trim();
    if(/^https?:\/\//i.test(rawUrl)) return rawUrl;
    const norm = rawUrl.toLowerCase().replace(/\\/g, '/');
    if(norm.includes('theo doi 06,07,08') || norm.includes('.xlsm') || norm.includes('theo doi tong') || norm.includes('theo doi tổng')) return 'https://docs.google.com/spreadsheets/d/1IRiE_8hau2hJgwPF3xcuaVC2Ih3mfNnX/edit';
    if(norm==='chu-truong' || norm.includes('chu-truong') || norm.includes('chủ trương') || norm.includes('01. chi dao') || norm.includes('01.01') || (norm.includes('01. phe duyet') && norm.includes('chi dao'))) return 'https://drive.google.com/drive/folders/1n_5RbTM34UOlLPRaB-WE3kVjx9UiS7Sh';
    if(norm==='progress' || norm.includes('tiến độ') || norm.includes('01. phe duyet/02') || norm.includes('01.02') || (norm.includes('01. phe duyet') && norm.includes('tien do'))) return 'https://drive.google.com/drive/folders/1X6TsO1_iSPAJvMWNsIWS20gZusVQJJpv';
    if(norm.includes('03. yc ky thuat') || norm.includes('01.03') || norm.includes('yc kt') || norm.includes('yc ky thuat')) return 'https://drive.google.com/drive/folders/11Hrfa0ofMUME62ZF7wlbzxZ11C3aGGBH';
    if(norm==='bvtk' || norm.includes('bản vẽ') || norm.includes('04. bvtk') || norm.includes('01.04') || norm.includes('ban ve thiet ke')) return 'https://drive.google.com/drive/folders/1_ulRVF99yuc3e7r1ek5hi2sn2Y7pIqG7';
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
   $('main').innerHTML=`<div class="eyebrow">ÁNH XẠ TỪ DESKTOP & GOOGLE DRIVE</div><div class="page-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px;"><div style="display:flex;align-items:center;gap:8px;"><button id="link-back" class="text-button" style="padding:4px 8px;font-size:14px;font-weight:600;">← Cài đặt</button><h1 style="margin:0;font-size:20px;">Quản lý Link</h1></div><div style="display:flex;gap:6px;"><button id="link-project" class="text-button">Đổi dự án</button><button id="link-drive" class="text-button">Nguồn Drive</button><button id="link-add" class="primary">+ Thêm link</button></div></div><div class="chips"><button data-scope="project" class="${linkScope==='project'?'active':''}">Dự án: ${esc(project)}</button><button data-scope="__common__" class="${linkScope==='__common__'?'active':''}">Dùng chung hệ thống</button></div><label class="search">⌕<input id="link-search" placeholder="Tìm tên liên kết, URL, phân loại…" value="${esc(linkSearch)}"></label><div class="sectionhead"><span id="link-count" class="muted">Đang tải liên kết…</span><button id="link-refresh">Làm mới ↻</button></div><div id="link-list" aria-live="polite"></div>`;
   bindLinkDriveControls();$('link-back').onclick=()=>{closeSheet();$('settings').click();};
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
   $('close-desk-sheet').onclick=()=>closeSheet();
  }
  function linkModal(item=null){
  const targetOptions=[...(bootstrap?.menus||[]).map(m=>({id:m.id,label:`QL · ${m.name}`})),...(bootstrap?.groups||[]).map(g=>({id:g.id,label:`Theo dõi · ${g.name}`})),{id:'home',label:'Home'},{id:'mail',label:'Mail'},{id:'todo',label:'To do'}];const targetMarkup=targetOptions.map(t=>`<option value="${esc(t.id)}" ${item?.target===t.id?'selected':''}>${esc(t.label)}</option>`).join('');
  const editing=!!item;
  sheet(`<div class="eyebrow">${linkScope==='__common__'?'LIÊN KẾT DÙNG CHUNG':('DỰ ÁN: '+esc(project))}</div><h2>${editing?'Cập nhật liên kết':'Thêm liên kết mới'}</h2><form id="link-form" class="form"><label>Vị trí trên AwM / AwD<select id="lf-target">${targetMarkup}</select></label><label>Đường dẫn / URL / Link Drive<input id="lf-url" required value="${esc(item?.url||'')}" placeholder="https://drive.google.com/… hoặc https://…"></label><button type="button" class="text-button" id="lf-drive-tree">📁 Chọn thư mục từ Drive</button><button class="primary">${editing?'Lưu thay đổi':'Thêm liên kết'}</button></form>${editing?'<div class="actions" style="margin-top:12px;"><button id="lf-delete" class="danger">Xóa liên kết này</button></div>':''}`);
  $('link-form').onsubmit=async e=>{
    e.preventDefault();const name=$('lf-name').value.trim(),url=$('lf-url').value.trim(),category=$('lf-cat').value,notes=$('lf-notes').value.trim();
    if(!name||!url)return notice('Vui lòng nhập Tên và URL.');
    try{
      const scope=linkScope==='__common__'?'__common__':project;
      const payload={...(item||{}),id:item?.id||'',name,url,category,notes};
      await rpc('save_managed_link',[payload,scope]);closeSheet();notice('Đã lưu liên kết thành công!');await loadLinksList(epoch);
    }catch(err){notice('Lỗi lưu liên kết: '+err.message)}
  };
  if(editing){
    $('lf-delete').onclick=async()=>{
      if(!confirm(`Bạn có chắc muốn xóa liên kết "${item.name}"?`))return;
      try{const scope=linkScope==='__common__'?'__common__':project;await rpc('delete_managed_link',[item.id,scope]);closeSheet();notice('Đã xóa liên kết!');await loadLinksList(epoch);}catch(err){notice('Lỗi xóa liên kết: '+err.message)}
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
      sheet(`<div class="page-title"><button id="rbac-back" class="back-button">← Cài đặt</button><div class="eyebrow">QUẢN TRỊ HỆ THỐNG</div></div><h2>Phân quyền RBAC</h2><p class="muted">Quyền thay đổi tại đây được dùng ngay cho AwD và AwM.</p><label class="rbac-role">Vai trò<select id="rbac-role">${rbacRoles.map(name=>`<option ${name===role?'selected':''}>${esc(name)}</option>`).join('')}</select></label><div class="rbac-groups">${groupMarkup}</div><button id="rbac-save" class="primary">Lưu phân quyền</button>`);
      bindSettingsControls();$('rbac-role').onchange=e=>{role=e.target.value;render()};
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
          notice('Đã lưu phân quyền cho AwD và AwM.');closeSheet();await boot();
        }catch(e){
          notice(e.message);$('rbac-save').disabled=false;$('rbac-save').textContent='Lưu phân quyền';
        }
      };
    };
    render();
  }).catch(e=>notice(e.message));
}
 function bindDriveToolbar(){
  const s=$('drive-search');
  if(s)s.oninput=e=>{driveSearch=e.target.value;renderDriveItems();};
  const za=$('sort-za'),az=$('sort-az');
  if(za)za.onclick=()=>{driveSort='za';updateSortButtons();renderDriveItems();};
  if(az)az.onclick=()=>{driveSort='az';updateSortButtons();renderDriveItems();};
 }
 function updateSortButtons(){
  const za=$('sort-za'),az=$('sort-az');
  if(za){
    za.style.background=driveSort==='za'?'#182b29':'transparent';
    za.style.color=driveSort==='za'?'#fff':'#3c5b52';
    za.classList.toggle('active',driveSort==='za');
  }
  if(az){
    az.style.background=driveSort==='az'?'#182b29':'transparent';
    az.style.color=driveSort==='az'?'#fff':'#3c5b52';
    az.classList.toggle('active',driveSort==='az');
  }
 }
 function renderCrumb(){
  const crumbEl=$('crumb');
  if(!crumbEl)return;
  crumbEl.innerHTML=trail.map((t,i)=>{
    const isLast=(i===trail.length-1);
    return `<button class="crumb-btn ${isLast?'active':''}" data-crumb="${i}" title="${esc(t.name)}">${esc(t.name)}</button>`;
  }).join('<span class="crumb-sep"> \\ </span>');
  document.querySelectorAll('[data-crumb]').forEach(b=>b.onclick=()=>{
    trail=trail.slice(0,Number(b.dataset.crumb)+1);
    driveSearch='';
    if($('drive-search'))$('drive-search').value='';
    loadDrive(false);
  });
  crumbEl.scrollLeft=crumbEl.scrollWidth;
 }
 function renderDriveItems(){
  const listEl=$('drive-list');
  if(!listEl)return;
  let items=[...driveFiles];
  if(driveSearch.trim()){
    const q=driveSearch.trim().toLowerCase();
    items=items.filter(f=>String(f.name||'').toLowerCase().includes(q));
  }
  items.sort((a,b)=>{
    const isFolderA=a.mimeType==='application/vnd.google-apps.folder';
    const isFolderB=b.mimeType==='application/vnd.google-apps.folder';
    if(isFolderA!==isFolderB)return isFolderA?-1:1;
    const cmp=String(a.name||'').localeCompare(String(b.name||''),'vi',{numeric:true,sensitivity:'base'});
    return driveSort==='za'?-cmp:cmp;
  });
  if(items.length){
    listEl.innerHTML=items.map((f,i)=>{
      const isFolder=f.mimeType==='application/vnd.google-apps.folder';
      const isSheet=f.mimeType==='application/vnd.google-apps.spreadsheet'||/\.(xlsx|xls)$/i.test(f.name);
      const isPdf=f.mimeType==='application/pdf'||/\.pdf$/i.test(f.name);
      const isCad=f.mimeType?.includes('dwg')||f.mimeType?.includes('dxf')||/\.(dwg|dxf)$/i.test(f.name);
      const icon=isFolder?'📁':isSheet?'📊':isPdf?'📑':isCad?'📐':'📄';
      return `<div class="card file-card" style="display:flex;align-items:center;justify-content:space-between;gap:8px;"><button class="text-button" data-file-open="${i}" style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;text-align:left;padding:0;background:none;border:none;cursor:pointer;"><b style="font-size:18px;">${icon}</b><div style="min-width:0;"><h3 style="margin:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(f.name)}</h3><span class="muted" style="font-size:11px;">${isFolder?'Thư mục con':(f.size?Math.ceil(Number(f.size)/1024)+' KB':'Tài liệu')}</span></div></button><a class="primary text-button" style="padding:6px 10px;font-size:13px;font-weight:600;white-space:nowrap;text-decoration:none;" href="${esc(f.webViewLink||`https://drive.google.com/file/d/${f.id}/view`)}" target="_blank" rel="noopener">Mở ↗</a></div>`;
    }).join('');
    document.querySelectorAll('[data-file-open]').forEach(b=>{
      b.onclick=async()=>{
        const f=items[Number(b.dataset.fileOpen)];
        if(f.mimeType==='application/vnd.google-apps.folder'){
          trail.push({id:f.id,name:f.name,url:f.webViewLink||`https://drive.google.com/drive/folders/${f.id}`});
          driveSearch='';
          if($('drive-search'))$('drive-search').value='';
          loadDrive(false);
        }else{
          if(window.AwmViewer?.openOnline){
            AwmViewer.openOnline({id:f.id,url:f.webViewLink,name:f.name,mime:f.mimeType});
          }else{
            window.open(f.webViewLink||`https://drive.google.com/file/d/${f.id}/view`,'_blank','noopener');
          }
        }
      };
    });
  }else{
    listEl.innerHTML=driveSearch.trim()
      ? `<div class="empty">Không tìm thấy tệp hoặc thư mục nào khớp với “${esc(driveSearch)}”.</div>`
      : '<div class="empty">Thư mục trống.</div>';
  }
 }
 function renderDriveFallback(curFolder,folderUrl){
  const subs=(curFolder?.subs||[]).filter(s=>s.id!==curFolder.id);
  const headerCard=`<div class="card" style="margin-bottom:12px;background:#f6f8f5;border:1px solid #d4ded0;"><div class="top"><span class="code">Google Drive Online</span><span class="badge online">Ánh xạ từ AD</span></div><h3 style="margin:4px 0 6px 0;">${esc(curFolder.name)}</h3>${curFolder.path?`<div class="muted" style="font-size:12px;margin-bottom:8px;">📁 AD: ${esc(curFolder.path)}</div>`:''}<a class="primary button" style="display:inline-block;padding:10px 16px;text-align:center;text-decoration:none;color:#fff;background:#182b29;border-radius:8px;font-weight:600;font-size:14px;" href="${esc(folderUrl)}" target="_blank" rel="noopener">Mở thư mục trên Google Drive ↗</a></div>`;
  if(subs.length){
    let items=[...subs];
    if(driveSearch.trim()){
      const q=driveSearch.trim().toLowerCase();
      items=items.filter(s=>String(s.name||'').toLowerCase().includes(q));
    }
    items.sort((a,b)=>{
      const cmp=String(a.name||'').localeCompare(String(b.name||''),'vi',{numeric:true,sensitivity:'base'});
      return driveSort==='za'?-cmp:cmp;
    });
    const subCards=items.map((sub,idx)=>`<div class="card file-card" style="display:flex;align-items:center;justify-content:space-between;gap:8px;"><button class="text-button" data-drive-sub-idx="${idx}" style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;text-align:left;padding:0;background:none;border:none;cursor:pointer;"><b style="font-size:18px;">📁</b><div style="min-width:0;"><h3 style="margin:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(sub.name)}</h3><span class="muted" style="font-size:11px;">Thư mục con Google Drive</span></div></button><a class="primary text-button" style="padding:6px 10px;font-size:13px;font-weight:600;white-space:nowrap;text-decoration:none;" href="${esc(sub.url||`https://drive.google.com/drive/folders/${sub.id}`)}" target="_blank" rel="noopener">Mở ↗</a></div>`).join('');
    $('drive-list').innerHTML=headerCard+`<div class="sectionhead"><span class="muted">${items.length} thư mục nhánh</span></div>`+(items.length?subCards:'<div class="empty">Không có thư mục phù hợp.</div>');
    $('drive-list').querySelectorAll('[data-drive-sub-idx]').forEach(btn=>{
      btn.onclick=()=>{
        const sub=items[Number(btn.dataset.driveSubIdx)];
        if(!sub)return;
        trail.push({id:sub.id,name:sub.name,url:sub.url||`https://drive.google.com/drive/folders/${sub.id}`,subs:sub.subs||[]});
        driveSearch='';
        if($('drive-search'))$('drive-search').value='';
        loadDrive(false);
      };
    });
  }else{
    $('drive-list').innerHTML=headerCard+'<div class="message" style="margin-top:8px;">Nhấn nút “Mở thư mục trên Google Drive ↗” để xem và duyệt các tệp trực tiếp trong ứng dụng Google Drive hoặc trình duyệt di động.</div>';
  }
 }
 async function loadDrive(append){
  const run=++epoch;if(!trail.length)return;
  const curFolder=trail.at(-1);
  const folderUrl=curFolder?.url||(curFolder?.id?`https://drive.google.com/drive/folders/${encodeURIComponent(curFolder.id)}`:'https://drive.google.com/drive/');
  $('drive-more').disabled=true;
  if(!append){driveFiles=[];$('drive-list').innerHTML='<div class="loading">Đang tải dữ liệu từ Google Drive…</div>'}
  try{
    const res=await rpc('awm_drive_list',[project,curFolder.id,append?driveNext:'']);
    if(run!==epoch)return;
    const items=res?.files||[];
    driveFiles=append?[...driveFiles,...items]:items;
    driveNext=res?.nextPageToken||'';
    renderCrumb();
    renderDriveItems();
    $('drive-more').hidden=!driveNext;
  }catch(err){
    if(run!==epoch)return;
    renderCrumb();
    renderDriveFallback(curFolder,folderUrl);
    $('drive-more').hidden=true;
  }finally{
    if(run===epoch)$('drive-more').disabled=false;
  }
 }
 async function openFile(file){const run=epoch;notice('Đang tải tài liệu…');const blob=await AwmDrive.serverBlob(file,project);if(run!==epoch||!bootstrap)return;let name=file.name;if(file.mimeType==='application/vnd.google-apps.spreadsheet')name+='.xlsx';else if(file.mimeType.startsWith('application/vnd.google-apps.'))name+='.pdf';await AwmViewer.open(blob,name,file.mimeType)}
 $('close').onclick=()=>closeSheet();
 $('project').onchange=e=>selectProject(e.target.value);
 if($('project-modal'))$('project-modal').addEventListener('click',e=>{if(e.target===$('project-modal')&&isOutsideSheet(e))closeProjectModal()});
 if($('project-modal-close'))$('project-modal-close').onclick=()=>closeProjectModal();
 if($('project-btn'))$('project-btn').onclick=()=>openProjectModal();
 const pBarEl=document.querySelector('.projectbar');
 if(pBarEl){pBarEl.onclick=e=>{if(e.target.closest('#project-btn')||e.target===pBarEl||e.target.classList.contains('live')||e.target.id==='project-display'){openProjectModal()}};}
 if($('project-search-input')){
  $('project-search-input').oninput=e=>{const val=e.target.value;if($('project-search-clear'))$('project-search-clear').hidden=!val;renderProjectSuggestions(val)};
  $('project-search-input').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();const firstBtn=$('project-suggestions')?.querySelector('[data-project-pick]');if(firstBtn)firstBtn.click()}};
 }
 if($('project-search-clear'))$('project-search-clear').onclick=()=>{if($('project-search-input')){$('project-search-input').value='';$('project-search-clear').hidden=true;$('project-search-input').focus();renderProjectSuggestions('')}};
  $('settings').onclick=()=>{if(!bootstrap)return;const admin=String(bootstrap.user.role||'').trim().toLowerCase()==='admin',canManage=admin||!!bootstrap.files?.can_configure,canSeeFiles=admin||allowed('files');sheet(`<h2>Cài đặt</h2><section class="settings-account"><h3>Thông tin tài khoản</h3><dl><dt>Tài khoản đăng nhập</dt><dd>${esc(bootstrap.user.username||bootstrap.user.email)}</dd><dt>Email Google</dt><dd>${esc(bootstrap.user.email||'Chưa liên kết')}</dd><dt>Vai trò</dt><dd>${esc(bootstrap.user.role)}</dd></dl><div class="actions"><button id="refresh-access">Cập nhật quyền</button><button id="logout">Đăng xuất</button></div></section>${admin?`<section class="admin-panel"><h3>Quản trị hệ thống</h3><p class="muted">Các chức năng quản trị AwM theo cùng thứ tự với AwD.</p><button class="card" id="appearance-management">🎨 Tùy biến Tab & Màu sắc →</button><button class="card" id="project-management">🏢 QL HM/CT →</button><button class="card" id="account-management">👥 QL ACC (Tài khoản) →</button><button class="card" id="rbac-management">🛡️ Phân quyền (RBAC) →</button><button class="card" id="settings-links">🔗 Quản lý Link & Google Drive →</button></section>`:''}${canSeeFiles?`<section class="admin-panel"><h3>${canManage?'Quản lý':'Xem'} nguồn Drive dự án</h3><p class="muted">${canManage?'Đặt và kiểm tra thư mục dùng chung cho các menu QL File.':'Xem các nguồn Drive đã được ánh xạ cho dự án.'}</p><button class="card" id="drive-management">${canManage?'Quản lý':'Xem'} thư mục dự án →</button></section>`:''}`);$('refresh-access').onclick=()=>{closeSheet();boot()};bindSettingsControls();if($('drive-management'))$('drive-management').onclick=()=>{closeSheet();page='files';render()};if($('rbac-management'))$('rbac-management').onclick=rbacScreen;if($('settings-links'))$('settings-links').onclick=()=>{closeSheet();page='links';render()};$('logout').onclick=async()=>{const token=sessionStorage.getItem(TOKEN);sessionStorage.removeItem(TOKEN);auth();try{await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({method:'logout_user',args:[]})})}catch{}}};
 // Going to another phone app must not throw away the current document or
 // detail sheet.  iOS/Android commonly fire visibilitychange for a brief
 // app switch; retaining the DOM keeps the user on the exact contract and
 // scroll position when they return.  A fresh bootstrap still runs only on
 // an explicit reload, login, project change, or access refresh.
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer)});
 window.AwmLive = { openNamedFile, openFile, rpc, getProject: () => project, getPage: () => page, setPage: (p) => { page = p; }, allowed, render, notice, selectProject, openProjectModal, closeProjectModal, renderProjectSuggestions, removeVietnameseTones, highlightMatch, updateProjectDisplay };
 if(sessionStorage.getItem(TOKEN))boot();else auth();
})();


















