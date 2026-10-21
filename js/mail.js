'use strict';
// Web Mail has one authenticated source: the paired AD bridge.
const MailModule=(()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let messages=[],category='all',query='',activeId='',project='',timer,epoch=0,lastSync='',loading=false;
 const $=id=>document.getElementById(id);
 const notify=(value,type='info')=>{if(typeof toast==='function')toast(value,type);};
 async function rpc(method,...args){const result=await API.call(method,...args);if(result?.ok!==true)throw new Error(result?.error||'Máy chủ chưa xác nhận yêu cầu.');return result.data;}
 function classify(message){const text=(message.subject+' '+message.body).toLowerCase();if(/hsmt|mời thầu|dự thầu/.test(text))return ['hsmt','HSMT'];if(/hợp đồng|hop dong/.test(text))return ['contract','Hợp đồng'];if(/thanh toán|tạm ứng|quyết toán/.test(text))return ['payment','Thanh toán'];if(/bvtk|thiết kế|bản vẽ/.test(text))return ['bvtk','BVTK'];return ['chu-truong','Khác'];}
 function normalize(message){const [key,label]=classify(message);return {...message,id:String(message.id),subject:String(message.subject||''),body:String(message.body||''),sender:String(message.sender||''),date:String(message.date||''),category:key,categoryLabel:label};}
 function status(text){const el=$('mail-bridge-status');if(el)el.textContent=text;}
 function clear(text='AD chưa kết nối.') {messages=[];activeId='';lastSync='';render();const detail=$('mail-detail-container');if(detail)detail.textContent=text;status(text);}
 function render(){
  document.querySelectorAll('.mail-cat-btn').forEach(button=>{const count=messages.filter(x=>button.dataset.cat==='all'||x.category===button.dataset.cat).length;const spans=button.querySelectorAll('span');if(spans.length>1)spans[spans.length-1].textContent=String(count);button.classList.toggle('active',button.dataset.cat===category);});
  const container=$('mail-list-container');if(!container)return;
  const rows=messages.filter(x=>(category==='all'||x.category===category)&&[x.subject,x.sender,x.body].join(' ').toLowerCase().includes(query));
  container.innerHTML=rows.length?rows.map(x=>`<button type="button" data-mail-id="${esc(x.id)}" class="mail-item w-full text-left p-3 mb-2 rounded-lg border border-[#2E2E2A] bg-[#1E1E1C] text-[#EDEDEA]"><strong>${esc(x.sender)}</strong><small class="block text-[#888780]">${esc(x.date)}</small><b class="block mt-1">${esc(x.subject)}</b><p class="text-xs text-[#908CAA]">${esc(x.body.slice(0,120))}</p><small>${esc(x.categoryLabel)}${x.attachments?.length?' · 📎 '+x.attachments.length+' tên tệp':''}</small></button>`).join(''):'<p class="p-4 text-xs text-[#908CAA]">Chưa có thư phù hợp từ AD.</p>';
  container.querySelectorAll('[data-mail-id]').forEach(el=>el.onclick=()=>selectMail(el.dataset.mailId));
  if($('mail-total-count'))$('mail-total-count').textContent=rows.length+' thư';
 }
 async function refresh(force=false){
  if(loading)return;loading=true;const run=epoch;
  try{
   const projects=await rpc('get_projects_bar_data');if(run!==epoch)return;
   const next=projects.current_project||'';if(next!==project){project=next;clear('Đang đổi dự án…');force=true;}
   const state=await rpc('awm_mail_status',project);if(run!==epoch)return;
   if(!state.online){clear('AD chưa kết nối hoặc nguồn Outlook đang lỗi. Mở AD để xem Mail.');return;}
   const info=state.scan_info;status(`AD đang kết nối · Mail cập nhật ${state.last_sync?new Date(state.last_sync).toLocaleString('vi-VN'):'chưa có'}${info?' · '+info.scan_limit+' thư gần nhất / '+info.total_inbox+' mục Inbox':''}`);
   if(force||state.last_sync!==lastSync){const data=await rpc('awm_mail_list',project,'');if(run!==epoch)return;messages=(data.items||[]).map(normalize);lastSync=data.last_sync||'';render();if(activeId){const current=messages.find(x=>x.id===activeId);if(current)renderDetail(current);else if($('mail-detail-container'))$('mail-detail-container').textContent='Thư không còn trong nguồn đồng bộ hiện tại.';}}
  }catch(error){if(run===epoch)clear(error.message);}
  finally{if(run===epoch)loading=false;}
 }
 async function init(){
  const run=++epoch;loading=false;clearTimeout(timer);
  if(!$('mail-bridge-status')){const list=$('mail-list-container');if(list){const el=document.createElement('p');el.id='mail-bridge-status';el.className='p-2 text-xs text-[#908CAA]';el.setAttribute('role','status');list.parentElement.insertBefore(el,list);}}
  clear('Đang kiểm tra kết nối AD…');await refresh(true);
  const poll=async()=>{if(run!==epoch)return;await refresh();timer=setTimeout(poll,5000);};if(run===epoch)timer=setTimeout(poll,5000);
 }
 async function selectMail(id){
  const run=epoch;
  try{const state=await rpc('awm_mail_status',project);if(run!==epoch)return;if(!state.online){clear();return;}const data=await rpc('awm_mail_list',project,'');if(run!==epoch)return;messages=(data.items||[]).map(normalize);const message=messages.find(x=>x.id===id);if(!message){clear('Thư không còn trong nguồn đồng bộ hiện tại.');return;}activeId=id;renderDetail(message);}
  catch(error){if(run===epoch)clear(error.message);}
 }
 function renderDetail(message){
  const container=$('mail-detail-container');if(!container)return;
  container.innerHTML=`<div class="p-4 h-full overflow-auto text-[#EDEDEA]"><h2 class="text-lg font-bold">${esc(message.subject)}</h2><p class="text-xs text-[#908CAA]">${esc(message.sender)} · ${esc(message.email||'')} · ${esc(message.date)}</p><div class="my-3 flex gap-2"><button type="button" data-mail-action="share" class="btn btn-sm">Chia sẻ cho cán bộ</button><button type="button" data-mail-action="copy" class="btn btn-sm">Sao chép nội dung</button></div><div class="whitespace-pre-wrap text-sm leading-relaxed">${esc(message.body)}</div>${message.attachments?.length?'<div class="mt-4 text-xs"><b>Tên tệp trong Outlook</b><ul>'+message.attachments.map(x=>'<li>📎 '+esc(x)+'</li>').join('')+'</ul><p>Nội dung tệp đính kèm Outlook chưa đồng bộ qua cầu Mail hiện tại.</p></div>':''}</div>`;
  container.querySelector('[data-mail-action="copy"]').onclick=()=>exportMailText(message.id);
  container.querySelector('[data-mail-action="share"]').onclick=()=>{if(window.MailShareUI)window.MailShareUI.open({mailId:message.id,project,rpc:(method,args)=>rpc(method,...args)});else notify('Màn hình chia sẻ Mail chưa được tải.','error');};
 }
 function setCategory(value){category=value;render();}
 function onSearch(value){query=String(value||'').trim().toLowerCase();render();}
 async function connectOutlook(){await refresh(true);}
 function chooseScanFolder(){notify('Quét Outlook và chọn nguồn Mail tại AD; AwD nhận dữ liệu đã đồng bộ.');}
 function sendToB1Word(){notify('Chức năng tạo Word được thực hiện tại AD.');}
 function sendToHsmt(){notify('Chức năng xử lý HSMT được thực hiện tại AD.');}
 async function exportMailText(id){try{const state=await rpc('awm_mail_status',project);if(!state.online){clear();return;}const message=messages.find(x=>x.id===id);if(!message)return;await navigator.clipboard.writeText(`Tiêu đề: ${message.subject}\nNgười gửi: ${message.sender}\nNgày: ${message.date}\n\n${message.body}`);notify('Đã sao chép nội dung thư.','success');}catch(error){notify(error.message,'error');}}
 function dispose(){epoch++;loading=false;clearTimeout(timer);clear('Đã đóng Mail.');}
 window.addEventListener('bqlda_logout',dispose);
 window.addEventListener('bqlda_project_changed',event=>{epoch++;loading=false;clearTimeout(timer);clear();if(!event?.detail?.pending&&$('page-mail')?.classList.contains('active'))init();});
 return {init,setCategory,onSearch,selectMail,connectOutlook,chooseScanFolder,sendToB1Word,sendToHsmt,exportMailText,dispose};
})();
