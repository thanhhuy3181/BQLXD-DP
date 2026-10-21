'use strict';
// A single workspace renderer for AwD and AwM; all mutations go to the same API.
window.CollaborationWorkspace = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {assigned:'Đã giao',accepted:'Đã nhận',working:'Đang làm',review:'Chờ nghiệm thu',done:'Hoàn thành',paused:'Tạm dừng',cancelled:'Đã hủy'};
  let root, rpc, project, bootstrap, kind='task', epoch=0, loadTicket=0, detailTicket=0, timer, items=[], nextOffset=null, busy=false, weekOffset=0,calendarData=null,seenNotices=null;
  const $ = id => root?.querySelector(`[data-cw="${id}"]`);
  const button = (label, action, cls='') => `<button type="button" data-action="${action}" class="${cls}">${label}</button>`;
  const selectPeople = (name, multiple=false, selected=[]) => `<select name="${name}" ${multiple?'multiple size="4"':''}>${multiple?'':'<option value="">Không chọn</option>'}${bootstrap.members.map(p=>`<option value="${esc(p.username)}" ${selected.includes(p.username)?'selected':''}>${esc(p.fullname)} (${esc(p.username)})</option>`).join('')}</select>`;
  const getPeople = (form,name) => [...form.elements[name].selectedOptions].map(x=>x.value).filter(Boolean);
  const input = (form,name) => form.elements[name]?.value || '';
  const field = (label,html) => `<label>${label}${html}</label>`;
  const bangkokDay = value => new Date(Date.parse(value)+7*3600000).toISOString().slice(0,10);
  const dayShift = (day,offset) => new Date(Date.parse(day+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);
  const reportLabels={current_state:'Tình trạng hiện tại',solution:'Giải pháp khắc phục',work_done:'Công việc đã thực hiện',support_needed:'Vướng mắc cần hỗ trợ'};
  const reportForm=values=>Object.entries(reportLabels).map(([key,label])=>field(label,`<textarea name="${key}" rows="2" maxlength="5000" required>${esc(values?.[key]||'')}</textarea>`)).join('');
  const readReport=form=>Object.fromEntries(Object.keys(reportLabels).map(key=>[key,input(form,key)]));
  function message(value,error=false) { const target=$('status');if(target){target.textContent=value;target.dataset.error=String(error);} }
  function close(){ const dialog=$('dialog'); if(dialog?.open)dialog.close(); }
  function sheet(html){const dialog=$('dialog');dialog.innerHTML=`<div class="cw-dialog-head"><strong>Không gian công việc</strong>${button('Đóng','close')}</div>${html}`;dialog.querySelector('[data-action="close"]').onclick=close;if(!dialog.open)dialog.showModal();}
  function safeLinks(links){return (links || []).map(link=>{try{const url=new URL(link.url);if(url.protocol!=='https:')return '';return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(link.title)}</a>`;}catch{return '';}}).join(' · ');}
  function parseLinks(value) {
    return String(value).split('\n').map(x=>x.trim()).filter(Boolean).map(line=>{
      const [title,url,kind='',record_id='']=line.split('|').map(x=>x.trim());
      if(!title||!url)throw new Error('Mỗi tài liệu nhập: Tên | https://địa-chỉ | Loại hồ sơ | Mã hồ sơ');
      return {title,url,kind,record_id};
    });
  }
  async function write(form, work) {
    if(busy)return;busy=true;const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;
    const run=epoch;
    try{await work();if(run!==epoch)return;close();message('Đã lưu trên hệ thống dùng chung.');await load();}
    catch(error){if(run===epoch){const target=form.querySelector('[data-form-error]');if(target)target.textContent=error.message;message(error.message,true);}}
    finally{busy=false;if(submit?.isConnected)submit.disabled=false;}
  }
  function loadMoreButton(){return nextOffset!==null?button('Tải thêm','more'):'';}
  function draw() {
    if(kind==='daily'){drawDaily();return;}
    $('list').innerHTML=items.length?items.map(item=>`<button type="button" class="cw-card" data-id="${esc(item.id)}"><div><span class="cw-kind">${esc(item.kind==='task'?labels[item.status]:item.kind==='event'?new Date(item.starts_at).toLocaleString('vi-VN'):item.kind==='conversation'?'Hội thoại':'Ghi chú')}</span>${item.priority==='high'?'<span class="cw-urgent">Ưu tiên cao</span>':''}</div><strong>${esc(item.title)}</strong><p>${esc(item.body?.slice(0,160)||'')}</p><small>${item.kind==='task'?`Phụ trách: ${esc(item.assignee)} · Hạn: ${esc(item.due_date||'Chưa đặt')}`:`Tạo bởi ${esc(item.owner)}`}</small><div>${(item.tags||[]).map(t=>`<span class="cw-tag">${esc(t)}</span>`).join('')}</div></button>`).join(''):'<div class="cw-empty">Chưa có dữ liệu trong phạm vi bạn được xem.</div>';
    $('more').innerHTML=loadMoreButton();const more=$('more').querySelector('button');if(more)more.onclick=()=>load(true);
    $('list').querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>detail(el.dataset.id));
    $('list').querySelectorAll('.cw-card').forEach(el=>{if(['done','cancelled'].includes(items.find(x=>x.id===el.dataset.id)?.status))el.classList.add('cw-state-done');});
  }
  async function load(more=false) {
    const run=epoch, ticket=++loadTicket, offset=more?nextOffset:0;if(offset===null)return;
    try{const apiKind=['daily','incident'].includes(kind)?'task':kind;const result=await rpc('collab_list',[project,apiKind,offset,['daily','incident'].includes(kind)?kind:'']);if(run!==epoch||ticket!==loadTicket||!root?.isConnected)return;
      items=more?[...items,...result.items]:result.items;nextOffset=result.next_offset;draw();
    }catch(error){if(run===epoch)message(error.message,true);}
  }
  function newForm(overrideKind, initialData = {}) {
    const selectedKind=overrideKind || (['daily','incident'].includes(kind)?'task':kind),taskType=['daily','incident'].includes(kind)?kind:'general';
    if(selectedKind==='topic'&&!bootstrap.can_assign){message('Bạn chưa được cấp quyền giao báo cáo chuyên đề.',true);return;}
    const taskFields=selectedKind==='task'?field('Công trình',`<input name="construction" maxlength="200" value="${esc(initialData.construction||'')}">`)+field('Hạng mục',`<input name="section" maxlength="200" value="${esc(initialData.section||'')}">`)+field('Người chịu trách nhiệm',selectPeople('assignee',false,[initialData.assignee||bootstrap.user.username]))+
      field('Người phối hợp',selectPeople('collaborators',true,initialData.collaborators||[]))+field('Người nghiệm thu (để trống cho việc cá nhân)',selectPeople('reviewer',false,[initialData.reviewer||'']))+
      field('Hạn xử lý',`<input name="due_date" type="date" value="${esc(initialData.due_date||'')}">`)+field('Ưu tiên','<select name="priority"><option value="normal">Bình thường</option><option value="high">Cao</option><option value="low">Thấp</option></select>')+
      field('Checklist, mỗi bước một dòng',`<textarea name="checklist" rows="3">${esc((initialData.checklist||[]).join('\n'))}</textarea>`):'';
    const memberField=selectedKind!=='task'?field(selectedKind==='note'?'Chia sẻ với (để trống là riêng tư)':selectedKind==='topic'?'Cán bộ phải phản hồi':'Thành viên',selectPeople('members',true,initialData.members||[])):'';
    const eventFields=selectedKind==='event'?field('Bắt đầu',`<input type="datetime-local" name="starts_at" value="${esc(initialData.starts_at||'')}" required>`)+field('Kết thúc',`<input type="datetime-local" name="ends_at" value="${esc(initialData.ends_at||'')}" required>`)+field('Hạn nộp báo cáo',`<input type="datetime-local" name="reporting_deadline" value="${esc(initialData.reporting_deadline||'')}">`):'';
    const extra=selectedKind==='topic'?field('Hạn phản hồi',`<input name="due_date" type="date" value="${esc(initialData.due_date||'')}" required>`):selectedKind==='note'?field('Kiểu ghi chú',`<select name="note_type"><option value="text" ${initialData.note_type==='text'?'selected':''}>Văn bản</option><option value="task" ${initialData.note_type==='task'?'selected':''}>Checklist</option><option value="table" ${initialData.note_type==='table'?'selected':''}>Bảng task</option></select>`)+field('Các dòng công việc (mỗi dòng: Nội dung | YYYY-MM-DD | Ghi chú)',`<textarea name="rows" rows="4">${esc(initialData.rows_text||'')}</textarea>`):'';
    sheet(`<h2>${({task:taskType==='incident'?'Báo việc đột xuất':taskType==='daily'?'Thêm tồn đọng':'Tạo công việc',topic:'Yêu cầu báo cáo chuyên đề',conversation:'Tạo hội thoại riêng / nhóm',event:'Tạo sự kiện / báo cáo chung',note:'Tạo ghi chú'})[selectedKind]}</h2><form data-cw="form" class="cw-form">${field('Tiêu đề',`<input name="title" required maxlength="180" value="${esc(initialData.title||'')}">`)}${field('Nội dung',`<textarea name="body" maxlength="10000" rows="4">${esc(initialData.body||'')}</textarea>`)}${taskFields}${memberField}${eventFields}${extra}${field('Tag, ngăn cách bằng dấu phẩy',`<input name="tags" placeholder="${esc(bootstrap.tags.join(', '))}" value="${esc((initialData.tags||[]).join(', '))}">`)}${field('Liên kết tài liệu: Tên | HTTPS URL | Loại hồ sơ | Mã hồ sơ','<textarea name="links" rows="3"></textarea>')}<p class="cw-hint">Chia sẻ liên kết không cấp thêm quyền tại nguồn tài liệu. Chỉ chia sẻ nội dung được phép.</p><p data-form-error role="alert"></p><button type="submit">Tạo</button></form>`);
    const form=$('form');if(!bootstrap.can_assign&&form.elements.assignee&&taskType!=='incident'){form.elements.assignee.value=bootstrap.user.username;form.elements.assignee.disabled=true;form.elements.collaborators.disabled=true;}
    let requestId=crypto.randomUUID(),previous='';
    form.onsubmit=e=>{e.preventDefault();write(form,async()=>{
      const payload={title:input(form,'title'),body:input(form,'body'),tags:input(form,'tags').split(',').map(x=>x.trim()).filter(Boolean),links:parseLinks(input(form,'links'))};
      if(selectedKind==='task')Object.assign(payload,{task_type:taskType,construction:input(form,'construction'),section:input(form,'section'),assignee:input(form,'assignee')||bootstrap.user.username,collaborators:getPeople(form,'collaborators'),reviewer:input(form,'reviewer'),due_date:input(form,'due_date'),priority:input(form,'priority'),checklist:input(form,'checklist').split('\n').map(x=>x.trim()).filter(Boolean)});
      else payload.members=getPeople(form,'members');
      if(selectedKind==='event'){payload.starts_at=new Date(input(form,'starts_at')).toISOString();payload.ends_at=new Date(input(form,'ends_at')).toISOString();payload.reporting_deadline=input(form,'reporting_deadline')?new Date(input(form,'reporting_deadline')).toISOString():'';}
      if(selectedKind==='topic'){payload.respondents=payload.members;payload.due_date=input(form,'due_date');}
      if(selectedKind==='note'){payload.note_type=input(form,'note_type');payload.rows=input(form,'rows').split('\n').filter(x=>x.trim()).map(line=>{const[title,due_date='',notes='']=line.split('|').map(x=>x.trim());return {title,due_date,notes};});}
      const signature=JSON.stringify(payload);if(previous&&signature!==previous)requestId=crypto.randomUUID();previous=signature;payload.request_id=requestId;
      if(selectedKind==='topic')await rpc('collab_topic_create',[project,payload]);else await rpc('collab_create',[project,selectedKind,payload]);
    });};
  }
  async function drawDaily(){
    const run=epoch,ticket=loadTicket,today=calendarData?.today||bangkokDay(new Date().toISOString());
    const base=dayShift(today,-((new Date(today+'T12:00:00Z').getUTCDay()+6)%7)+weekOffset*7),days=Array.from({length:7},(_,i)=>dayShift(base,i));
    try{const updates=await rpc('collab_daily_matrix',[project,days[0],days[6]]);if(run!==epoch||ticket!==loadTicket)return;
      $('list').innerHTML=`<div class="cw-table-scroll"><table class="cw-daily-table"><thead><tr>${['STT','Công trình','Hạng mục','Nội dung tồn tại','Hạn hoàn thành','Cán bộ phụ trách','Tình trạng','Còn lại',...days.map(x=>x.slice(8)+'/'+x.slice(5,7))].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${items.map((item,index)=>{
        const state=statusInfo(item,today);return `<tr class="cw-state-${state.color}"><td>${index+1}</td><td>${esc(item.construction)}</td><td>${esc(item.section)}</td><td>${button(esc(item.title),'open-'+item.id)}</td><td>${esc(item.due_date||'')}</td><td>${esc(item.assignee)}</td><td><span class="cw-state-badge">${state.label}</span></td><td>${state.remaining}</td>${days.map(day=>{const rows=updates.items.filter(x=>x.parent_id===item.id&&x.report_date===day);return `<td>${button(rows.length?`${rows.length} cập nhật · ${Math.max(...rows.map(x=>x.progress))}%`:'＋',`day-${item.id}-${day}`)}</td>`;}).join('')}</tr>`;}).join('')}</tbody></table></div>${updates.truncated?'<p>Khoảng ngày có hơn 1.000 cập nhật; hãy thu hẹp phạm vi.</p>':''}`;
      $('list').querySelectorAll('[data-action^="open-"]').forEach(el=>el.onclick=()=>detail(el.dataset.action.slice(5)));
      $('list').querySelectorAll('[data-action^="day-"]').forEach(el=>el.onclick=()=>{const id=el.dataset.action.slice(4,40),day=el.dataset.action.slice(41);dailyForm(items.find(x=>x.id===id),day,updates.items.filter(x=>x.parent_id===id&&x.report_date===day));});
      $('more').innerHTML=loadMoreButton();$('more').querySelector('button')?.addEventListener('click',()=>load(true));
    }catch(error){if(run===epoch)message(error.message,true);}
  }
  function statusInfo(task,today){
    const days=task.due_date?Math.round((Date.parse(task.due_date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000):null;
    if(['done','cancelled'].includes(task.status))return {label:labels[task.status],color:'done',remaining:task.status==='done'?'Đã hoàn thành':''};
    if(days!==null&&days<0)return {label:'Quá hạn'+(task.status==='review'?' · Chờ nghiệm thu':''),color:'overdue',remaining:`Quá ${-days} ngày`};
    return {label:task.status==='review'?'Chờ nghiệm thu':days===0?'Đến hạn hôm nay':task.start_date&&task.start_date>today?'Chưa tới hạn':['working','accepted'].includes(task.status)?'Đang thực hiện':'Đã giao',color:task.status==='review'?'review':days===0?'today':'working',remaining:days===null?'Chưa đặt hạn':days===0?'Hôm nay':`Còn ${days} ngày`};
  }
  function dailyForm(item,day,rows=[]){
    const own=rows.find(x=>x.owner===bootstrap.user.username),canWrite=bootstrap.can_write&&[item.assignee,...(item.collaborators||[])].includes(bootstrap.user.username)&&!['done','cancelled'].includes(item.status)&&day<=(calendarData?.today||bangkokDay(new Date().toISOString()));
    sheet(`<h2>${esc(item.title)} · ${esc(day)}</h2>${rows.map(row=>`<article class="cw-report"><b>${esc(row.owner)} · ${row.progress}%</b>${Object.entries(reportLabels).map(([key,label])=>`<p><b>${label}:</b> ${esc(row.fields[key])}</p>`).join('')}${safeLinks(row.links)}</article>`).join('')}${canWrite?`<h3>${own?'Cập nhật báo cáo của tôi':'Báo cáo tình hình thực hiện'}</h3><form data-cw="daily-form" class="cw-form">${reportForm(own?.fields)}${field('Tiến độ (%)',`<input name="progress" type="number" min="0" max="100" value="${own?.progress||0}" required>`)}${field('Tài liệu: Tên | HTTPS URL | Loại | Mã','<textarea name="links" rows="2"></textarea>')}<p data-form-error role="alert"></p><button type="submit">Lưu báo cáo ngày</button></form>`:'<p>Bạn chỉ được xem cập nhật trong ngày này.</p>'}${button('Mở công việc / gửi ảnh, tệp','source')}`);
    $('dialog').querySelector('[data-action="source"]').onclick=()=>detail(item.id);
    const form=$('daily-form');if(form)form.onsubmit=e=>{e.preventDefault();write(form,()=>rpc('collab_daily_save',[project,item.id,{date:day,revision:own?.revision||0,fields:readReport(form),progress:Number(input(form,'progress')),links:parseLinks(input(form,'links'))}]));};
  }
  async function calendar(){
    const run=epoch;
    try{const [data,events]=await Promise.all([rpc('collab_home',[project]),rpc('collab_list',[project,'event',0])]);if(run!==epoch||!$('calendar'))return;const initial=!calendarData,oldScroll=$('calendar').querySelector('.cw-week')?.scrollLeft||0;calendarData=data;
      const today=data.today,base=dayShift(today,-((new Date(today+'T12:00:00Z').getUTCDay()+6)%7)+weekOffset*7),days=Array.from({length:7},(_,i)=>dayShift(base,i));
      const tasks=[...new Map([...data.my_work,...data.review].map(x=>[x.id,x])).values()];
      $('calendar').innerHTML=`<div class="cw-calendar-head"><strong>Lịch công việc · ${days[0]} — ${days[6]}</strong><div>${button('‹ Tuần trước','previous')}${button('Hôm nay','today')}${button('Tuần sau ›','next')}</div></div><div class="cw-week">${days.map((day,i)=>`<section class="cw-day ${day===today?'is-today':''}"><b>${['T2','T3','T4','T5','T6','T7','CN'][i]} · ${day.slice(8)}/${day.slice(5,7)}</b>${tasks.filter(x=>x.due_date===day).map(x=>`<button data-calendar-id="${esc(x.id)}" class="cw-calendar-task cw-state-${statusInfo(x,today).color} ${x.status==='done'?'cw-state-done':''}">${x.status==='done'?'✓ ':''}${esc(x.title)}</button>`).join('')}${events.items.filter(x=>bangkokDay(x.starts_at)===day).map(x=>`<button class="cw-calendar-task cw-event" data-calendar-id="${esc(x.id)}">◷ ${esc(x.title)}${x.reporting_deadline?`<span class="cw-deadline-badge">Hạn BC: ${new Date(x.reporting_deadline).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</span>`:''}</button>`).join('')}</section>`).join('')}</div><div class="cw-overdue"><b>Quá hạn chưa xử lý:</b> ${tasks.filter(x=>x.due_date&&x.due_date<today&&!['done','cancelled'].includes(x.status)).map(x=>{const diff=Math.round((Date.parse(today+'T00:00:00Z')-Date.parse(x.due_date+'T00:00:00Z'))/86400000);return `<button data-calendar-id="${esc(x.id)}">${esc(x.title)} · <span class="cw-overdue-days">Quá ${diff} ngày</span></button>`;}).join('')||'Không có trong phạm vi đã tải'}</div>`;
      $('calendar').querySelectorAll('[data-calendar-id]').forEach(el=>el.onclick=()=>detail(el.dataset.calendarId));
      const week=$('calendar').querySelector('.cw-week'),current=week.querySelector('.is-today');week.scrollLeft=initial&&current?Math.max(0,current.offsetLeft-week.offsetLeft-(week.clientWidth-current.clientWidth)/2):oldScroll;
      for(const[action,step]of[['previous',-1],['today',0],['next',1]])$('calendar').querySelector(`[data-action="${action}"]`).onclick=()=>{weekOffset=step===0?0:weekOffset+step;calendar();if(kind==='daily')drawDaily();};
    }catch(error){if(run===epoch&&$('calendar'))$('calendar').textContent=error.message;}
  }
  async function notifications(open=false){
    const run=epoch;
    try{const data=await rpc('collab_notifications',[project]);if(run!==epoch)return;const buttonEl=root.querySelector('[data-action="notifications"]');if(buttonEl)buttonEl.textContent=`🔔 ${data.unread}`;
      const fresh=seenNotices?data.items.filter(x=>!seenNotices.has(x.id)&&!x.read_at):[];seenNotices=new Set(data.items.map(x=>x.id));
      if(fresh.length&&data.delivery_allowed!==false&&!window.CollaborationNotifications?.isRunning?.()){message(`Có ${fresh.length} thông báo mới.`);const toast=$('toast');if(toast){toast.textContent=fresh[0].title;toast.hidden=false;setTimeout(()=>{if(toast.isConnected)toast.hidden=true;},5000);}if('Notification'in window&&Notification.permission==='granted')new Notification('BQLDA',{body:fresh[0].title});}
      if(open){sheet(`<h2>Thông báo</h2>${data.items.map(x=>`<button class="cw-notice ${x.read_at?'read':''}" data-notice-id="${esc(x.id)}" data-parent-id="${esc(x.parent_id)}">${x.read_at?'':'● '}${esc(x.title)}<small>${esc(new Date(x.created_at).toLocaleString('vi-VN'))}</small></button>`).join('')||'<p>Chưa có thông báo.</p>'}${button('Bật thông báo hệ thống','permission')}`);$('dialog').querySelectorAll('[data-notice-id]').forEach(el=>el.onclick=async()=>{try{await rpc('collab_notification_read',[project,el.dataset.noticeId]);await detail(el.dataset.parentId);}catch(error){message(error.message,true);}});$('dialog').querySelector('[data-action="permission"]').onclick=async()=>{if(!('Notification'in window)){message('Thiết bị này chưa hỗ trợ thông báo hệ thống.',true);return;}const permission=await Notification.requestPermission();message(permission==='granted'?'Đã bật thông báo khi ứng dụng đang mở.':'Thông báo trong app vẫn hoạt động.');};}
    }catch(error){if(run===epoch)message(error.message,true);}
  }
  async function attachments(item,run,ticket){
    try{const data=await rpc('collab_attachments',[project,item.id]);if(run!==epoch||ticket!==detailTicket||!$('attachments'))return;
      $('attachments').innerHTML=`<h3>Ảnh và tài liệu</h3>${data.items.map(x=>`<div class="cw-attachment-item"><button type="button" data-file-id="${esc(x.id)}">${x.mime.startsWith('image/')?'▧':'▤'} ${esc(x.filename)} · ${Math.ceil(x.size/1024)} KB</button>${bootstrap.can_write?`<button type="button" class="cw-mini-btn" data-save-att-note="${esc(x.id)}" data-file-name="${esc(x.filename)}">Lưu vào ghi chú</button>`:''}</div>`).join('')||'<p>Chưa có tệp.</p>'}${bootstrap.can_write?'<form data-cw="upload" class="cw-form"><label>Gửi ảnh / tệp (tối đa 1 MB mỗi tệp)<input name="files" type="file" multiple required></label><p class="cw-hint">Tệp lớn dùng liên kết tài liệu ở biểu mẫu công việc hoặc báo cáo.</p><p data-form-error role="alert"></p><button type="submit">Gửi tệp</button></form>':''}`;
      $('attachments').querySelectorAll('[data-file-id]').forEach(el=>el.onclick=async()=>{try{const file=await rpc('collab_attachment_get',[project,el.dataset.fileId]);if(run!==epoch||ticket!==detailTicket)return;const bytes=Uint8Array.from(atob(file.content_base64),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:file.mime}));const a=document.createElement('a');a.href=url;a.download=file.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}catch(error){message(error.message,true);}});
      $('attachments').querySelectorAll('[data-save-att-note]').forEach(el=>{el.onclick=async()=>{try{el.disabled=true;await rpc('collab_create',[project,'note',{request_id:crypto.randomUUID(),title:'Tệp: '+el.dataset.fileName,body:'Tệp đính kèm: '+el.dataset.fileName+' từ '+item.title,source_id:item.id}]);el.textContent='✓ Đã lưu';message('Đã lưu tệp vào ghi chú.');}catch(error){el.disabled=false;message('Lỗi lưu ghi chú: '+error.message,true);}};});
      const form=$('upload'),ids=new Map();if(form)form.onsubmit=e=>{e.preventDefault();write(form,async()=>{for(const file of form.elements.files.files){if(file.size>1048576)throw new Error('Tệp '+file.name+' vượt 1 MB. Dùng liên kết tài liệu cho tệp lớn.');const key=file.name+':'+file.size+':'+file.lastModified;if(!ids.has(key))ids.set(key,crypto.randomUUID());const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Không đọc được tệp.'));reader.readAsDataURL(file);});await rpc('collab_upload',[project,item.id,{request_id:ids.get(key),filename:file.name,content_base64:encoded}]);}});};
    }catch(error){if(run===epoch)message(error.message,true);}
  }
  async function detail(id) {
    const run=epoch,ticket=++detailTicket;
    try{
      const item=await rpc('collab_get',[project,id]);if(run!==epoch||ticket!==detailTicket)return;
      if(item.kind==='mail_share'&&window.MailShareUI){close();MailShareUI.read({shareId:item.id,project,rpc});return;}
      const me=bootstrap.user.username,assignee=item.assignee===me,reviewer=item.reviewer===me,owner=item.owner===me;
      let actions='';
      if(item.kind==='task'&&bootstrap.can_write){
        if(assignee&&item.status==='assigned')actions+=button('Nhận việc','accept');
        if(assignee&&['accepted','working'].includes(item.status))actions+=button('Cập nhật tiến độ','progress')+button('Gửi hoàn thành','submit');
        if(reviewer&&item.status==='review')actions+=button('Nghiệm thu','approve')+button('Trả lại bổ sung','return');
        if((owner||reviewer)&&['done','cancelled'].includes(item.status))actions+=button('Mở lại','reopen');
        if((owner||reviewer)&&!['done','cancelled'].includes(item.status))actions+=button('Hủy việc','cancel');
        if(owner&&!['review','done','cancelled'].includes(item.status))actions+=button('Đổi hạn','deadline');
      }
      if(owner&&bootstrap.can_write&&['note','event','conversation'].includes(item.kind))actions+=button('Sửa nội dung','edit');
      const convBadge=item.kind==='conversation'?`<span class="cw-kind">${(item.conversation_type==='direct'||(item.members||[]).length<=2)?'Trò chuyện trực tiếp (1-1)':'Nhóm trao đổi'}</span> `:'' ;
      const convMembers=item.kind==='conversation'?`<div class="cw-chat-members"><b>Thành viên (${(item.members||[]).length}):</b> ${(item.members||[]).map(u=>{const p=bootstrap.members?.find(m=>m.username===u);return `<span class="cw-chat-chip">${esc(p?.fullname||u)} (${esc(u)})</span>`;}).join(' ')}</div>`:'';
      sheet(`<h2>${convBadge}${esc(item.title)}</h2>${convMembers}<p class="cw-body">${esc(item.body)}</p><p>${item.kind==='task'?`${esc(labels[item.status])} · ${item.progress}% · Hạn ${esc(item.due_date||'Chưa đặt')} · Phụ trách ${esc(item.assignee)} · Nghiệm thu ${esc(item.reviewer||'Không yêu cầu')}`:item.kind==='event'?`${esc(new Date(item.starts_at).toLocaleString('vi-VN'))} → ${esc(new Date(item.ends_at).toLocaleString('vi-VN'))}`:''}</p><div class="cw-links">${safeLinks(item.links)}</div><p>${(item.tags||[]).map(x=>`<span class="cw-tag">${esc(x)}</span>`).join('')}</p><div class="cw-actions">${actions}</div><div data-cw="action-form"></div>${(item.reports||[]).map(r=>`<article class="cw-report"><b>Báo cáo · ${esc(r.actor)}</b><p class="cw-body">${esc(r.body)}</p>${safeLinks(r.links)}</article>`).join('')}<details><summary>Lịch sử</summary>${(item.history||[]).map(h=>`<p><small>${esc(new Date(h.at).toLocaleString('vi-VN'))} · ${esc(h.actor)} · ${esc(h.action)} · ${esc(h.detail)}</small></p>`).join('')}</details>${['task','conversation','event'].includes(item.kind)?'<h3>Trao đổi / báo cáo sự kiện</h3><div data-cw="messages"></div><div data-cw="messages-more"></div>'+(bootstrap.can_write?'<form data-cw="send" class="cw-form"><textarea name="body" required maxlength="10000" placeholder="Nội dung trao đổi, @tên để ghi rõ người liên quan"></textarea><textarea name="links" rows="2" placeholder="Tài liệu đính kèm (tùy chọn): Tên | HTTPS URL | Loại | Mã"></textarea><p data-form-error role="alert"></p><button type="submit">Gửi</button></form>':''):''}`);
      $('dialog').querySelectorAll('.cw-actions [data-action]').forEach(el=>el.onclick=()=>actionForm(item,el.dataset.action));
      if(item.kind==='topic'){
        $('dialog').insertAdjacentHTML('beforeend','<h3>Phản hồi cán bộ</h3><div data-cw="topic-children">Đang tải…</div><h3>Trao đổi chuyên đề</h3><div data-cw="messages"></div><div data-cw="messages-more"></div>'+(bootstrap.can_write?'<form data-cw="send" class="cw-form"><textarea name="body" required maxlength="10000"></textarea><textarea name="links" rows="2" placeholder="Tài liệu đính kèm (tùy chọn): Tên | HTTPS URL | Loại | Mã"></textarea><p data-form-error role="alert"></p><button type="submit">Gửi</button></form>':''));
        Promise.all((item.task_ids||[]).map(id=>rpc('collab_get',[project,id]).catch(()=>null))).then(children=>{if(run!==epoch||ticket!==detailTicket||!$('topic-children'))return;$('topic-children').innerHTML=children.filter(Boolean).map(child=>button(`${esc(child.assignee)} · ${esc(labels[child.status])}`,'child-'+child.id)).join('')||'Chỉ hiển thị phản hồi bạn được cấp quyền.';$('topic-children').querySelectorAll('[data-action]').forEach(el=>el.onclick=()=>detail(el.dataset.action.slice(6)));});
      }
      if(item.kind==='task'&&(assignee||(item.collaborators||[]).includes(me))){$('dialog').insertAdjacentHTML('beforeend',button('Báo cáo tình hình hôm nay','daily'));$('dialog').querySelector('[data-action="daily"]').onclick=async()=>{try{const data=await rpc('collab_daily_list',[project,item.id]);if(run!==epoch||ticket!==detailTicket)return;const day=calendarData?.today||bangkokDay(new Date().toISOString());dailyForm(item,day,data.items.filter(x=>x.report_date===day));}catch(error){message(error.message,true);}};}
      for(const report of item.reports||[])if(report.fields)$('dialog').insertAdjacentHTML('beforeend',`<article class="cw-report"><b>Phản hồi chuyên đề · ${esc(report.actor)}</b>${Object.entries(reportLabels).map(([key,label])=>`<p><b>${label}:</b> ${esc(report.fields[key])}</p>`).join('')}</article>`);
      if(item.kind==='note'){
        const rows=item.rows||[];
        const handleSaveNoteRows=async(newRows,formEl)=>{
          try{
            await rpc('collab_update',[project,item.id,{revision:item.revision,action:'edit',rows:newRows}]);
            message('Đã cập nhật ghi chú.');
            await detail(item.id);
          }catch(err){
            const isCasConflict=err.message&&(err.message.includes('thay đổi')||err.message.includes('revision')||err.message.includes('409'));
            const errorMsg=isCasConflict?'Dữ liệu đã thay đổi trên thiết bị khác. Đang tải lại bản mới nhất...':err.message;
            const noteErr=$('dialog')?.querySelector('[data-note-error]');
            if(noteErr)noteErr.textContent=errorMsg;
            if(formEl){const fErr=formEl.querySelector('[data-form-error]');if(fErr)fErr.textContent=errorMsg;}
            message(errorMsg,true);
            if(isCasConflict){
              alert('Dữ liệu đã thay đổi trên thiết bị khác. Hệ thống sẽ tự động tải lại bản mới nhất.');
              await detail(item.id);
            }
          }
        };

        if(item.note_type==='task'){
          $('dialog').insertAdjacentHTML('beforeend',`<h3>Danh sách kiểm tra (Checklist)</h3><div class="cw-note-checklist">${rows.length?rows.map((row,i)=>`<div class="cw-checklist-item ${row.done?'cw-state-done':''}"><label class="cw-check"><input type="checkbox" data-note-row="${i}" ${row.done?'checked':''} ${owner&&bootstrap.can_write?'':'disabled'}><span>${esc(row.title)}</span></label>${row.due_date?`<span class="cw-deadline-badge">${esc(row.due_date)}</span>`:''}${bootstrap.can_write?`<button type="button" class="cw-mini-btn" data-convert-row="${i}">Tạo việc</button>`:''}</div>`).join(''):'<p class="cw-hint">Chưa có mục nào trong danh sách kiểm tra.</p>'}</div><p data-note-error class="cw-hint" style="color:#a42636;"></p>`);
          if(owner&&bootstrap.can_write){
            $('dialog').insertAdjacentHTML('beforeend',`<form data-cw="add-checklist-item" class="cw-mini-form"><input name="title" placeholder="Thêm mục kiểm tra mới..." required maxlength="500"><input name="due_date" type="date"><button type="submit">+ Thêm mục</button><p data-form-error role="alert"></p></form>`);
            const addCheckForm=$('add-checklist-item');
            if(addCheckForm)addCheckForm.onsubmit=e=>{e.preventDefault();const newRow={title:input(addCheckForm,'title'),due_date:input(addCheckForm,'due_date'),done:false};handleSaveNoteRows([...rows,newRow],addCheckForm);};
          }
        } else if(item.note_type==='table'||rows.length){
          $('dialog').insertAdjacentHTML('beforeend',`<div class="cw-table-scroll"><table class="cw-note-table"><thead><tr><th>Xong</th><th>Nhiệm vụ</th><th>Hạn</th><th>Ghi chú</th>${bootstrap.can_write?'<th>Tạo việc</th>':''}</tr></thead><tbody>${rows.length?rows.map((row,i)=>`<tr class="${row.done?'cw-state-done':''}"><td><input type="checkbox" data-note-row="${i}" ${row.done?'checked':''} ${owner&&bootstrap.can_write?'':'disabled'}></td><td>${esc(row.title)}</td><td>${esc(row.due_date||'')}</td><td>${esc(row.notes||'')}</td>${bootstrap.can_write?`<td><button type="button" class="cw-mini-btn" data-convert-row="${i}">Tạo việc</button></td>`:''}</tr>`).join(''):`<tr><td colspan="${bootstrap.can_write?5:4}" class="cw-hint">Chưa có dòng nào trong bảng.</td></tr>`}</tbody></table></div><p data-note-error class="cw-hint" style="color:#a42636;"></p>`);
          if(owner&&bootstrap.can_write){
            $('dialog').insertAdjacentHTML('beforeend',`<form data-cw="add-note-row" class="cw-row-form cw-mini-form"><input name="title" placeholder="Thêm dòng công việc..." required maxlength="500"><input name="due_date" type="date"><input name="notes" placeholder="Ghi chú" maxlength="2000"><button type="submit">+ Thêm dòng</button><p data-form-error role="alert"></p></form>`);
            const addRowForm=$('add-note-row');
            if(addRowForm)addRowForm.onsubmit=e=>{e.preventDefault();const newRow={title:input(addRowForm,'title'),due_date:input(addRowForm,'due_date'),notes:input(addRowForm,'notes'),done:false};handleSaveNoteRows([...rows,newRow],addRowForm);};
          }
        }
        $('dialog').querySelectorAll('[data-note-row]').forEach(el=>el.onchange=()=>{const idx=Number(el.dataset.noteRow);handleSaveNoteRows(rows.map((row,i)=>({...row,done:i===idx?el.checked:!!row.done})));});
        $('dialog').querySelectorAll('[data-convert-row]').forEach(el=>{el.onclick=()=>{const row=rows[Number(el.dataset.convertRow)];if(row)newForm('task',{title:row.title,due_date:row.due_date,body:row.notes||''});};});
      }
      if(item.source_ref){
        $('dialog').insertAdjacentHTML('beforeend',`<div class="cw-source-box">${button('Mở nguồn đã lưu','saved-source')}<p data-source-error class="cw-hint" style="color:#a42636;margin-top:4px"></p></div>`);
        $('dialog').querySelector('[data-action="saved-source"]').onclick=async()=>{
          try{
            if(item.source_ref.kind==='mail_share'&&window.MailShareUI){
              MailShareUI.read({shareId:item.source_ref.id,project,rpc});
            } else {
              await detail(item.source_ref.id);
            }
          }catch(err){
            const errMsg='Không thể mở nguồn: nguồn không tồn tại hoặc đã bị thu hồi quyền truy cập';
            message(errMsg,true);
            const errBox=$('dialog')?.querySelector('[data-source-error]');
            if(errBox)errBox.textContent=errMsg;
            const toast=$('toast');
            if(toast){toast.textContent=errMsg;toast.hidden=false;setTimeout(()=>{if(toast.isConnected)toast.hidden=true;},5000);}
          }
        };
      }
      if(item.kind!=='note'&&bootstrap.can_write){$('dialog').insertAdjacentHTML('beforeend',button('Lưu vào ghi chú riêng','save-note'));const requestId=crypto.randomUUID();$('dialog').querySelector('[data-action="save-note"]').onclick=()=>write($('dialog'),()=>rpc('collab_create',[project,'note',{request_id:requestId,title:item.title,body:'Đã lưu từ '+item.kind,source_id:item.id}]));}
      if(['task','topic','event','conversation'].includes(item.kind)){$('dialog').insertAdjacentHTML('beforeend','<div data-cw="attachments"></div>');attachments(item,run,ticket);}
      if($('messages')){
        let messages=[],messageOffset=0;
        const loadMessages=async(reload=false)=>{
          try{
            if(reload){messages=[];messageOffset=0;}
            const result=await rpc('collab_messages',[project,id,messageOffset]);
            if(run!==epoch||ticket!==detailTicket||!$('messages'))return;
            messages.push(...result.items);
            $('messages').innerHTML=messages.length?messages.slice().reverse().map(msg=>`<article class="cw-report"><b>${esc(msg.owner)}</b><small> · ${esc(new Date(msg.created_at).toLocaleString('vi-VN'))}</small><p class="cw-body">${esc(msg.body)}</p>${safeLinks(msg.links)}${bootstrap.can_write?`<div class="cw-msg-actions"><button type="button" class="cw-mini-btn" data-msg-to-task="${esc(msg.id)}">Tạo việc</button><button type="button" class="cw-mini-btn" data-msg-to-note="${esc(msg.id)}">Lưu ghi chú</button></div>`:''}</article>`).join(''):'<div class="cw-chat-empty cw-empty">Chưa có tin nhắn nào trong hội thoại.</div>';
            $('messages').querySelectorAll('[data-msg-to-task]').forEach(el=>{el.onclick=()=>{const msg=messages.find(m=>m.id===el.dataset.msgToTask);if(msg)newForm('task',{title:'Việc từ trao đổi của '+msg.owner,body:msg.body});};});
            $('messages').querySelectorAll('[data-msg-to-note]').forEach(el=>{el.onclick=()=>write($('dialog'),()=>{const msg=messages.find(m=>m.id===el.dataset.msgToNote);return rpc('collab_create',[project,'note',{request_id:crypto.randomUUID(),title:'Ghi chú từ trao đổi '+msg.owner,body:msg.body,source_id:item.id}]);});});
            $('messages-more').innerHTML=result.next_offset!==null?button('Xem tin cũ hơn','older'):'';if(result.next_offset!==null){messageOffset=result.next_offset;$('messages-more').querySelector('button').onclick=()=>loadMessages(false);}
          }catch(error){
            if($('messages'))$('messages').innerHTML=`<div class="cw-chat-empty cw-empty" style="color:#a42636">Lỗi nạp tin: ${esc(error.message)}</div>`;
            message(error.message,true);
          }
        };
        await loadMessages();
        const form=$('send');let requestId=crypto.randomUUID(),last='';
        if(form)form.onsubmit=e=>{
          e.preventDefault();
          const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;
          const errBox=form.querySelector('[data-form-error]');if(errBox)errBox.textContent='';
          (async()=>{
            try{
              const body=input(form,'body');
              const rawLinks=input(form,'links');
              const links=rawLinks?parseLinks(rawLinks):[];
              if(last&&last!==(body+rawLinks))requestId=crypto.randomUUID();
              last=body+rawLinks;
              await rpc('collab_send',[project,id,{request_id:requestId,body,links}]);
              form.reset();
              message('Đã gửi trao đổi.');
              await loadMessages(true);
            }catch(err){
              if(errBox)errBox.textContent=err.message;
              message(err.message,true);
            }finally{
              if(submit?.isConnected)submit.disabled=false;
            }
          })();
        };
      }
    }catch(error){if(run===epoch)message(error.message,true);}
  }
  function actionForm(item,action) {
    let fields='';
    if(action==='progress')fields=field('Tiến độ (%)',`<input name="progress" type="number" min="0" max="100" value="${item.progress}" required>`)+(item.checklist||[]).map((x,i)=>`<label class="cw-check"><input name="check-${i}" type="checkbox" ${x.done?'checked':''}>${esc(x.title)}</label>`).join('');
    if(action==='submit')fields=field('Báo cáo kết quả','<textarea name="report" rows="4" required maxlength="10000"></textarea>')+(item.task_type==='thematic'?reportForm(): '')+field('Minh chứng: Tên | HTTPS URL | Loại hồ sơ | Mã hồ sơ','<textarea name="links" rows="2"></textarea>');
    if(['return','reopen','cancel','deadline'].includes(action))fields+=field('Lý do','<textarea name="reason" required maxlength="1000"></textarea>');
    if(action==='deadline')fields+=field('Hạn mới',`<input name="due_date" type="date" value="${esc(item.due_date)}" required>`);
    if(action==='edit')fields=field('Tiêu đề',`<input name="title" value="${esc(item.title)}" maxlength="180" required>`)+field('Nội dung',`<textarea name="body" rows="6" maxlength="10000">${esc(item.body)}</textarea>`);
    $('action-form').innerHTML=`<form data-cw="action" class="cw-form">${fields}<p data-form-error role="alert"></p><button type="submit">Xác nhận ${esc(({accept:'nhận việc',approve:'nghiệm thu',submit:'gửi hoàn thành',return:'trả lại',progress:'cập nhật',reopen:'mở lại',cancel:'hủy',deadline:'đổi hạn',edit:'lưu nội dung'})[action])}</button></form>`;
    const form=$('action');form.onsubmit=e=>{e.preventDefault();write(form,async()=>{
      const payload={revision:item.revision,action:action==='deadline'?'edit':action};
      if(action==='progress'){payload.progress=Number(input(form,'progress'));payload.checklist=(item.checklist||[]).map((_,i)=>form.elements[`check-${i}`].checked);}
      if(action==='submit'){payload.report=input(form,'report');payload.links=parseLinks(input(form,'links'));if(item.task_type==='thematic')payload.report_fields=readReport(form);}
      if(['return','reopen','cancel','deadline'].includes(action))payload.reason=input(form,'reason');
      if(action==='deadline')payload.due_date=input(form,'due_date');
      if(action==='edit'){payload.title=input(form,'title');payload.body=input(form,'body');}
      await rpc('collab_update',[project,item.id,payload]);
    });};
  }
  async function report() {
    const run=epoch;
    try{const data=await rpc('collab_summary',[project]);if(run!==epoch)return;sheet(`<h2>Tổng hợp kết quả</h2><p>${esc(project)} · ${esc(data.scope)}</p><div class="cw-stats">${[['Tổng việc',data.total],['Hoàn thành',data.done],['Chờ nghiệm thu',data.review],['Đang mở',data.open],['Quá hạn',data.overdue],['Tỷ lệ hoàn thành',data.completion_percent===null?'Không có việc':data.completion_percent+'%']].map(([label,value])=>`<div><small>${label}</small><strong>${value}</strong></div>`).join('')}</div><p class="cw-hint">Tính trên các việc được phép xem tại ${esc(new Date(data.as_of).toLocaleString('vi-VN'))}; việc hủy loại khỏi tổng. Đây là tổng hiện tại, chưa phải báo cáo kỳ đã chốt.</p>${button('Tải số liệu JSON','download')}`);$('dialog').querySelector('[data-action="download"]').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({...data,project},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='bao-cao-cong-viec.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};}
    catch(error){message(error.message,true);}
  }
  async function preferences(){
    const run=epoch;
    try{const current=await rpc('collab_preferences',[project]);if(run!==epoch)return;const settings=current.settings,widgetLabels={summary:'Số liệu tổng quan',today:'Hôm nay và quá hạn',tasks:'Việc được giao',review:'Chờ nghiệm thu',support:'Yêu cầu hỗ trợ',mail:'Mail chia sẻ'};
      sheet(`<h2>Cài đặt cá nhân</h2><form data-cw="preferences" class="cw-form"><label class="cw-check"><input name="notifications_enabled" type="checkbox" ${settings.notifications_enabled?'checked':''}>Hiện thông báo nổi</label><label class="cw-check"><input name="reminders_enabled" type="checkbox" ${settings.reminders_enabled?'checked':''}>Nhắc hạn công việc / sự kiện</label>${field('Múi giờ thông báo',`<input name="timezone" value="${esc(settings.timezone)}" required>`)}${field('Yên lặng từ',`<input name="quiet_start" type="time" value="${esc(settings.quiet_start)}">`)}${field('Đến',`<input name="quiet_end" type="time" value="${esc(settings.quiet_end)}">`)}${field('Các bảng trên Home (không chọn để dùng bố cục theo chức danh)',`<select name="home_widgets" multiple size="6">${Object.entries(widgetLabels).map(([key,label])=>`<option value="${key}" ${settings.home_widgets.includes(key)?'selected':''}>${label}</option>`).join('')}</select>`)}<p class="cw-hint">Giờ bắt đầu và kết thúc trùng nhau nghĩa là không đặt giờ yên lặng. Thông báo chưa đọc vẫn được giữ trong app. Ngày nghiệp vụ dùng múi giờ Việt Nam.</p><p data-form-error role="alert"></p><button type="submit">Lưu cài đặt dùng chung</button></form>`);
      const form=$('preferences');form.onsubmit=e=>{e.preventDefault();write(form,()=>rpc('collab_save_preferences',[project,{revision:current.revision,settings:{notifications_enabled:form.elements.notifications_enabled.checked,reminders_enabled:form.elements.reminders_enabled.checked,timezone:input(form,'timezone'),quiet_start:input(form,'quiet_start'),quiet_end:input(form,'quiet_end'),home_widgets:getPeople(form,'home_widgets')}}]));};
    }catch(error){if(run===epoch)message(error.message,true);}
  }
  async function mount(container,options) {
    clearTimeout(timer);epoch++;busy=false;root=container;rpc=options.rpc;project=options.project;items=[];nextOffset=null;calendarData=null;seenNotices=null;
    if(!root)return;if(!project){root.textContent='Chọn dự án được cấp quyền để mở To do.';return;}
    root.classList.add('collaboration-workspace');root.innerHTML='<p>Đang kết nối công việc dùng chung…</p>';const run=epoch;
    try{
      bootstrap=await rpc('collab_bootstrap',[project]);if(run!==epoch||!root.isConnected)return;
      root.innerHTML=`<header class="cw-header"><div><h1>To do · Làm việc nhóm</h1><p>${esc(project)}</p></div><div class="cw-actions">${bootstrap.can_write?button('+ Tạo mới','new'):''}${button('Báo cáo','report')}${button('🔔','notifications')}${button('Cá nhân','preferences')}${button('Làm mới','refresh')}</div></header><section data-cw="calendar" class="cw-calendar"></section><div class="cw-tabs">${[['task','Việc của tôi / nhóm'],['topic','BC chuyên đề'],['daily','Tồn đọng hằng ngày'],['incident','Việc đột xuất'],['conversation','Nhóm chat'],['event','Sự kiện'],['note','Ghi chú riêng']].map(([id,label])=>button(label,id)).join('')}</div><p data-cw="status" role="status"></p><div data-cw="list" class="cw-grid"></div><div data-cw="more"></div><div data-cw="toast" class="cw-toast" role="alert" hidden></div><dialog data-cw="dialog" class="cw-dialog"></dialog>`;
      root.querySelector('[data-action="new"]')?.addEventListener('click',newForm);root.querySelector('[data-action="report"]').onclick=report;root.querySelector('[data-action="refresh"]').onclick=()=>load();
      root.querySelector('[data-action="notifications"]').onclick=()=>notifications(true);
      root.querySelector('[data-action="preferences"]').onclick=preferences;
      root.querySelectorAll('.cw-tabs [data-action]').forEach(el=>el.onclick=()=>{kind=el.dataset.action;detailTicket++;items=[];nextOffset=null;root.querySelectorAll('.cw-tabs button').forEach(b=>b.classList.toggle('active',b===el));close();load();});
      root.querySelector(`.cw-tabs [data-action="${kind}"]`)?.classList.add('active');
      await Promise.all([load(),calendar(),notifications()]);
      const poll=async()=>{if(run!==epoch||!root?.isConnected)return;if(!$('dialog')?.open&&!busy)await Promise.all([load(),calendar(),notifications()]);timer=setTimeout(poll,15000);};timer=setTimeout(poll,15000);
    }catch(error){if(run===epoch)root.textContent=error.message;}
  }
  function unmount(){epoch++;clearTimeout(timer);close();if(root)root.innerHTML='';root=null;}
  return {mount,unmount,open:detail};
})();
