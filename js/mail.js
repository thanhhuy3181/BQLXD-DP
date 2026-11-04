'use strict';
// Web Mail has one authenticated source: the paired AD bridge.
// Giao diện giống tab Mail của AD (Outlook Classic): Favorites + cây thư mục theo tài khoản,
// danh sách thư dạng cột, khung đọc thư và panel "Lọc Thư / Categories".
const MailModule=(()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 // 43 danh mục BQLXD, cùng mã/nhãn/màu với OFFICE_CATEGORIES của AD (outlook_mail_tab.py).
 const OFFICE_CATEGORIES=[['all','All','#0078D4'],['none','No Categories','#8A8886'],['01.01','01.01. PD Chu truong','#D13438'],['01.02','01.02. PD Tien do','#EA4300'],['01.03','01.03. PD QC TC KT','#FF8C00'],['01.04','01.04. PD Thiet ke','#FCE100'],['02','02. Phap ly','#107C41'],['03','03. Cam nang','#008272'],['04','04. Chuan hoa','#0078D4'],['05','05. Thiet ke','#4F6BED'],['06','06. HSMT','#8764B8'],['07','07. Hop dong','#881798'],['07.01','07.01. HD Phap ly','#B4009E'],['07.02','07.02. HD dang thuong thao','#E3008C'],['07.03','07.03. Don gia khung','#004E8C'],['08.01','08.01. TU_TT','#0099BC'],['08.02','08.02. QT','#038387'],['08.03','08.03. Du chi','#498205'],['09.01','09.01. Ke hoach','#107C41'],['09.02','09.02. KH phap ly','#27AE60'],['09.03','09.03. Tien do','#F39C12'],['09.04','09.04. Ngan sach','#D35400'],['09.05','09.05. Dinh bien','#C0392B'],['10','10. Bao cao','#2980B9'],['10.01','10.01. Thong bao Hop','#8E44AD'],['11','11. GPMB','#2C3E50'],['12.01','12.01. ATLD_VSMT','#E74C3C'],['12.02','12.02. Video','#3498DB'],['12.03','12.03. Chat luong Thi nghiem','#1ABC9C'],['12.04','12.04. Khoi luong','#16A085'],['12.05','12.05. Giam sat ton tai','#E67E22'],['12.06','12.06. Xu ly vi pham_CV phat','#C0392B'],['12.07','12.07. Camera','#7F8C8D'],['12.08','12.08. KSVR','#BDC3C7'],['13','13. Thi cong','#34495E'],['13.01','13.01. Chi thi','#E74C3C'],['13.02','13.02. Kick off_Dau moi lien he','#9B59B6'],['13.03','13.03. KHO','#3498DB'],['13.04','13.04. Vat tu','#1ABC9C'],['13.05','13.05. May moc','#F1C40F'],['13.06','13.06. VLDV','#E67E22'],['13.07','13.07. Dieu chuyen vt','#D35400']];
 // Luật khớp danh mục giống match_category_filter của AD (tiêu đề + 800 ký tự đầu nội dung).
 const OC_RULES=[[['01.01'],['chủ trương','pd chu truong','phê duyệt chủ trương']],[['01.02','09.03'],['tiến độ','tien do','schedule']],[['01.03','12.03'],['qc','tc kt','thí nghiệm','chất lượng','tc&kt']],[['01.04','05'],['thiết kế','thiet ke','bvtk','bản vẽ','design']],[['02','07.01','09.02'],['pháp lý','phap ly','legal']],[['03','04'],['cẩm nang','chuẩn hóa','quy chuẩn','hướng dẫn']],[['06'],['hsmt','mời thầu','e-hsmt','dự thầu','thầu']],[['07','07.02','07.03'],['hợp đồng','hop dong','thương thảo','đơn giá khung','phụ lục']],[['08.01','08.02','08.03'],['tư_tt','tạm ứng','thanh toán','quyết toán','dự chi','tu_tt']],[['09.01','09.04','09.05'],['kế hoạch','ngân sách','định biên','dự toán']],[['10','10.01'],['báo cáo','thông báo họp','biên bản họp','cuộc họp']],[['11'],['gpmb','giải phóng mặt bằng']],[['12.01','12.02','12.04','12.05','12.06','12.07','12.08'],['an toàn','atlđ','vsmt','khối lượng','tồn tại','vi phạm','camera','ksvr']],[['13','13.01','13.02','13.03','13.04','13.05','13.06','13.07'],['thi công','chỉ thị','kick off','kho','vật tư','máy móc','điều chuyển']]];
 const OC_NONE=['hsmt','thầu','hợp đồng','hđ','thanh toán','tạm ứng','thiết kế','bvtk','chủ trương'];
 // Phân loại nghiệp vụ giống classify_email của AD (cột Categories).
 const BUSINESS_KW=[['hsmt',['hsmt','hồ sơ mời thầu','mời thầu','thầu','dự thầu','e-hsmt']],['contract',['hợp đồng','hđ','plhd','phụ lục','ký kết']],['payment',['thanh toán','tạm ứng','quyết toán','đề nghị thanh toán','ccm','chi trả']],['bvtk',['bvtk','bản vẽ','thiết kế','kiến trúc','kết cấu','mep']],['chu-truong',['chủ trương','phê duyệt','quyết định','tờ trình']]];
 const BUSINESS={hsmt:['HSMT','#b9a2f5'],contract:['Hợp đồng','#e29ff0'],payment:['TƯ, TT','#5fd0e8'],bvtk:['BVTK','#9fb0ff'],'chu-truong':['Chủ trương','#ff9b8f'],other:['Chung','#908caa']};
 const CAT_NAMES={hsmt:'Hồ sơ mời thầu',contract:'Hợp đồng kinh tế',payment:'Tạm ứng, TT',bvtk:'Bản vẽ thiết kế','chu-truong':'Chủ trương'};
 const AVATAR=['#F2C0C8','#9ccfd8','#c4a7e7','#f6c177','#a6e3a1','#ebbcba','#89b4fa'];
 const LOADING_TEXT='Đang tải nội dung từ AD…';
 let messages=[],accounts=[],account='',folder='',category='all',officeCat='all',readFilter='all',query='',queryRaw='',activeId='',project='',timer,epoch=0,lastSync='',loading=false,queued=false;
 let sortCol='received',sortDesc=true,limit=100,mode='folder',criteria=null,visibleIds=[],bound=false,selTimer=0,filterVisible=true,detailState='empty',shownKey='',pendingBody='',listSig='';
 const uncheckedAccounts=new Set(),collapsedAccounts=new Set(),bodyCache=new Map();
 const $=id=>document.getElementById(id);
 const all=sel=>typeof document.querySelectorAll==='function'?[...document.querySelectorAll(sel)]:[];
 const toggleClass=(el,cls,on)=>{if(el&&el.classList&&typeof el.classList.toggle==='function')el.classList.toggle(cls,!!on);};
 const store={get(k){try{return typeof localStorage!=='undefined'?localStorage.getItem(k):null;}catch(_){return null;}},set(k,v){try{if(typeof localStorage!=='undefined')localStorage.setItem(k,String(v));}catch(_){}}};
 const notify=(value,type='info')=>{if(typeof toast==='function')toast(value,type);};
 const fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d');
 const has=(txt,list)=>list.some(k=>txt.includes(k));
 const pad=n=>String(n).padStart(2,'0');
 const peopleText=list=>(list||[]).map(p=>(p?.name||'')+' '+(p?.email||'')).join(' ');
 const cssId=id=>typeof CSS!=='undefined'&&CSS.escape?CSS.escape(id):String(id).replace(/["\\]/g,'\\$&');
 async function rpc(method,...args){const result=await API.call(method,...args);if(result?.ok!==true)throw new Error(result?.error||'Máy chủ chưa xác nhận yêu cầu.');return result.data;}
 function classify(message){const txt=(message.subject+' '+message.body.slice(0,600)).normalize('NFC').toLowerCase();for(const [key,words] of BUSINESS_KW)if(has(txt,words))return key;return 'other';}
 function matchOffice(key,m){if(key==='all')return true;const txt=m.ocText;if(key==='none')return !has(txt,OC_NONE);const rule=OC_RULES.find(r=>r[0].includes(key));return rule?has(txt,rule[1]):txt.includes(key.toLowerCase().replace(/\./g,''));}
 function fmtDate(v){const d=new Date(v);if(!v||isNaN(d))return String(v||'');return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;}
 function normalize(message){
  const id=String(message.id),d=new Date(message.date);
  const m={...message,id,subject:String(message.subject||''),body:String(message.body||bodyCache.get(id)||''),sender:String(message.sender||''),email:String(message.email||''),account:String(message.account||''),folder:String(message.folder||''),unread:message.unread===true,attachments:Array.isArray(message.attachments)?message.attachments.map(String):[],to:Array.isArray(message.to)?message.to:[],cc:Array.isArray(message.cc)?message.cc:[]};
  m.ts=message.date&&!isNaN(d)?d.getTime():0;m.date=fmtDate(message.date);m.category=classify(m);m.categoryLabel=BUSINESS[m.category][0];m.ocText=(m.subject+' '+m.body.slice(0,800)).normalize('NFC').toLowerCase();
  return m;
 }
 const searchText=m=>m._s||(m._s=fold([m.subject,m.sender,m.email,m.body.slice(0,20000)].join(' ')));
 function currentFolderInfo(){const a=accounts.find(x=>x.account===account);return a?a.folders.find(f=>f.name===folder)||null:null;}
 // ---- Cột trái: Favorites + cây thư mục ----
 const folderIcon=name=>({'Inbox':'📥','Sent Items':'📤','Drafts':'📝','Deleted Items':'🗑','Junk Email':'🚫','Archive':'🗄','Outbox':'📮'}[name]||'📁');
 function folderNode(acc,f,cls){const on=mode==='folder'&&acc===account&&f.name===folder;return `<button type="button" class="mail-node ${cls}${on?' active':''}" data-acc="${esc(acc)}" data-folder="${esc(f.name)}" title="${esc(acc+' › '+f.name+' · '+f.count+' thư'+(f.unread?', '+f.unread+' chưa đọc':''))}"><span>${folderIcon(f.name)}</span><span class="mail-node-name">${esc(f.name)}</span>${f.unread?`<span class="mail-unread">${f.unread}</span>`:`<span class="mail-total">${f.count}</span>`}</button>`;}
 function renderTree(){
  const fav=$('mail-favorites'),host=$('mail-account-tree');
  if(fav){const a=accounts[0],favs=a?a.folders.filter(f=>f.name==='Inbox'||f.name==='Sent Items'):[];fav.innerHTML=favs.length?favs.map(f=>folderNode(a.account,f,'is-fav')).join(''):'<p class="px-3 py-1 text-[11px] text-[#908CAA]">Chưa có thư mục</p>';}
  if(host)host.innerHTML=accounts.length?accounts.map(a=>{const open=!collapsedAccounts.has(a.account),unread=a.folders.reduce((s,f)=>s+(f.unread||0),0);return `<button type="button" class="mail-node is-account" data-toggle-acc="${esc(a.account)}" title="${esc(a.account)}"><span class="mail-caret">${open?'▾':'▸'}</span><span class="mail-node-name">${esc(a.account)}</span>${!open&&unread?`<span class="mail-unread">${unread}</span>`:''}</button>${open?a.folders.map(f=>folderNode(a.account,f,'is-folder')).join(''):''}`;}).join(''):'<p class="px-3 py-1 text-[11px] text-[#908CAA]">Chưa có tài khoản Outlook từ AD.</p>';
  renderAccountFilter();
 }
 // ---- Panel phải: Lọc Thư / Categories ----
 function renderAccountFilter(){
  const host=$('mail-fp-accounts'),title=$('mail-fp-acc-title');const k=accounts.filter(a=>!uncheckedAccounts.has(a.account)).length;
  if(title)title.textContent=`▼ Tài khoản / Data (${k}/${accounts.length} đã chọn)`;
  if(host)host.innerHTML=accounts.length?accounts.map(a=>`<label title="${esc(a.account)}"><input type="checkbox" data-fp-acc="${esc(a.account)}"${uncheckedAccounts.has(a.account)?'':' checked'} /><span>${esc(a.account)}</span></label>`).join(''):'<span class="text-[11px] text-[#908CAA]">Chưa có tài khoản</span>';
 }
 function renderOfficeCats(){const host=$('mail-office-cats');if(host)host.innerHTML=OFFICE_CATEGORIES.map(([key,label,color])=>`<button type="button" class="mail-oc${key===officeCat?' active':''}" data-oc="${esc(key)}"><i style="background:${color}"></i><span>${esc(label)}</span></button>`).join('');}
 function renderPeople(){const host=$('mail-fp-people');if(!host)return;const seen=new Map();const add=(name,email)=>{email=String(email||'').trim();if(!email||seen.has(email.toLowerCase()))return;seen.set(email.toLowerCase(),`<option value="${esc(email)}">${esc(name||email)}</option>`);};for(const m of messages){add(m.sender,m.email);for(const p of [...m.to,...m.cc])add(p?.name,p?.email);if(seen.size>=300)break;}host.innerHTML=[...seen.values()].join('');}
 function matchCriteria(m){
  if(mode!=='search'||!criteria)return true;const c=criteria;
  if(m.account&&uncheckedAccounts.has(m.account))return false;
  if(c.person){const from=c.from&&fold(m.sender+' '+m.email).includes(c.person),to=c.to&&fold(peopleText(m.to)+' '+peopleText(m.cc)).includes(c.person);if(!from&&!to)return false;}
  if(c.keyword){const s=c.subject&&fold(m.subject).includes(c.keyword),b=c.body&&fold(m.body).includes(c.keyword);if(!s&&!b)return false;}
  if(c.start&&(!m.ts||m.ts<c.start))return false;if(c.end&&(!m.ts||m.ts>=c.end))return false;
  return true;
 }
 // ---- Cột giữa: danh sách thư dạng bảng ----
 function visibleRows(){
  const rows=messages.filter(m=>(category==='all'||m.category===category)&&matchOffice(officeCat,m)&&(readFilter!=='unread'||m.unread)&&matchCriteria(m)&&(!query||searchText(m).includes(query)));
  const dir=sortDesc?-1:1,key={from:m=>fold(m.sender),subject:m=>fold(m.subject),categories:m=>m.categoryLabel}[sortCol];
  return rows.sort((a,b)=>key?dir*key(a).localeCompare(key(b),'vi')||b.ts-a.ts:dir*(a.ts-b.ts));
 }
 function rowHtml(m,showTo){const [label,color]=BUSINESS[m.category]||BUSINESS.other;const who=showTo?m.to.map(p=>p?.name||p?.email||'').filter(Boolean).join('; ')||m.sender:m.sender;return `<tr class="mail-row${m.unread?' unread':''}${m.id===activeId?' active':''}" data-mail-id="${esc(m.id)}"><td class="c-ic" title="${m.unread?'Chưa đọc':''}${m.attachments.length?' · '+m.attachments.length+' tệp đính kèm':''}">${m.unread?'●':''}${m.attachments.length?'📎':''}</td><td title="${esc(who)}">${esc(who)}</td><td title="${esc(m.subject)}">${esc(m.subject||'(Không có tiêu đề)')}</td><td class="c-date">${esc(m.date)}</td><td><span class="mail-pill" style="color:${color}">${esc(label)}</span></td></tr>`;}
 function render(){
  const scoped=messages.filter(matchCriteria);
  all('.mail-cat-btn').forEach(button=>{const cat=button.dataset.cat,count=scoped.filter(x=>cat==='all'||x.category===cat).length,badge=button.querySelector('.mail-count');if(badge)badge.textContent=String(count);toggleClass(button,'active',cat===category);});
  toggleClass($('mail-tab-all'),'active',readFilter==='all');toggleClass($('mail-tab-unread'),'active',readFilter==='unread');
  const dirEl=$('mail-sort-dir');if(dirEl)dirEl.textContent=sortCol==='received'?(sortDesc?'▼ ↓':'▲ ↑'):'';
  const container=$('mail-list-container');if(!container)return;
  const rows=visibleRows();visibleIds=rows.map(r=>r.id);
  const showTo=mode==='folder'&&/sent/i.test(folder);
  const th=(label,col,extra='')=>`<th${col?` data-sort="${col}"`:''}${extra}>${label}${col&&sortCol===col?(sortDesc?' ▼':' ▲'):''}</th>`;
  const scrollTop=container.scrollTop||0;
  container.innerHTML=`<table class="mail-table"><colgroup><col class="c-ic" /><col class="c-from" /><col /><col class="c-date" /><col class="c-cat" /></colgroup><thead><tr>${th('📎','',' title="Chưa đọc · Tệp đính kèm"')}${th(showTo?'To':'From','from')}${th('Subject','subject')}${th('Received','received')}${th('Categories','categories')}</tr></thead><tbody>${rows.length?rows.slice(0,limit).map(m=>rowHtml(m,showTo)).join(''):`<tr><td colspan="5" class="mail-empty-row">${messages.length?'Không có thư phù hợp bộ lọc.':'Chưa có thư phù hợp từ AD.'}</td></tr>`}</tbody></table>`;
  if(scrollTop)container.scrollTop=scrollTop;
  const info=currentFolderInfo(),total=mode==='folder'&&info?info.count:scoped.length;
  const countText=mode==='search'?`${rows.length} thư phù hợp · ${messages.length} thư đã đồng bộ`:`${rows.length!==messages.length?rows.length+' thư hiển thị · ':''}${messages.length} thư đã tải · ${total} mục trong thư mục`;
  if($('mail-total-count'))$('mail-total-count').textContent=countText;
  const title=$('mail-folder-title');if(title){title.textContent=mode==='search'?'Kết quả lọc':folder||'Hộp thư';title.title=mode==='search'?'Thư của các tài khoản đã chọn trong panel Lọc Thư':account;}
  const more=$('mail-more-btn');if(more){more.disabled=rows.length<=limit;more.textContent=rows.length>limit?`Tải thêm 50 thư (còn ${rows.length-limit})`:'Tải thêm 50 thư';}
  const unread=mode==='folder'&&info?info.unread:scoped.filter(x=>x.unread).length;
  const items=$('mail-stat-items');if(items)items.innerHTML=`<b>${total}</b> mục`;
  const un=$('mail-stat-unread');if(un)un.textContent='Chưa đọc: '+unread;
  renderChips();
 }
 function renderChips(){
  const host=$('mail-filter-chips');if(!host)return;const parts=[];
  if(mode==='search'&&criteria){const c=criteria;parts.push('Tài khoản '+accounts.filter(a=>!uncheckedAccounts.has(a.account)).length+'/'+accounts.length);if(c.personRaw)parts.push((c.from&&c.to?'Gửi/nhận':c.to?'Gửi tới':'Từ')+': '+c.personRaw);if(c.keywordRaw)parts.push('Từ khóa: '+c.keywordRaw);if(c.start||c.end)parts.push('Ngày: '+(c.startRaw||'…')+' → '+(c.endRaw||'…'));}
  if(category!=='all')parts.push(CAT_NAMES[category]||category);
  if(officeCat!=='all')parts.push((OFFICE_CATEGORIES.find(x=>x[0]===officeCat)||[,officeCat])[1]);
  if(readFilter==='unread')parts.push('Chưa đọc');
  if(queryRaw)parts.push('Tìm: “'+queryRaw+'”');
  host.innerHTML=parts.length?`<span>Đang lọc:</span>${parts.map(p=>`<b>${esc(p)}</b>`).join('<span>·</span>')}<button type="button" data-chip-reset="1">⟲ Xóa bộ lọc</button>`:'';
  toggleClass(host,'hidden',!parts.length);
 }
 function markActive(id){all('#mail-list-container .mail-row').forEach(row=>toggleClass(row,'active',row.dataset.mailId===id));}
 function scrollRowIntoView(id){const container=$('mail-list-container');const row=container&&typeof container.querySelector==='function'?container.querySelector(`[data-mail-id="${cssId(id)}"]`):null;if(row&&typeof row.scrollIntoView==='function')row.scrollIntoView({block:'nearest'});}
 function updateActions(){all('[data-mail-need]').forEach(b=>{b.disabled=!activeId;});}
 // ---- Khung đọc ----
 function notice(text){const d=$('mail-detail-container');if(!d)return;d.className='mail-detail is-notice';d.textContent=text;detailState='notice';shownKey='';}
 function renderEmpty(){const d=$('mail-detail-container');if(!d)return;d.className='mail-detail';d.innerHTML=`<div class="mail-empty"><span class="text-4xl">✉</span><span>Chọn một thư trong danh sách để đọc</span>${messages.length?'<button type="button" data-mail-first="1">Bấm để xem thư đầu tiên</button>':''}</div>`;detailState='empty';shownKey='';}
 const detailKey=m=>m.id+'|'+m.subject+'|'+m.body.length+'|'+m.attachments.length;
 function status(text){const el=$('mail-bridge-status');if(el)el.textContent=text;}
 function clear(text='AD chưa kết nối.') {messages=[];accounts=[];bodyCache.clear();pendingBody='';listSig='';renderTree();activeId='';lastSync='';render();updateActions();notice(text);status(text);}
 const fetchList=()=>rpc('awm_mail_list',project,'',mode==='search'?'':account,mode==='search'?'':folder);
 const signature=list=>list.map(m=>m.id+(m.unread?'*':'')).join(',');
 async function refresh(force=false){
  if(loading){if(force)queued=true;return;}loading=true;const run=epoch;
  try{
   const projects=await rpc('get_projects_bar_data');if(run!==epoch)return;
   const next=projects.current_project||'';if(next!==project){project=next;clear('Đang đổi dự án…');force=true;}
   const state=await rpc('awm_mail_status',project);if(run!==epoch)return;
   if(!state.online){
    clear('AD chưa kết nối hoặc nguồn Outlook đang lỗi. Mở AD để xem Mail.');
    return;
   }
   const info=state.scan_info;status(`AD đang kết nối · Mail cập nhật ${state.last_sync?new Date(state.last_sync).toLocaleString('vi-VN'):'chưa có'}${info?' · '+info.scan_limit+' thư gần nhất / '+info.total_inbox+' mục Inbox':''}`);
   if(force||state.last_sync!==lastSync){
    let data=await fetchList();if(run!==epoch)return;accounts=data.accounts||[];
    if(mode==='folder'&&accounts.length&&!accounts.some(a=>a.account===account&&a.folders.some(f=>f.name===folder))){account=accounts[0].account;folder=(accounts[0].folders.find(f=>f.name==='Inbox')||accounts[0].folders[0]).name;data=await fetchList();if(run!==epoch)return;}
    renderTree();messages=(data.items||[]).map(normalize);listSig=signature(messages);lastSync=data.last_sync||'';renderPeople();render();
    if(activeId){const current=messages.find(x=>x.id===activeId);if(current){if(!current.body&&pendingBody===current.id)current.body=LOADING_TEXT;if(detailKey(current)!==shownKey)renderDetail(current);}else{activeId='';updateActions();notice('Thư không còn trong nguồn đồng bộ hiện tại.');}}
   }
   if(!activeId&&detailState!=='empty')renderEmpty();
  }catch(error){if(run===epoch)clear(error.message);}
  finally{if(run===epoch){loading=false;if(queued){queued=false;refresh(true);}}}
 }
 async function init(){
  const run=++epoch;loading=false;queued=false;clearTimeout(timer);bindUi();
  if(!$('mail-bridge-status')){const list=$('mail-list-container');if(list){const el=document.createElement('p');el.id='mail-bridge-status';el.className='p-2 text-xs text-[#908CAA]';el.setAttribute('role','status');list.parentElement.insertBefore(el,list);}}
  clear('Đang kiểm tra kết nối AD…');await refresh(true);
  const poll=async()=>{if(run!==epoch)return;await refresh();timer=setTimeout(poll,5000);};if(run===epoch)timer=setTimeout(poll,5000);
 }
 async function loadBody(message,run){
  pendingBody=message.id;
  const done=text=>{message.body=text;message._s='';if(pendingBody===message.id)pendingBody='';renderDetail(message);};
  try{const req=await rpc('awm_mail_request',message.id);
   for(let i=0;i<40;i++){if(run!==epoch||activeId!==message.id)return;
    const st=await rpc('awm_mail_request_status',req.id);
    if(st.status==='done'){const text=st.result?.text||'(Thư không có nội dung văn bản)';bodyCache.set(message.id,text);if(run===epoch&&activeId===message.id)done(text);return;}
    if(st.status==='error'){if(run===epoch&&activeId===message.id)done('Không tải được nội dung: '+(st.error||''));return;}
    await new Promise(r=>setTimeout(r,1500));}
   if(run===epoch&&activeId===message.id)done('AD chưa trả nội dung. Mở AD trên máy tính rồi thử lại.');}
  catch(error){if(run===epoch&&activeId===message.id)done('Không tải được nội dung: '+error.message);}
  finally{if(pendingBody===message.id)pendingBody='';}
 }
 async function selectMail(id){
  const run=epoch;id=String(id);activeId=id;markActive(id);updateActions();
  const cached=messages.find(x=>x.id===id);if(cached&&cached.body)renderDetail(cached);
  try{const state=await rpc('awm_mail_status',project);if(run!==epoch)return;if(!state.online){clear();return;}
   const data=await fetchList();if(run!==epoch||activeId!==id)return;
   messages=(data.items||[]).map(normalize);
   const sig=signature(messages);if(sig!==listSig){listSig=sig;render();}
   const message=messages.find(x=>x.id===id);if(!message){activeId='';updateActions();render();notice('Thư không còn trong nguồn đồng bộ hiện tại.');return;}
   if(!message.body){message.body=LOADING_TEXT;renderDetail(message);loadBody(message,run);return;}
   renderDetail(message);}
  catch(error){if(run===epoch)clear(error.message);}
 }
 function renderDetail(message){
  const container=$('mail-detail-container');if(!container)return;
  const name=message.sender||message.email||'(Không rõ người gửi)';
  const initial=(name.replace(/^[^\p{L}\p{N}]+/u,'')[0]||'M').toUpperCase();
  const color=AVATAR[[...name].reduce((s,c)=>s+c.charCodeAt(0),0)%AVATAR.length];
  const who=list=>list.map(p=>`<span title="${esc(p?.email||'')}">${esc(p?.name||p?.email||'')}</span>`).join('; ');
  const recips=(message.to.length?`<div><b>Đến:</b> ${who(message.to)}</div>`:'')+(message.cc.length?`<div><b>CC:</b> ${who(message.cc)}</div>`:'');
  const att=message.attachments.length?`<div class="mail-attach"><div class="mail-attach-head">Tệp đính kèm · ${message.attachments.length} • Tên tệp trong Outlook</div><ul>${message.attachments.map(x=>`<li title="${esc(x)}">📎 ${esc(x)}</li>`).join('')}</ul><div class="mail-attach-head" style="margin:3px 0 0;text-transform:none">Nội dung tệp đính kèm Outlook chưa đồng bộ qua cầu Mail hiện tại — mở tại AD.</div></div>`:'';
  container.className='mail-detail';
  container.innerHTML=`<div class="mail-read-head"><h2 class="mail-read-subject">${esc(message.subject||'(Không có tiêu đề)')}</h2><div class="mail-read-actions"><button type="button" data-mail-action="reply">↩ Trả lời</button><button type="button" data-mail-action="reply_all">⮀ Trả lời tất cả</button><button type="button" data-mail-action="forward">↪ Chuyển tiếp</button><button type="button" data-mail-action="share" title="Chia sẻ cho cán bộ">👥 Chia sẻ</button><button type="button" data-mail-action="copy" title="Sao chép nội dung">📋 Sao chép</button></div><div class="mail-sender-row"><div class="mail-avatar" style="background:${color}">${esc(initial)}</div><div class="min-w-0"><div class="mail-sender-name">${esc(name)}</div><div class="mail-sender-meta">${message.email?esc(message.email)+' · ':''}${esc(message.date)}${message.account?' · '+esc(message.account)+' › '+esc(message.folder||'Inbox'):''}</div></div></div>${recips?`<div class="mail-recipients">${recips}</div>`:''}</div>${att}<div class="mail-read-body">${esc(message.body)}</div>`;
  detailState='mail';shownKey=detailKey(message);
 }
 function loadCompose(){return window.MailCompose?Promise.resolve():new Promise((ok,no)=>{const sc=document.createElement('script');sc.src='/js/mail_compose.js?v=2';sc.onload=ok;sc.onerror=()=>no(new Error('Không tải được màn hình soạn thư.'));document.head.appendChild(sc);});}
 async function compose(kind='new',message=null){try{await loadCompose();window.MailCompose.open({rpc:(m,a)=>rpc(m,...a),kind,message,project,me:message?.account||account});}catch(e){notify(e.message,'error');}}
 function newMail(){compose('new',accounts.length?{account,subject:'',body:'',id:''}:null);}
 function action(kind){
  const message=messages.find(x=>x.id===activeId);if(!message){notify('Chọn một thư trong danh sách trước.');return;}
  if(kind==='copy')return exportMailText(message.id);
  if(kind==='share'){if(window.MailShareUI)window.MailShareUI.open({mailId:message.id,project,rpc:(method,args)=>rpc(method,...args)});else notify('Màn hình chia sẻ Mail chưa được tải.','error');return;}
  compose(kind,message);
 }
 // ---- Bộ lọc, sắp xếp, chọn thư mục ----
 function setCategory(value){category=value;limit=100;render();}
 function onSearch(value){queryRaw=String(value||'').trim();query=fold(queryRaw);limit=100;render();}
 function setReadFilter(value){readFilter=value==='unread'?'unread':'all';limit=100;render();}
 function setOfficeCategory(key){officeCat=key;limit=100;renderOfficeCats();render();}
 function sortBy(col){if(sortCol===col)sortDesc=!sortDesc;else{sortCol=col;sortDesc=col==='received';}render();}
 function toggleDateSort(){if(sortCol!=='received'){sortCol='received';sortDesc=true;}else sortDesc=!sortDesc;render();}
 function loadMore(){limit+=50;render();}
 function resetSelection(){activeId='';pendingBody='';updateActions();renderEmpty();}
 function selectFolder(acc,name){mode='folder';account=acc;folder=name;category='all';limit=100;resetSelection();renderTree();render();refresh(true);}
 const val=id=>String($(id)?.value||'').trim();
 const checked=id=>!!$(id)?.checked;
 function applyFilter(){
  const personRaw=val('mail-fp-person'),keywordRaw=val('mail-fp-keyword'),useDate=checked('mail-fp-usedate'),startRaw=useDate?val('mail-fp-start'):'',endRaw=useDate?val('mail-fp-end'):'';
  let from=checked('mail-fp-from'),to=checked('mail-fp-to'),subject=checked('mail-fp-subject'),body=checked('mail-fp-body');if(!from&&!to)from=to=true;if(!subject&&!body)subject=body=true;
  const day=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);return m?new Date(+m[1],+m[2]-1,+m[3]).getTime():0;};
  const start=day(startRaw),endDay=day(endRaw);
  criteria={person:fold(personRaw),personRaw,from,to,keyword:fold(keywordRaw),keywordRaw,subject,body,start,end:endDay?endDay+86400000:0,startRaw:startRaw.split('-').reverse().join('/'),endRaw:endRaw.split('-').reverse().join('/')};
  const wasSearch=mode==='search';mode='search';limit=100;resetSelection();renderTree();render();
  if(!wasSearch)refresh(true);
 }
 function resetFilter(){
  for(const id of ['mail-fp-person','mail-fp-keyword','mail-search']){const el=$(id);if(el)el.value='';}
  for(const [id,on] of [['mail-fp-from',true],['mail-fp-to',false],['mail-fp-subject',true],['mail-fp-body',true],['mail-fp-usedate',false]]){const el=$(id);if(el)el.checked=on;}
  const wasSearch=mode==='search';criteria=null;mode='folder';category='all';officeCat='all';readFilter='all';query='';queryRaw='';limit=100;renderOfficeCats();
  if(wasSearch){resetSelection();renderTree();render();refresh(true);}else render();
 }
 function checkAllAccounts(on){if(on)uncheckedAccounts.clear();else accounts.forEach(a=>uncheckedAccounts.add(a.account));renderAccountFilter();render();}
 function setFilterPanel(show){filterVisible=!!show;toggleClass($('mail-filter-pane'),'hidden',!filterVisible);const b=$('mail-filter-toggle');toggleClass(b,'active',filterVisible);if(b&&typeof b.setAttribute==='function')b.setAttribute('aria-pressed',String(filterVisible));}
 function toggleFilterPanel(){setFilterPanel(!filterVisible);store.set('awd_mail_filter_panel',filterVisible?'1':'0');}
 function setFolderCollapsed(on){const pane=$('mail-folder-pane');toggleClass(pane,'collapsed',on);const b=$('mail-folder-collapse');if(b)b.textContent=on?'❯':'❮';}
 function toggleFolderPane(){const pane=$('mail-folder-pane');const on=!(pane&&pane.classList&&pane.classList.contains('collapsed'));setFolderCollapsed(on);store.set('awd_mail_folder_collapsed',on?'1':'0');}
 // ---- Gắn sự kiện giao diện (một lần, chỉ khi có DOM thật) ----
 function bindSplitter(handle){
  handle.addEventListener('pointerdown',event=>{
   const kind=handle.dataset.split,pane=$(kind==='folder'?'mail-folder-pane':'mail-reader-pane');if(!pane||pane.classList.contains('collapsed'))return;
   event.preventDefault();const startX=event.clientX,startW=pane.getBoundingClientRect().width;handle.classList.add('dragging');if(handle.setPointerCapture)handle.setPointerCapture(event.pointerId);
   const move=ev=>{const w=kind==='folder'?startW+ev.clientX-startX:startW-(ev.clientX-startX);const max=kind==='folder'?380:Math.max(320,Math.round(window.innerWidth*0.6));pane.style.width=Math.round(Math.min(max,Math.max(kind==='folder'?150:300,w)))+'px';};
   const up=()=>{handle.classList.remove('dragging');handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up);store.set(kind==='folder'?'awd_mail_folder_w':'awd_mail_reader_w',parseInt(pane.style.width,10)||'');};
   handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up);
  });
 }
 function onPageClick(event){
  const t=event.target;if(!t||typeof t.closest!=='function')return;let el;
  if((el=t.closest('[data-toggle-acc]'))){const a=el.dataset.toggleAcc;if(collapsedAccounts.has(a))collapsedAccounts.delete(a);else collapsedAccounts.add(a);renderTree();return;}
  if((el=t.closest('[data-acc][data-folder]'))){selectFolder(el.dataset.acc,el.dataset.folder);return;}
  if((el=t.closest('#mail-list-container th[data-sort]'))){sortBy(el.dataset.sort);return;}
  if((el=t.closest('#mail-list-container [data-mail-id]'))){const list=$('mail-list-container');if(list&&list.focus)list.focus({preventScroll:true});clearTimeout(selTimer);selectMail(el.dataset.mailId);return;}
  if((el=t.closest('[data-mail-action]'))){action(el.dataset.mailAction);return;}
  if((el=t.closest('[data-mail-first]'))){if(visibleIds[0])selectMail(visibleIds[0]);return;}
  if((el=t.closest('[data-oc]'))){setOfficeCategory(el.dataset.oc);return;}
  if((el=t.closest('[data-chip-reset]'))){resetFilter();return;}
 }
 function onListKey(event){
  if(!['ArrowDown','ArrowUp','Home','End','Enter'].includes(event.key))return;
  const ids=visibleIds.slice(0,limit);if(!ids.length)return;event.preventDefault();
  let i=ids.indexOf(activeId);
  if(event.key==='Enter'){if(i<0)i=0;}else i=event.key==='Home'?0:event.key==='End'?ids.length-1:event.key==='ArrowDown'?Math.min(ids.length-1,i+1):Math.max(0,i-1);
  const id=ids[i];activeId=id;markActive(id);updateActions();scrollRowIntoView(id);clearTimeout(selTimer);selTimer=setTimeout(()=>selectMail(id),220);
 }
 function bindUi(){
  if(bound||typeof document.addEventListener!=='function')return;const page=$('page-mail');if(!page||typeof page.addEventListener!=='function')return;bound=true;
  page.addEventListener('click',onPageClick);
  const list=$('mail-list-container');if(list)list.addEventListener('keydown',onListKey);
  const acc=$('mail-fp-accounts');if(acc)acc.addEventListener('change',event=>{const a=event.target?.dataset?.fpAcc;if(a===undefined)return;if(event.target.checked)uncheckedAccounts.delete(a);else uncheckedAccounts.add(a);renderAccountFilter();render();});
  all('#page-mail .mail-split').forEach(bindSplitter);
  for(const [key,id,min] of [['awd_mail_folder_w','mail-folder-pane',150],['awd_mail_reader_w','mail-reader-pane',300]]){const w=parseInt(store.get(key),10),pane=$(id);if(pane&&w>=min&&w<=2000)pane.style.width=w+'px';}
  setFolderCollapsed(store.get('awd_mail_folder_collapsed')==='1');
  const panel=store.get('awd_mail_filter_panel');setFilterPanel(panel===null?(window.innerWidth||0)>=1500:panel==='1');
  renderOfficeCats();
 }
 async function connectOutlook(){await refresh(true);}
 function chooseScanFolder(){notify('Quét Outlook và chọn nguồn Mail tại AD; AwD nhận dữ liệu đã đồng bộ.');}
 function sendToB1Word(){notify('Chức năng tạo Word được thực hiện tại AD.');}
 function sendToHsmt(){notify('Chức năng xử lý HSMT được thực hiện tại AD.');}
 async function exportMailText(id){try{const state=await rpc('awm_mail_status',project);if(!state.online){clear();return;}const message=messages.find(x=>x.id===id);if(!message)return;await navigator.clipboard.writeText(`Tiêu đề: ${message.subject}\nNgười gửi: ${message.sender}\nNgày: ${message.date}\n\n${message.body}`);notify('Đã sao chép nội dung thư.','success');}catch(error){notify(error.message,'error');}}
 function dispose(){epoch++;loading=false;queued=false;clearTimeout(timer);clearTimeout(selTimer);clear('Đã đóng Mail.');}
 window.addEventListener('bqlda_logout',dispose);
 window.addEventListener('bqlda_project_changed',event=>{epoch++;loading=false;queued=false;clearTimeout(timer);clear();if(!event?.detail?.pending&&$('page-mail')?.classList.contains('active'))init();});
 return {init,setCategory,onSearch,selectMail,connectOutlook,chooseScanFolder,sendToB1Word,sendToHsmt,exportMailText,dispose,newMail,action,setReadFilter,setOfficeCategory,sortBy,toggleDateSort,loadMore,selectFolder,applyFilter,resetFilter,checkAllAccounts,toggleFilterPanel,toggleFolderPane};
})();
