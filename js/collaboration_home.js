'use strict';
window.MailShareUI=(()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let dialog,epoch=0,poll;
 function close(){epoch++;clearTimeout(poll);if(dialog){dialog.remove();dialog=null;}}
 function show(html){close();dialog=document.createElement('dialog');dialog.className='collaboration-workspace cw-dialog';dialog.style.minHeight='0';dialog.innerHTML='<div class="cw-dialog-head"><b>Mail chia sẻ</b><button type="button" data-close>Đóng</button></div>'+html;document.body.append(dialog);dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',close);dialog.showModal();}
 async function open({mailId,project,rpc}){
  show('<p>Đang tải danh sách cán bộ…</p>');const run=epoch;
  try{const data=await rpc('mailshare_candidates',[project]);if(run!==epoch)return;
   dialog.insertAdjacentHTML('beforeend',`<form class="cw-form"><label>Cán bộ nhận<select name="recipients" multiple size="6" required>${data.members.map(x=>`<option value="${esc(x.username)}">${esc(x.fullname)} (${esc(x.username)})</option>`).join('')}</select></label><label>Lời nhắn<textarea name="note" maxlength="2000"></textarea></label><p data-error></p><button type="submit">Chia sẻ thư</button></form>`);
   let requestId=crypto.randomUUID(),previous='';const form=dialog.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;try{const recipients=[...form.elements.recipients.selectedOptions].map(x=>x.value),note=form.elements.note.value,signature=JSON.stringify({recipients,note});if(previous&&previous!==signature)requestId=crypto.randomUUID();previous=signature;await rpc('mailshare_create',[project,{request_id:requestId,mail_id:mailId,recipients,note}]);if(run===epoch)close();}catch(error){if(run===epoch)form.querySelector('[data-error]').textContent=error.message;}finally{if(submit.isConnected)submit.disabled=false;}};
  }catch(error){if(run===epoch)dialog.insertAdjacentHTML('beforeend','<p>'+esc(error.message)+'</p>');}
 }
 async function read({shareId,project,rpc}){
  show('<div data-mail-live>Đang kiểm tra AD nguồn…</div>');const run=epoch;let saved=false;
  const refresh=async()=>{try{const data=await rpc('mailshare_read',[project,shareId]);if(run!==epoch||!dialog)return;const mail=data.message;dialog.querySelector('[data-mail-live]').innerHTML=`<h2>${esc(mail.subject)}</h2><p>${esc(mail.sender)} · ${esc(mail.date)}</p><p>${esc(data.share.note)}</p><div class="cw-body">${esc(mail.body)}</div>${mail.attachments?.length?'<p>Tên tệp trong Outlook: '+mail.attachments.map(esc).join(', ')+'</p>':''}<p class="cw-hint">AD nguồn đang kết nối; Mail cập nhật ${esc(new Date(data.last_sync).toLocaleString('vi-VN'))}. Nội dung tệp đính kèm Outlook cần cầu đồng bộ tệp riêng.</p><div style="margin-top:12px"><button type="button" class="cw-mini-btn" data-save-mail-note ${saved?'disabled':''}>${saved?'✓ Đã lưu vào ghi chú':'Lưu vào ghi chú'}</button><span data-save-mail-status class="cw-hint" style="margin-left:8px"></span></div>`;const saveBtn=dialog.querySelector('[data-save-mail-note]');if(saveBtn&&!saved){saveBtn.onclick=async()=>{saveBtn.disabled=true;const statusEl=dialog.querySelector('[data-save-mail-status]');try{await rpc('collab_create',[project,'note',{request_id:crypto.randomUUID(),title:'Thư: '+(mail.subject||'Không có tiêu đề'),body:(mail.sender?'Từ: '+mail.sender+'\n':'')+(mail.body||''),source_id:shareId}]);saved=true;saveBtn.textContent='✓ Đã lưu vào ghi chú';if(statusEl)statusEl.textContent='Đã lưu thư vào ghi chú.';const toast=document.querySelector('[data-cw="toast"]')||document.querySelector('.cw-global-toast');if(toast){toast.textContent='Đã lưu thư vào ghi chú.';toast.hidden=false;setTimeout(()=>{if(toast.isConnected)toast.hidden=true;},5000);}}catch(err){saveBtn.disabled=false;if(statusEl){statusEl.textContent='Lỗi: '+err.message;statusEl.style.color='#a42636';}}};}poll=setTimeout(refresh,5000);}catch(error){if(run===epoch&&dialog){dialog.querySelector('[data-mail-live]').textContent=error.message;poll=setTimeout(refresh,5000);}}};await refresh();
 }
 window.addEventListener('bqlda_logout',close);window.addEventListener('bqlda_project_changed',close);
 return {open,read,close};
})();

window.CollaborationHome=(()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let epoch=0,root,timer;
 function unmount(){epoch++;clearTimeout(timer);if(root)root.innerHTML='';root=null;}
 async function mount(container,{rpc,project,onOpenTask}){
  unmount();root=container;const run=epoch;if(!root||!project)return;
  root.className='collaboration-workspace collaboration-home';root.innerHTML='<p>Đang tải công việc và thông tin của bạn…</p>';
  async function refresh(){
   const results=await Promise.allSettled([rpc('collab_home',[project]),rpc('mailshare_list',[project])]);if(run!==epoch||!root?.isConnected)return;
   const work=results[0].status==='fulfilled'?results[0].value:null,mail=results[1].status==='fulfilled'?results[1].value:null;
   const layout=work?.layout||'personal',title=layout==='management'?'Điều hành công việc':layout==='office'?'Điều phối và hồ sơ':'Không gian làm việc của tôi';
   const mine=layout==='management'?(work?.scope_work||[]):work?.my_work||[],overdue=mine.filter(x=>x.display_status?.color==='overdue'),today=mine.filter(x=>x.due_date===work?.today&&!['done','cancelled'].includes(x.status));
   const cards=(items,empty)=>items.length?items.map(x=>`<button type="button" class="cw-home-task ${x.status==='done'?'cw-state-done':''}" data-home-task="${esc(x.id)}"><strong>${esc(x.title)}</strong><small>${esc(x.display_status?.label||x.status)} · ${esc(x.due_date||'Chưa đặt hạn')}</small></button>`).join(''):`<p class="cw-hint">${empty}</p>`;
   const widgets={
    summary:work?`<section data-home-widget="summary"><h3>Kết quả trong phạm vi được xem</h3><div class="cw-stats">${[['Việc hôm nay',today.length],['Quá hạn',overdue.length],['Chờ tôi nghiệm thu',work.review.length],['Hoàn thành',work.summary.done]].map(([label,value])=>`<div><small>${label}</small><strong>${value}</strong></div>`).join('')}</div></section>`:'',
    today:work?`<section data-home-widget="today"><h3>Hôm nay và quá hạn</h3>${cards([...new Map([...overdue,...today].map(x=>[x.id,x])).values()],'Chưa có việc đến hạn trong phạm vi đã tải.')}</section>`:'',
    tasks:work?`<section data-home-widget="tasks"><h3>${layout==='management'?'Công việc đang mở':'Phản hồi và việc được giao'}</h3>${cards(mine.filter(x=>!['done','cancelled'].includes(x.status)).slice(0,12),'Chưa có yêu cầu cần xử lý.')}</section>`:'',
    review:work?`<section data-home-widget="review"><h3>Chờ tôi nghiệm thu</h3>${cards(work.review,'Không có kết quả chờ bạn duyệt.')}</section>`:'',
    support:work?`<section data-home-widget="support"><h3>Việc đột xuất cần xử lý</h3>${cards(work.support,'Chưa có việc đột xuất trong phạm vi được xem.')}</section>`:'',
    mail:`<section data-home-widget="mail"><h3>Mail mới được chia sẻ</h3>${mail?.items?.length?mail.items.map(x=>`<button type="button" class="cw-home-task" data-home-mail="${esc(x.id)}"><strong>${esc(x.subject||'Thư được chia sẻ')}</strong><small>${esc(x.owner)} · ${x.online?(x.available?'AD đang kết nối':'Thư không còn trong lô Mail hiện tại'):'AD nguồn chưa kết nối'}</small><p>${esc(x.note)}</p></button>`).join(''):'<p class="cw-hint">Chưa có Mail được chia sẻ trong phạm vi bạn được xem.</p>'}</section>`
   };
   const defaults=layout==='management'?['summary','review','support','tasks','mail']:['summary','today','tasks','mail'],configured=work?.preferences?.settings?.home_widgets||[],order=configured.length?configured:defaults;
   root.innerHTML=`<header class="cw-header"><div><h2>${title}</h2><p>${esc(project)}${work?' · '+esc(work.role):''}</p></div><button type="button" data-home-refresh>Làm mới</button></header>${work?'':'<p class="cw-hint">Chưa có quyền xem công việc dùng chung.</p>'}<div class="cw-home-grid">${order.map(key=>widgets[key]||'').join('')}</div>`;
   root.querySelector('[data-home-refresh]').onclick=refresh;root.querySelectorAll('[data-home-task]').forEach(el=>el.onclick=()=>onOpenTask?.(el.dataset.homeTask));root.querySelectorAll('[data-home-mail]').forEach(el=>el.onclick=()=>MailShareUI.read({shareId:el.dataset.homeMail,project,rpc}));
  }
  await refresh();const poll=async()=>{if(run!==epoch||!root?.isConnected)return;await refresh();timer=setTimeout(poll,30000);};if(run===epoch)timer=setTimeout(poll,30000);
 }
 window.addEventListener('bqlda_logout',unmount);window.addEventListener('bqlda_project_changed',unmount);
 return {mount,unmount};
})();
