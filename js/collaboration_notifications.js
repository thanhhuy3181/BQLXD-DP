'use strict';
// Polling delivers while the application is open. It is not background Web Push.
window.CollaborationNotifications=(()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let epoch=0,timer,button,dialog,toastNode,project='',seen=null,items=[],rpc,openSource;
 function closeDialog(){if(dialog){dialog.remove();dialog=null;}}
 function stop(){epoch++;clearTimeout(timer);closeDialog();button?.remove();toastNode?.remove();button=toastNode=null;project='';seen=null;items=[];}
 async function start(options){
  if(button&&project===options.project)return;
  stop();project=options.project;rpc=options.rpc;openSource=options.onOpen;const run=epoch;if(!project)return;
  button=document.createElement('button');button.type='button';button.className='cw-global-bell';button.textContent='🔔';button.setAttribute('aria-label','Thông báo công việc');button.hidden=true;document.body.append(button);
  const refresh=async()=>{
   try{const data=await rpc('collab_notifications',[project]);if(run!==epoch)return;items=data.items;button.hidden=false;button.textContent='🔔 '+data.unread;
    const fresh=seen?items.filter(x=>!seen.has(x.id)&&!x.read_at):[];seen=new Set(items.map(x=>x.id));
    if(fresh.length&&data.delivery_allowed!==false){toastNode?.remove();toastNode=document.createElement('div');toastNode.className='cw-global-toast';toastNode.setAttribute('role','alert');toastNode.textContent=fresh.length+' thông báo mới · '+fresh[0].title;document.body.append(toastNode);const current=toastNode;setTimeout(()=>current.remove(),6000);if('Notification'in window&&Notification.permission==='granted')new Notification('BQLDA',{body:fresh[0].title});}
   }catch{if(run===epoch){items=[];seen=null;if(button)button.hidden=true;closeDialog();}}
  };
  button.onclick=async()=>{await refresh();if(run!==epoch||!button||button.hidden)return;closeDialog();dialog=document.createElement('dialog');dialog.className='collaboration-workspace cw-dialog';dialog.style.minHeight='0';dialog.innerHTML=`<div class="cw-dialog-head"><h2>Thông báo</h2><button data-close>Đóng</button></div>${items.map(x=>`<button class="cw-notice ${x.read_at?'read':''}" data-notice="${esc(x.id)}">${x.read_at?'':'● '}${x.action==='due'?'⏰ ':x.action==='remind'?'◷ ':x.action==='mention'?'@ ':x.action==='message'?'💬 ':x.action==='approved'?'✓ ':x.action==='returned'?'↩ ':''}${esc(x.title)}<small>${esc(new Date(x.created_at).toLocaleString('vi-VN'))}</small></button>`).join('')||'<p>Chưa có thông báo.</p>'}<button data-permission>Bật thông báo hệ thống</button><p class="cw-hint">Thông báo cập nhật khi ứng dụng đang mở. Thiết bị cần cấp quyền để hiện thông báo hệ thống.</p>`;document.body.append(dialog);dialog.querySelector('[data-close]').onclick=closeDialog;dialog.addEventListener('cancel',closeDialog);dialog.showModal();dialog.querySelector('[data-permission]').onclick=async()=>{if('Notification'in window)await Notification.requestPermission();};dialog.querySelectorAll('[data-notice]').forEach(el=>el.onclick=async()=>{const item=items.find(x=>x.id===el.dataset.notice);try{await rpc('collab_notification_read',[project,item.id]);if(run!==epoch)return;closeDialog();if(item.source_kind==='mail_share'&&window.MailShareUI)MailShareUI.read({shareId:item.parent_id,project,rpc});else openSource?.(item.parent_id);}catch(error){if(el.isConnected)el.textContent=error.message;}});};
  await refresh();const poll=async()=>{if(run!==epoch)return;await refresh();if(run===epoch)timer=setTimeout(poll,15000);};if(run===epoch)timer=setTimeout(poll,15000);
 }
 window.addEventListener('bqlda_logout',stop);window.addEventListener('bqlda_project_changed',stop);
 return {start,stop,isRunning:()=>!!button};
})();
