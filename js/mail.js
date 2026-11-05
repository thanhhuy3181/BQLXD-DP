'use strict';
// Web Mail has one authenticated source: the paired AD bridge.
// Giao diện giống tab Mail của AD (Outlook Classic): Favorites + cây Hòm thư / Data đúng như Outlook,
// danh sách thư dạng cột, khung đọc thư và panel "Lọc Thư / Categories".
// AD gửi cây thư mục (tên và số thư, không có nội dung). Mở một thư mục chỉ yêu cầu AD gửi danh sách
// thư của thư mục đó (tiêu đề, người gửi, ngày), kèm % tiến trình. Nội dung một thư chỉ được AD đẩy
// lên khi người dùng mở thư đó.
const MailModule=(()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const OFFICE_CATEGORIES=[['all','All','#0078D4'],['none','No Categories','#8A8886'],['01.01','01.01. PD Chu truong','#D13438'],['01.02','01.02. PD Tien do','#EA4300'],['01.03','01.03. PD QC TC KT','#FF8C00'],['01.04','01.04. PD Thiet ke','#FCE100'],['02','02. Phap ly','#107C41'],['03','03. Cam nang','#008272'],['04','04. Chuan hoa','#0078D4'],['05','05. Thiet ke','#4F6BED'],['06','06. HSMT','#8764B8'],['07','07. Hop dong','#881798'],['07.01','07.01. HD Phap ly','#B4009E'],['07.02','07.02. HD dang thuong thao','#E3008C'],['07.03','07.03. Don gia khung','#004E8C'],['08.01','08.01. TU_TT','#0099BC'],['08.02','08.02. QT','#038387'],['08.03','08.03. Du chi','#498205'],['09.01','09.01. Ke hoach','#107C41'],['09.02','09.02. KH phap ly','#27AE60'],['09.03','09.03. Tien do','#F39C12'],['09.04','09.04. Ngan sach','#D35400'],['09.05','09.05. Dinh bien','#C0392B'],['10','10. Bao cao','#2980B9'],['10.01','10.01. Thong bao Hop','#8E44AD'],['11','11. GPMB','#2C3E50'],['12.01','12.01. ATLD_VSMT','#E74C3C'],['12.02','12.02. Video','#3498DB'],['12.03','12.03. Chat luong Thi nghiem','#1ABC9C'],['12.04','12.04. Khoi luong','#16A085'],['12.05','12.05. Giam sat ton tai','#E67E22'],['12.06','12.06. Xu ly vi pham_CV phat','#C0392B'],['12.07','12.07. Camera','#7F8C8D'],['12.08','12.08. KSVR','#BDC3C7'],['13','13. Thi cong','#34495E'],['13.01','13.01. Chi thi','#E74C3C'],['13.02','13.02. Kick off_Dau moi lien he','#9B59B6'],['13.03','13.03. KHO','#3498DB'],['13.04','13.04. Vat tu','#1ABC9C'],['13.05','13.05. May moc','#F1C40F'],['13.06','13.06. VLDV','#E67E22'],['13.07','13.07. Dieu chuyen vt','#D35400']];
 const OC_RULES=[[['01.01'],['chủ trương','pd chu truong','phê duyệt chủ trương']],[['01.02','09.03'],['tiến độ','tien do','schedule']],[['01.03','12.03'],['qc','tc kt','thí nghiệm','chất lượng','tc&kt']],[['01.04','05'],['thiết kế','thiet ke','bvtk','bản vẽ','design']],[['02','07.01','09.02'],['pháp lý','phap ly','legal']],[['03','04'],['cẩm nang','chuẩn hóa','quy chuẩn','hướng dẫn']],[['06'],['hsmt','mời thầu','e-hsmt','dự thầu','thầu']],[['07','07.02','07.03'],['hợp đồng','hop dong','thương thảo','đơn giá khung','phụ lục']],[['08.01','08.02','08.03'],['tư_tt','tạm ứng','thanh toán','quyết toán','dự chi','tu_tt']],[['09.01','09.04','09.05'],['kế hoạch','ngân sách','định biên','dự toán']],[['10','10.01'],['báo cáo','thông báo họp','biên bản họp','cuộc họp']],[['11'],['gpmb','giải phóng mặt bằng']],[['12.01','12.02','12.04','12.05','12.06','12.07','12.08'],['an toàn','atlđ','vsmt','khối lượng','tồn tại','vi phạm','camera','ksvr']],[['13','13.01','13.02','13.03','13.04','13.05','13.06','13.07'],['thi công','chỉ thị','kick off','kho','vật tư','máy móc','điều chuyển']]];
 const OC_NONE=['hsmt','thầu','hợp đồng','hđ','thanh toán','tạm ứng','thiết kế','bvtk','chủ trương'];
 const AVATAR=['#F2C0C8','#9ccfd8','#c4a7e7','#f6c177','#a6e3a1','#ebbcba','#89b4fa'];
 const LOADING_TEXT='Đang tải nội dung từ AD…';
 const TREE_TTL=60000;
 let stores=[],storeOrder=[],accounts=[],messages=[],treeAt=0;
 let folderId='',folderName='',folderAcc='',folderToken=0,listState=null;
 let activeId='',project='',timer,epoch=0,loading=false,queued=false,lastSync='',listSig='';
 let officeCat='all',readFilter='all',query='',queryRaw='',sortCol='received',sortDesc=true,limit=100,mode='folder',criteria=null,visibleIds=[],bound=false,selTimer=0,filterVisible=true,detailState='empty',shownKey='',pendingBody='';
 let dragId='',dropMark=null;
 const uncheckedAccounts=new Set(),collapsedStores=new Set(),bodyCache=new Map();
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
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function rpc(method,...args){const result=await API.call(method,...args);if(result?.ok!==true)throw new Error(result?.error||'Máy chủ chưa xác nhận yêu cầu.');return result.data;}
 function matchOffice(key,m){if(key==='all')return true;const txt=m.ocText;if(key==='none')return !has(txt,OC_NONE);const rule=OC_RULES.find(r=>r[0].includes(key));return rule?has(txt,rule[1]):txt.includes(key.toLowerCase().replace(/\./g,''));}
 function fmtDate(v){const d=new Date(v);if(!v||isNaN(d))return String(v||'');return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;}
 function normalize(message){
  const id=String(message.id),d=new Date(message.date);
  const toList=Array.isArray(message.to)?message.to:[],ccList=Array.isArray(message.cc)?message.cc:[];
  const toText=message.to_text?String(message.to_text):toList.map(p=>p?.name||p?.email||'').filter(Boolean).join('; ');
  const attachments=Array.isArray(message.attachments)?message.attachments.map(String):[];
  const m={id,subject:String(message.subject||''),body:String(message.body||bodyCache.get(id)||''),sender:String(message.sender||''),email:String(message.email||''),account:String(message.account||''),folder:String(message.folder||''),categories:String(message.categories||''),toText,unread:message.unread===true,attachments,attCount:Math.max(Number(message.att_count)||0,attachments.length),to:toList,cc:ccList};
  m.ts=message.date&&!isNaN(d)?d.getTime():0;m.date=fmtDate(message.date);m.ocText=(m.subject+' '+m.body.slice(0,800)).normalize('NFC').toLowerCase();
  return m;
 }
 const searchText=m=>m._s||(m._s=fold([m.subject,m.sender,m.email,m.toText,m.body.slice(0,20000)].join(' ')));
 const signature=list=>list.map(m=>m.id+(m.unread?'*':'')).join(',');
 // ---- Cột trái: Favorites + cây Hòm thư / Data (đúng cây Outlook của AD) ----
 const storeKey=st=>st.id||('name:'+st.name);
 const folderIcon=name=>({'Inbox':'📥','Sent Items':'📤','Drafts':'📝','Deleted Items':'🗑','Junk Email':'🚫','Archive':'🗄','Outbox':'📮'}[name]||'📁');
 const isSentFolder=name=>/sent|đã gửi/i.test(String(name||''));
 function storesFromAccounts(list){return (list||[]).map(a=>({id:'',kind:'mailbox',name:a.account,folders:(a.folders||[]).map(f=>({id:'',name:f.name,count:f.count||0,unread:f.unread||0,children:[]}))}));}
 function orderedStores(){
  const rank=new Map(storeOrder.map((id,i)=>[id,i]));
  return stores.map((st,i)=>({st,i})).sort((a,b)=>(rank.has(a.st.id)?rank.get(a.st.id):1e6+a.i)-(rank.has(b.st.id)?rank.get(b.st.id):1e6+b.i)).map(x=>x.st);
 }
 function walkFolders(nodes,id){for(const f of nodes||[]){if(f.id===id)return f;const hit=walkFolders(f.children,id);if(hit)return hit;}return null;}
 function findFolder(id){if(!id)return null;for(const st of stores){const f=walkFolders(st.folders,id);if(f)return {store:st,folder:f};}return null;}
 function folderBtn(st,f,depth,cls){
  const on=mode==='folder'&&(f.id?f.id===folderId:(!folderId&&folderName===f.name&&folderAcc===st.name));
  const attrs=f.id?`data-folder-id="${esc(f.id)}"`:`data-acc="${esc(st.name)}" data-folder="${esc(f.name)}"`;
  const count=Number(f.count)||0,unread=Number(f.unread)||0;
  return `<button type="button" class="mail-node ${cls}${on?' active':''}" ${attrs} style="padding-left:${10+depth*12}px" title="${esc(st.name+' › '+f.name+' · '+count+' thư'+(unread?', '+unread+' chưa đọc':''))}"><span>${folderIcon(f.name)}</span><span class="mail-node-name">${esc(f.name)}</span>${unread?`<span class="mail-unread">${unread}</span>`:`<span class="mail-total">${count}</span>`}</button>`;
 }
 function folderTree(st,nodes,depth){return (nodes||[]).map(f=>folderBtn(st,f,depth,'is-folder')+folderTree(st,f.children,depth+1)).join('');}
 function storeHtml(st){
  const key=storeKey(st),open=!collapsedStores.has(key);
  const unread=(st.folders||[]).reduce((n,f)=>n+(Number(f.unread)||0),0);
  const drag=st.id?` draggable="true" data-store-key="${esc(st.id)}"`:'';
  return `<div class="mail-store"><div class="mail-node is-account"${drag} data-toggle-store="${esc(key)}" title="${esc(st.name)}">${st.id?'<span class="mail-grip" aria-hidden="true">⠿</span>':''}<span class="mail-caret">${open?'▾':'▸'}</span><span>${st.kind==='data'?'🗄':'✉'}</span><span class="mail-node-name">${esc(st.name)}</span>${st.kind==='data'?'<span class="mail-kind">Data</span>':''}${!open&&unread?`<span class="mail-unread">${unread}</span>`:''}</div>${open?folderTree(st,st.folders,1):''}</div>`;
 }
 function renderTree(){
  const fav=$('mail-favorites'),host=$('mail-account-tree');const list=orderedStores();
  if(fav){const mb=list.find(st=>st.kind!=='data'&&(st.folders||[]).length)||null;const favs=mb?mb.folders.filter(f=>/^(Inbox|Sent Items)$/.test(f.name)):[];fav.innerHTML=favs.length?favs.map(f=>folderBtn(mb,f,0,'is-fav')).join(''):'<p class="px-3 py-1 text-[11px] text-[#908CAA]">Chưa có thư mục</p>';}
  if(host)host.innerHTML=list.length?list.map(storeHtml).join(''):'<p class="px-3 py-1 text-[11px] text-[#908CAA]">Chưa có hòm thư từ AD.</p>';
  renderAccountFilter();
 }
 function applyTree(tree){
  const list=Array.isArray(tree?.stores)?tree.stores:[];
  stores=list.length?list:storesFromAccounts(accounts);
  if(Array.isArray(tree?.order)&&tree.order.length)storeOrder=tree.order.map(String);
  treeAt=Date.now();
 }
 function moveStore(fromId,toId,after){
  const ids=orderedStores().map(st=>st.id).filter(Boolean);
  if(!ids.includes(fromId)||!ids.includes(toId)||fromId===toId)return;
  const rest=ids.filter(x=>x!==fromId);let idx=rest.indexOf(toId);if(after)idx++;rest.splice(idx,0,fromId);
  storeOrder=rest;store.set('awd_mail_store_order',JSON.stringify(rest));renderTree();
  rpc('awm_mail_order_save',rest).catch(error=>notify('Chưa lưu được thứ tự hòm thư: '+error.message,'error'));
 }
 function clearDropMarks(){dropMark=null;all('#mail-account-tree .drop-before,#mail-account-tree .drop-after').forEach(el=>el.classList.remove('drop-before','drop-after'));}
 function bindStoreDrag(host){
  host.addEventListener('dragstart',event=>{const el=event.target?.closest?.('[data-store-key]');if(!el)return;dragId=el.dataset.storeKey;try{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',dragId);}catch(_){}el.classList.add('dragging');});
  host.addEventListener('dragover',event=>{const el=event.target?.closest?.('[data-store-key]');if(!el||!dragId||el.dataset.storeKey===dragId)return;event.preventDefault();const r=el.getBoundingClientRect();const after=event.clientY>r.top+r.height/2;clearDropMarks();el.classList.add(after?'drop-after':'drop-before');dropMark={id:el.dataset.storeKey,after};});
  host.addEventListener('drop',event=>{if(!dragId)return;event.preventDefault();const from=dragId,target=dropMark;dragId='';clearDropMarks();if(target)moveStore(from,target.id,target.after);});
  host.addEventListener('dragend',()=>{dragId='';clearDropMarks();all('#mail-account-tree .dragging').forEach(el=>el.classList.remove('dragging'));});
 }
 // ---- Lọc Thư / Categories (panel bên phải) ----
 function accountNames(){const names=new Set(accounts.map(a=>a.account));for(const st of stores)if(st.name)names.add(st.name);return [...names];}
 function renderAccountFilter(){
  const host=$('mail-fp-accounts'),title=$('mail-fp-acc-title');const names=accountNames();const k=names.filter(n=>!uncheckedAccounts.has(n)).length;
  if(title)title.textContent=`▼ Tài khoản / Data (${k}/${names.length} đã chọn)`;
  if(host)host.innerHTML=names.length?names.map(n=>`<label title="${esc(n)}"><input type="checkbox" data-fp-acc="${esc(n)}"${uncheckedAccounts.has(n)?'':' checked'} /><span>${esc(n)}</span></label>`).join(''):'<span class="text-[11px] text-[#908CAA]">Chưa có tài khoản</span>';
 }
 function renderOfficeCats(){const host=$('mail-office-cats');if(host)host.innerHTML=OFFICE_CATEGORIES.map(([key,label,color])=>`<button type="button" class="mail-oc${key===officeCat?' active':''}" data-oc="${esc(key)}"><i style="background:${color}"></i><span>${esc(label)}</span></button>`).join('');}
 function renderPeople(){const host=$('mail-fp-people');if(!host)return;const seen=new Map();const add=(name,email)=>{email=String(email||'').trim();if(!email||seen.has(email.toLowerCase()))return;seen.set(email.toLowerCase(),`<option value="${esc(email)}">${esc(name||email)}</option>`);};for(const m of messages){add(m.sender,m.email);for(const p of [...m.to,...m.cc])add(p?.name,p?.email);if(seen.size>=300)break;}host.innerHTML=[...seen.values()].join('');}
 function matchCriteria(m){
  if(mode!=='search'||!criteria)return true;const c=criteria;
  if(m.account&&uncheckedAccounts.has(m.account))return false;
  if(c.person){const from=c.from&&fold(m.sender+' '+m.email).includes(c.person),to=c.to&&fold(peopleText(m.to)+' '+peopleText(m.cc)+' '+m.toText).includes(c.person);if(!from&&!to)return false;}
  if(c.keyword){const s=c.subject&&fold(m.subject).includes(c.keyword),b=c.body&&fold(m.body).includes(c.keyword);if(!s&&!b)return false;}
  if(c.start&&(!m.ts||m.ts<c.start))return false;if(c.end&&(!m.ts||m.ts>=c.end))return false;
  return true;
 }
 // ---- Cột giữa: danh sách thư dạng bảng ----
 function visibleRows(){
  const rows=messages.filter(m=>matchOffice(officeCat,m)&&(readFilter!=='unread'||m.unread)&&matchCriteria(m)&&(!query||searchText(m).includes(query)));
  const dir=sortDesc?-1:1,key={from:m=>fold(m.sender),subject:m=>fold(m.subject),categories:m=>fold(m.categories)}[sortCol];
  return rows.sort((a,b)=>key?dir*key(a).localeCompare(key(b),'vi')||b.ts-a.ts:dir*(a.ts-b.ts));
 }
 function rowHtml(m,showTo){
  const who=showTo?(m.toText||m.sender):m.sender,att=m.attCount;
  return `<tr class="mail-row${m.unread?' unread':''}${m.id===activeId?' active':''}" data-mail-id="${esc(m.id)}"><td class="c-ic" title="${m.unread?'Chưa đọc':''}${att?' · '+att+' tệp đính kèm':''}">${m.unread?'●':''}${att?'📎':''}</td><td title="${esc(who)}">${esc(who)}</td><td title="${esc(m.subject)}">${esc(m.subject||'(Không có tiêu đề)')}</td><td class="c-date">${esc(m.date)}</td><td class="c-cat" title="${esc(m.categories)}" style="font-size:11px;color:var(--m-muted)">${esc(m.categories)}</td></tr>`;
 }
 function folderInfo(){const hit=mode==='folder'&&folderId?findFolder(folderId):null;return hit?hit.folder:null;}
 function render(){
  const scoped=messages.filter(matchCriteria);
  toggleClass($('mail-tab-all'),'active',readFilter==='all');toggleClass($('mail-tab-unread'),'active',readFilter==='unread');
  const dirEl=$('mail-sort-dir');if(dirEl)dirEl.textContent=sortCol==='received'?(sortDesc?'▼ ↓':'▲ ↑'):'';
  const container=$('mail-list-container');if(!container)return;
  const rows=visibleRows();visibleIds=rows.map(r=>r.id);
  const showTo=mode==='folder'&&isSentFolder(folderName);
  const th=(label,col,extra='')=>`<th${col?` data-sort="${col}"`:''}${extra}>${label}${col&&sortCol===col?(sortDesc?' ▼':' ▲'):''}</th>`;
  const scrollTop=container.scrollTop||0;
  const progress=listState?`<div class="mail-progress" role="status"><div class="mail-progress-bar"><i style="width:${listState.pct}%"></i></div><span>${esc(listState.label)}</span></div>`:'';
  container.innerHTML=`${progress}<table class="mail-table"><colgroup><col class="c-ic" /><col class="c-from" /><col /><col class="c-date" /><col class="c-cat" /></colgroup><thead><tr>${th('📎','',' title="Chưa đọc · Tệp đính kèm"')}${th(showTo?'To':'From','from')}${th('Subject','subject')}${th('Received','received')}${th('Categories','categories')}</tr></thead><tbody>${rows.length?rows.slice(0,limit).map(m=>rowHtml(m,showTo)).join(''):`<tr><td colspan="5" class="mail-empty-row">${messages.length?'Không có thư phù hợp bộ lọc.':(listState?'':'Chưa có thư phù hợp từ AD.')}</td></tr>`}</tbody></table>`;
  if(scrollTop)container.scrollTop=scrollTop;
  const info=folderInfo(),total=info?(Number(info.count)||0):messages.length;
  const countText=mode==='search'?`${rows.length} thư phù hợp · ${messages.length} thư đã đồng bộ`:`${rows.length!==messages.length?rows.length+' thư hiển thị · ':''}${messages.length} thư đã tải${info?' · '+total+' thư trong thư mục':''}`;
  if($('mail-total-count'))$('mail-total-count').textContent=countText;
  const title=$('mail-folder-title');if(title){title.textContent=mode==='search'?'Kết quả lọc':(folderName||'Thư gần đây (đồng bộ)');title.title=mode==='search'?'Thư của các tài khoản đã chọn trong panel Lọc Thư':[folderAcc,folderName].filter(Boolean).join(' › ');}
  const more=$('mail-more-btn');if(more){more.disabled=rows.length<=limit;more.textContent=rows.length>limit?`Tải thêm 50 thư (còn ${rows.length-limit})`:'Tải thêm 50 thư';}
  const unread=info?(Number(info.unread)||0):messages.filter(x=>x.unread).length;
  const items=$('mail-stat-items');if(items)items.innerHTML=`<b>${total}</b> mục`;
  const un=$('mail-stat-unread');if(un)un.textContent='Chưa đọc: '+unread;
  renderChips();
 }
 function renderChips(){
  const host=$('mail-filter-chips');if(!host)return;const parts=[];
  if(mode==='search'&&criteria){const c=criteria;const names=accountNames();parts.push('Tài khoản '+names.filter(n=>!uncheckedAccounts.has(n)).length+'/'+names.length);if(c.personRaw)parts.push((c.from&&c.to?'Gửi/nhận':c.to?'Gửi tới':'Từ')+': '+c.personRaw);if(c.keywordRaw)parts.push('Từ khóa: '+c.keywordRaw);if(c.start||c.end)parts.push('Ngày: '+(c.startRaw||'…')+' → '+(c.endRaw||'…'));}
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
 function clear(text='AD chưa kết nối.') {messages=[];accounts=[];stores=[];treeAt=0;folderToken++;listState=null;folderId='';folderName='';folderAcc='';bodyCache.clear();pendingBody='';listSig='';renderTree();activeId='';lastSync='';render();updateActions();notice(text);status(text);}
 // Danh sách mặc định (không chọn thư mục) và Lọc Thư lấy từ dữ liệu đồng bộ gần nhất của AD.
 const fetchList=()=>{const sync=mode==='search'||!folderName||!!folderId;return rpc('awm_mail_list',project,'',sync?'':folderAcc,sync?'':folderName);};
 async function refresh(force=false){
  if(loading){if(force)queued=true;return;}loading=true;const run=epoch;
  try{
   const projects=await rpc('get_projects_bar_data');if(run!==epoch)return;
   const next=projects.current_project||'';if(next!==project){project=next;clear('Đang đổi dự án…');force=true;}
   const state=await rpc('awm_mail_status',project);if(run!==epoch)return;
   if(!state.online){clear('AD chưa kết nối hoặc nguồn Outlook đang lỗi. Mở AD để xem Mail.');return;}
   const info=state.scan_info;status(`AD đang kết nối · Mail cập nhật ${state.last_sync?new Date(state.last_sync).toLocaleString('vi-VN'):'chưa có'}${info?' · '+info.scan_limit+' thư gần nhất / '+info.total_inbox+' mục Inbox':''}`);
   const treeDue=force||Date.now()-treeAt>TREE_TTL;
   const listDue=!(mode==='folder'&&folderId)&&(force||state.last_sync!==lastSync);
   let data=null;
   if(listDue){data=await fetchList();if(run!==epoch)return;accounts=data.accounts||[];lastSync=data.last_sync||'';}
   if(treeDue){let tree=null;try{tree=await rpc('awm_mail_tree');}catch(_){tree=null;}if(run!==epoch)return;applyTree(tree);}
   if(treeDue||listDue)renderTree();
   if(data){
    messages=(data.items||[]).map(normalize);listSig=signature(messages);renderPeople();render();
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
 // Mở thư mục: hiện ngay danh sách đã có trên máy chủ, rồi yêu cầu AD gửi danh sách mới kèm % tiến trình.
 async function selectFolder(id){
  id=String(id||'');const hit=findFolder(id);if(!hit)return;
  const token=++folderToken;
  mode='folder';folderId=id;folderName=hit.folder.name;folderAcc=hit.store.name;
  limit=100;resetSelection();messages=[];listSig='';listState={pct:0,label:'Đang chờ AD nhận yêu cầu…'};renderTree();render();
  try{
   const cached=await rpc('awm_mail_folder',id);if(token!==folderToken)return;
   if(Array.isArray(cached.items)&&cached.items.length){messages=cached.items.map(normalize);render();}
   const req=await rpc('awm_mail_folder_request',id);if(token!==folderToken)return;
   await trackList(token,req.id,id);
  }catch(error){if(token===folderToken){listState=null;render();status(error.message);}}
 }
 // Mở thư mục khi AD cũ chưa gửi cây: dùng danh sách đồng bộ theo tài khoản/thư mục như trước.
 function selectSyncFolder(acc,name){folderToken++;listState=null;mode='folder';folderId='';folderAcc=acc;folderName=name;limit=100;resetSelection();renderTree();render();refresh(true);}
 async function trackList(token,reqId,fid){
  for(let i=0;i<300;i++){
   if(token!==folderToken)return;
   let st;try{st=await rpc('awm_mail_request_status',reqId);}catch(error){if(token===folderToken){listState=null;render();status(error.message);}return;}
   if(token!==folderToken)return;
   if(st.status==='done'){
    const data=await rpc('awm_mail_folder',fid);if(token!==folderToken)return;
    listState=null;messages=(data.items||[]).map(normalize);listSig=signature(messages);renderPeople();render();
    status(`Đã tải ${messages.length} thư từ AD${data.updated_at?' · '+new Date(data.updated_at).toLocaleString('vi-VN'):''}`);
    return;
   }
   if(st.status==='error'){listState=null;render();status('AD không liệt kê được thư mục: '+(st.error||''));return;}
   const p=st.progress;
   const pct=p&&p.total?Math.min(100,Math.round(p.done*100/p.total)):0;
   listState=p&&p.total?{pct,label:`Đang tải danh sách từ AD: ${pct}% (${p.done}/${p.total} thư)`}:{pct:0,label:st.status==='queued'?'Đang chờ AD nhận yêu cầu…':'AD đang đọc danh sách thư…'};
   render();
   await sleep(1500);
  }
  if(token===folderToken){listState=null;render();status('AD chưa trả danh sách thư. Mở AD trên máy tính rồi thử lại.');}
 }
 async function loadBody(message,run){
  pendingBody=message.id;
  const done=text=>{message.body=text;message._s='';if(pendingBody===message.id)pendingBody='';renderDetail(message);};
  try{const req=await rpc('awm_mail_request',message.id);
   for(let i=0;i<40;i++){if(run!==epoch||activeId!==message.id)return;
    const st=await rpc('awm_mail_request_status',req.id);
    if(st.status==='done'){const text=st.result?.text||'(Thư không có nội dung văn bản)';bodyCache.set(message.id,text);if(run===epoch&&activeId===message.id)done(text);return;}
    if(st.status==='error'){if(run===epoch&&activeId===message.id)done('Không tải được nội dung: '+(st.error||''));return;}
    await sleep(1500);}
   if(run===epoch&&activeId===message.id)done('AD chưa trả nội dung. Mở AD trên máy tính rồi thử lại.');}
  catch(error){if(run===epoch&&activeId===message.id)done('Không tải được nội dung: '+error.message);}
  finally{if(pendingBody===message.id)pendingBody='';}
 }
 // Chỉ khi mở thư mới yêu cầu nội dung từ AD; thư đã có nội dung thì hiện ngay.
 async function selectMail(id){
  const run=epoch;id=String(id);activeId=id;markActive(id);updateActions();
  const message=messages.find(x=>x.id===id);
  if(!message){notice('Thư không còn trong danh sách hiện tại.');return;}
  if(message.body&&message.body!==LOADING_TEXT){renderDetail(message);return;}
  if(pendingBody===id){renderDetail(message);return;}
  message.body=LOADING_TEXT;renderDetail(message);loadBody(message,run);
 }
 function renderDetail(message){
  const container=$('mail-detail-container');if(!container)return;
  const name=message.sender||message.email||'(Không rõ người gửi)';
  const initial=(name.replace(/^[^\p{L}\p{N}]+/u,'')[0]||'M').toUpperCase();
  const color=AVATAR[[...name].reduce((s,c)=>s+c.charCodeAt(0),0)%AVATAR.length];
  const who=list=>list.map(p=>`<span title="${esc(p?.email||'')}">${esc(p?.name||p?.email||'')}</span>`).join('; ');
  const recips=(message.to.length?`<div><b>Đến:</b> ${who(message.to)}</div>`:(message.toText?`<div><b>Đến:</b> ${esc(message.toText)}</div>`:''))+(message.cc.length?`<div><b>CC:</b> ${who(message.cc)}</div>`:'');
  const att=message.attachments.length?`<div class="mail-attach"><div class="mail-attach-head">Tệp đính kèm · ${message.attachments.length} • Tên tệp trong Outlook</div><ul>${message.attachments.map(x=>`<li title="${esc(x)}">📎 ${esc(x)}</li>`).join('')}</ul><div class="mail-attach-head" style="margin:3px 0 0;text-transform:none">Nội dung tệp đính kèm Outlook chưa đồng bộ qua cầu Mail hiện tại — mở tại AD.</div></div>`:(message.attCount?`<div class="mail-attach"><div class="mail-attach-head">Tệp đính kèm · ${message.attCount}</div><div class="mail-attach-head" style="margin:3px 0 0;text-transform:none">Tên và nội dung tệp chỉ đồng bộ khi mở thư tại AD.</div></div>`:'');
  container.className='mail-detail';
  container.innerHTML=`<div class="mail-read-head"><h2 class="mail-read-subject">${esc(message.subject||'(Không có tiêu đề)')}</h2><div class="mail-read-actions"><button type="button" data-mail-action="reply">↩ Trả lời</button><button type="button" data-mail-action="reply_all">⮀ Trả lời tất cả</button><button type="button" data-mail-action="forward">↪ Chuyển tiếp</button><button type="button" data-mail-action="share" title="Chia sẻ cho cán bộ">👥 Chia sẻ</button><button type="button" data-mail-action="copy" title="Sao chép nội dung">📋 Sao chép</button></div><div class="mail-sender-row"><div class="mail-avatar" style="background:${color}">${esc(initial)}</div><div class="min-w-0"><div class="mail-sender-name">${esc(name)}</div><div class="mail-sender-meta">${message.email?esc(message.email)+' · ':''}${esc(message.date)}${message.account?' · '+esc(message.account)+' › '+esc(message.folder||'Inbox'):''}</div></div></div>${recips?`<div class="mail-recipients">${recips}</div>`:''}</div>${att}<div class="mail-read-body">${esc(message.body)}</div>`;
  detailState='mail';shownKey=detailKey(message);
 }
 function loadCompose(){return window.MailCompose?Promise.resolve():new Promise((ok,no)=>{const sc=document.createElement('script');sc.src='/js/mail_compose.js?v=2';sc.onload=ok;sc.onerror=()=>no(new Error('Không tải được màn hình soạn thư.'));document.head.appendChild(sc);});}
 async function compose(kind='new',message=null){try{await loadCompose();window.MailCompose.open({rpc:(m,a)=>rpc(m,...a),kind,message,project,me:message?.account||folderAcc});}catch(e){notify(e.message,'error');}}
 function newMail(){compose('new',folderAcc?{account:folderAcc,subject:'',body:'',id:''}:null);}
 function action(kind){
  const message=messages.find(x=>x.id===activeId);if(!message){notify('Chọn một thư trong danh sách trước.');return;}
  if(kind==='copy')return exportMailText(message.id);
  if(kind==='share'){if(window.MailShareUI)window.MailShareUI.open({mailId:message.id,project,rpc:(method,args)=>rpc(method,...args)});else notify('Màn hình chia sẻ Mail chưa được tải.','error');return;}
  compose(kind,message);
 }
 // ---- Bộ lọc, sắp xếp ----
 function setOfficeCategory(key){officeCat=key;limit=100;renderOfficeCats();render();}
 function onSearch(value){queryRaw=String(value||'').trim();query=fold(queryRaw);limit=100;render();}
 function setReadFilter(value){readFilter=value==='unread'?'unread':'all';limit=100;render();}
 function sortBy(col){if(sortCol===col)sortDesc=!sortDesc;else{sortCol=col;sortDesc=col==='received';}render();}
 function toggleDateSort(){if(sortCol!=='received'){sortCol='received';sortDesc=true;}else sortDesc=!sortDesc;render();}
 function loadMore(){limit+=50;render();}
 function resetSelection(){activeId='';pendingBody='';updateActions();renderEmpty();}
 const val=id=>String($(id)?.value||'').trim();
 const checked=id=>!!$(id)?.checked;
 function applyFilter(){
  const personRaw=val('mail-fp-person'),keywordRaw=val('mail-fp-keyword'),useDate=checked('mail-fp-usedate'),startRaw=useDate?val('mail-fp-start'):'',endRaw=useDate?val('mail-fp-end'):'';
  let from=checked('mail-fp-from'),to=checked('mail-fp-to'),subject=checked('mail-fp-subject'),body=checked('mail-fp-body');if(!from&&!to)from=to=true;if(!subject&&!body)subject=body=true;
  const day=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);return m?new Date(+m[1],+m[2]-1,+m[3]).getTime():0;};
  const start=day(startRaw),endDay=day(endRaw);
  criteria={person:fold(personRaw),personRaw,from,to,keyword:fold(keywordRaw),keywordRaw,subject,body,start,end:endDay?endDay+86400000:0,startRaw:startRaw.split('-').reverse().join('/'),endRaw:endRaw.split('-').reverse().join('/')};
  const wasSearch=mode==='search';if(!wasSearch){folderToken++;listState=null;}mode='search';limit=100;resetSelection();renderTree();render();
  if(!wasSearch)refresh(true);
 }
 function resetFilter(){
  for(const id of ['mail-fp-person','mail-fp-keyword','mail-search']){const el=$(id);if(el)el.value='';}
  for(const [id,on] of [['mail-fp-from',true],['mail-fp-to',false],['mail-fp-subject',true],['mail-fp-body',true],['mail-fp-usedate',false]]){const el=$(id);if(el)el.checked=on;}
  const wasSearch=mode==='search';criteria=null;mode='folder';officeCat='all';readFilter='all';query='';queryRaw='';limit=100;renderOfficeCats();
  if(wasSearch){folderToken++;listState=null;folderId='';folderName='';folderAcc='';resetSelection();renderTree();render();refresh(true);}else render();
 }
 function checkAllAccounts(on){if(on)uncheckedAccounts.clear();else accountNames().forEach(n=>uncheckedAccounts.add(n));renderAccountFilter();render();}
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
  if((el=t.closest('[data-toggle-store]'))){const key=el.dataset.toggleStore;if(collapsedStores.has(key))collapsedStores.delete(key);else collapsedStores.add(key);renderTree();return;}
  if((el=t.closest('[data-folder-id]'))){selectFolder(el.dataset.folderId);return;}
  if((el=t.closest('[data-acc][data-folder]'))){selectSyncFolder(el.dataset.acc,el.dataset.folder);return;}
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
  const tree=$('mail-account-tree');if(tree)bindStoreDrag(tree);
  try{const saved=JSON.parse(store.get('awd_mail_store_order')||'[]');storeOrder=Array.isArray(saved)?saved.map(String):[];}catch(_){storeOrder=[];}
  all('#page-mail .mail-split').forEach(bindSplitter);
  for(const [key,id,min] of [['awd_mail_folder_w','mail-folder-pane',150],['awd_mail_reader_w','mail-reader-pane',300]]){const w=parseInt(store.get(key),10),pane=$(id);if(pane&&w>=min&&w<=2000)pane.style.width=w+'px';}
  setFolderCollapsed(store.get('awd_mail_folder_collapsed')==='1');
  const panel=store.get('awd_mail_filter_panel');setFilterPanel(panel===null?(window.innerWidth||0)>=1500:panel==='1');
  renderOfficeCats();
 }
 async function connectOutlook(){await refresh(true);if(mode==='folder'&&folderId)selectFolder(folderId);}
 function chooseScanFolder(){notify('Quét Outlook và chọn nguồn Mail tại AD; AwD nhận dữ liệu đã đồng bộ.');}
 function sendToB1Word(){notify('Chức năng tạo Word được thực hiện tại AD.');}
 function sendToHsmt(){notify('Chức năng xử lý HSMT được thực hiện tại AD.');}
 async function exportMailText(id){try{const state=await rpc('awm_mail_status',project);if(!state.online){clear();return;}const message=messages.find(x=>x.id===id);if(!message)return;await navigator.clipboard.writeText(`Tiêu đề: ${message.subject}\nNgười gửi: ${message.sender}\nNgày: ${message.date}\n\n${message.body}`);notify('Đã sao chép nội dung thư.','success');}catch(error){notify(error.message,'error');}}
 function dispose(){epoch++;folderToken++;listState=null;loading=false;queued=false;clearTimeout(timer);clearTimeout(selTimer);clear('Đã đóng Mail.');}
 window.addEventListener('bqlda_logout',dispose);
 window.addEventListener('bqlda_project_changed',event=>{epoch++;loading=false;queued=false;clearTimeout(timer);clear();if(!event?.detail?.pending&&$('page-mail')?.classList.contains('active'))init();});
 return {init,onSearch,selectMail,connectOutlook,chooseScanFolder,sendToB1Word,sendToHsmt,exportMailText,dispose,newMail,action,setReadFilter,setOfficeCategory,sortBy,toggleDateSort,loadMore,selectFolder,applyFilter,resetFilter,checkAllAccounts,toggleFilterPanel,toggleFolderPane};
})();
