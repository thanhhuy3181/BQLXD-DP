'use strict';

// Pure collaboration rules, shared by every client through collaboration_rpc.
const crypto = require('crypto');
const TYPES = new Set(['task', 'note', 'event', 'conversation', 'topic']);
const STATES = new Set(['assigned', 'accepted', 'working', 'review', 'done', 'paused', 'cancelled']);
const TAGS = ['HSMT', 'Tiến độ', 'Hợp đồng', 'BVTK', 'Thanh toán', 'Quyết toán', 'Phê duyệt', 'Pháp lý'];
function reject(message) { throw new Error(message); }
function text(value, max, label, required = false) {
  if (typeof value !== 'string') value = value == null ? '' : reject(`${label} phải là văn bản.`);
  const result = value.trim();
  if ((required && !result) || result.length > max) reject(`${label} không hợp lệ (tối đa ${max} ký tự).`);
  return result;
}
function names(value, max = 50) {
  if (!Array.isArray(value) || value.length > max) reject('Danh sách thành viên không hợp lệ.');
  return [...new Set(value.map(x => text(x, 100, 'Tên tài khoản', true)))];
}
function date(value, required = false) {
  if (!value && !required) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) reject('Ngày không hợp lệ.');
  return value;
}
function instant(value, required = false) {
  if (!value && !required) return '';
  if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) reject('Thời điểm phải có múi giờ.');
  return new Date(value).toISOString();
}
function links(value = []) {
  if (!Array.isArray(value) || value.length > 30) reject('Tối đa 30 liên kết.');
  return value.map(link => {
    const title = text(link?.title, 200, 'Tên tài liệu', true);
    const url = text(link?.url, 2000, 'Địa chỉ tài liệu', true);
    let parsed; try { parsed = new URL(url); } catch { reject('Địa chỉ tài liệu không hợp lệ.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) reject('Tài liệu phải dùng liên kết HTTPS không chứa mật khẩu.');
    return {title, url, kind: text(link.kind, 60, 'Loại hồ sơ'), record_id: text(link.record_id, 200, 'Mã hồ sơ')};
  });
}
function meta(input) {
  return {tags: names(input.tags || [], 20), links: links(input.links || [])};
}
function reportFields(input, required = true) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) reject('Thiếu các trường báo cáo.');
  return {current_state:text(input.current_state,5000,'Tình trạng hiện tại',required),
    solution:text(input.solution,5000,'Giải pháp khắc phục',required),
    work_done:text(input.work_done,5000,'Công việc đã thực hiện',required),
    support_needed:text(input.support_needed,5000,'Vướng mắc cần hỗ trợ',required)};
}
function statusInfo(task, today) {
  const diff = task.due_date ? Math.round((Date.parse(task.due_date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000) : null;
  if (task.status === 'done') return {label:'Hoàn thành',color:'done',remaining:'Đã hoàn thành'};
  if (task.status === 'cancelled') return {label:'Đã hủy',color:'done',remaining:''};
  if (diff !== null && diff < 0) return {label:task.status==='review'?'Quá hạn · Chờ nghiệm thu':'Quá hạn',color:'overdue',remaining:`Quá ${-diff} ngày`};
  if (task.status === 'review') return {label:'Chờ nghiệm thu',color:'review',remaining:diff===null?'':diff===0?'Hôm nay':`Còn ${diff} ngày`};
  if (diff===0) return {label:'Đến hạn hôm nay',color:'today',remaining:'Hôm nay'};
  if (task.start_date && task.start_date>today) return {label:'Chưa tới hạn',color:'future',remaining:diff===null?'':`Còn ${diff} ngày`};
  return {label:['accepted','working'].includes(task.status)?'Đang thực hiện':'Đã giao',color:'working',remaining:diff===null?'Chưa đặt hạn':`Còn ${diff} ngày`};
}
function sortTasks(tasks) {
  return tasks.slice().sort((a,b)=>Number(['done','cancelled'].includes(a.status))-Number(['done','cancelled'].includes(b.status)) ||
    (['done','cancelled'].includes(a.status)?String(b.completed_at||b.updated_at).localeCompare(String(a.completed_at||a.updated_at)):
      String(a.due_date||'9999-12-31').localeCompare(String(b.due_date||'9999-12-31'))) || String(a.id).localeCompare(String(b.id)));
}
function memberNames(item) { return new Set([item.owner, item.assignee, item.reviewer, ...(item.collaborators || []), ...(item.members || [])].filter(Boolean)); }
function visible(item, username) { return memberNames(item).has(username); }
function checkMembers(item, members) {
  for (const name of memberNames(item)) if (!members.has(name)) reject(`Thành viên không hoạt động hoặc ngoài dự án: ${name}`);
}
function history(item, actor, action, now, detail = '') {
  item.history = [...(item.history || []), {actor, action, at: now, detail}].slice(-200);
}
function create(kind, input, ctx) {
  if (!TYPES.has(kind)) reject('Loại dữ liệu không hỗ trợ.');
  const now = ctx.now || new Date().toISOString();
  const item = {id: ctx.id || crypto.randomUUID(), kind, project: ctx.project, owner: ctx.user.username,
    title: text(input.title, 180, 'Tiêu đề', true), body: text(input.body, 10000, 'Nội dung'), ...meta(input),
    created_at: now, updated_at: now, revision: 1, history: []};
  if (kind === 'task') {
    item.task_type = input.task_type || 'general';
    if (!['general','daily','thematic','incident'].includes(item.task_type)) reject('Loại công việc không hợp lệ.');
    item.construction = text(input.construction,200,'Công trình');
    item.section = text(input.section,200,'Hạng mục');
    item.start_date = date(input.start_date);
    item.assignee = text(input.assignee || item.owner, 100, 'Người chịu trách nhiệm', true);
    item.collaborators = names(input.collaborators || []);
    item.reviewer = text(input.reviewer, 100, 'Người nghiệm thu');
    if (!ctx.canAssign && item.task_type!=='incident' && (item.assignee !== item.owner || item.collaborators.length)) reject('Bạn chưa có quyền giao việc cho người khác.');
    item.due_date = date(input.due_date);
    item.original_due_date = item.due_date;
    if (item.start_date && item.due_date && item.start_date>item.due_date) reject('Ngày bắt đầu phải trước hạn hoàn thành.');
    item.priority = input.priority || 'normal';
    if (!['low', 'normal', 'high'].includes(item.priority)) reject('Ưu tiên không hợp lệ.');
    item.status = 'assigned'; item.progress = 0; item.reports = [];
    item.checklist = (input.checklist || []).map(x => ({title: text(x, 180, 'Bước kiểm tra', true), done: false}));
    if (item.checklist.length > 50) reject('Tối đa 50 bước kiểm tra.');
  } else if (kind === 'conversation' || kind === 'topic') {
    item.members = names([item.owner, ...(input.members || [])]);
    if (item.members.length < 2) reject('Hội thoại cần ít nhất hai thành viên.');
    if (kind==='conversation') item.conversation_type = item.members.length === 2 ? 'direct' : 'group';
    if (kind==='topic') { item.due_date=date(input.due_date,true); item.task_ids=[]; }
  } else {
    item.members = names([item.owner, ...(input.members || [])]);
    if (kind === 'note') {
      item.remind_at = instant(input.remind_at);
      item.note_type=input.note_type||'text';
      if(!['text','task','table'].includes(item.note_type))reject('Kiểu ghi chú không hợp lệ.');
      item.rows=noteRows(input.rows||[]);
    }
    if (kind === 'event') {
      item.starts_at = instant(input.starts_at, true); item.ends_at = instant(input.ends_at, true);
      if (Date.parse(item.ends_at) <= Date.parse(item.starts_at)) reject('Giờ kết thúc phải sau giờ bắt đầu.');
      item.reporting_deadline = instant(input.reporting_deadline);
      item.remind_at = input.remind_at ? instant(input.remind_at,true) : new Date(Date.parse(item.starts_at)-15*60000).toISOString();
    }
  }
  checkMembers(item, ctx.members); history(item, item.owner, 'created', now);
  return item;
}
function update(original, input, ctx) {
  const item = structuredClone(original), username = ctx.user.username, now = ctx.now || new Date().toISOString();
  if (!visible(item, username)) reject('Không có quyền truy cập đối tượng.');
  if (!Number.isInteger(input.revision) || input.revision !== item.revision) reject('Dữ liệu đã thay đổi. Tải lại trước khi lưu.');
  const action = input.action || 'edit';
  if (action === 'edit') {
    if (item.owner !== username) reject('Chỉ người tạo được sửa nội dung hoặc phân công.');
    if (item.kind === 'task' && ['review', 'done', 'cancelled'].includes(item.status)) reject('Không sửa việc đang chờ duyệt, đã hoàn thành hoặc hủy.');
    if (input.title !== undefined) item.title = text(input.title, 180, 'Tiêu đề', true);
    if (input.body !== undefined) item.body = text(input.body, 10000, 'Nội dung');
    if (input.tags !== undefined) item.tags = names(input.tags, 20);
    if (input.links !== undefined) item.links = links(input.links);
    if (item.kind === 'task') {
      if (input.assignee !== undefined) {
        const next = text(input.assignee, 100, 'Người chịu trách nhiệm', true);
        if (!ctx.canAssign && next !== username) reject('Không có quyền phân công.');
        if (next !== item.assignee) { item.status = 'assigned'; item.progress = 0; item.accepted_at = null; }
        item.assignee = next;
      }
      if (input.collaborators !== undefined) {
        if (!ctx.canAssign && input.collaborators.length) reject('Không có quyền phân công.');
        item.collaborators = names(input.collaborators);
      }
      if (input.reviewer !== undefined) item.reviewer = text(input.reviewer, 100, 'Người nghiệm thu');
      if (input.due_date !== undefined && input.due_date !== item.due_date) {
        const reason = text(input.reason, 1000, 'Lý do đổi hạn', true);
        history(item, username, 'deadline_changed', now, `${item.due_date} → ${date(input.due_date)}: ${reason}`);
        item.due_date = date(input.due_date);
        if(item.start_date&&item.due_date&&item.start_date>item.due_date)reject('Hạn hoàn thành phải sau ngày bắt đầu.');
      }
      if (input.priority !== undefined) {
        if (!['low', 'normal', 'high'].includes(input.priority)) reject('Ưu tiên không hợp lệ.');
        item.priority = input.priority;
      }
    } else if (item.kind === 'note') {
      if(input.rows!==undefined)item.rows=noteRows(input.rows);
      if(input.members!==undefined)item.members=names([item.owner,...input.members]);
    } else if (item.kind === 'conversation') {
      if(input.members!==undefined){
        const updatedMembers = names([item.owner, ...input.members]);
        if(updatedMembers.length < 2) reject('Hội thoại cần ít nhất hai thành viên.');
        item.members = updatedMembers;
        item.conversation_type = item.members.length === 2 ? 'direct' : 'group';
      }
    } else if (item.kind === 'event') {
      if (input.starts_at !== undefined) item.starts_at = instant(input.starts_at, true);
      if (input.ends_at !== undefined) item.ends_at = instant(input.ends_at, true);
      if (Date.parse(item.ends_at) <= Date.parse(item.starts_at)) reject('Giờ kết thúc phải sau giờ bắt đầu.');
    }
  } else if (item.kind === 'task') {
    const assignee = username === item.assignee, owner = username === item.owner, reviewer = username === item.reviewer;
    if (action === 'accept') {
      if (!assignee || item.status !== 'assigned') reject('Chỉ người được giao nhận việc mới.');
      item.status = 'accepted'; item.accepted_at = now;
    } else if (action === 'progress') {
      if (!assignee || !['accepted', 'working'].includes(item.status)) reject('Cần nhận việc trước khi cập nhật.');
      const progress = input.progress;
      if (!Number.isInteger(progress) || progress < 0 || progress > 100) reject('Tiến độ phải từ 0 đến 100.');
      item.progress = progress; item.status = 'working';
      if (input.checklist !== undefined) {
        if (!Array.isArray(input.checklist) || input.checklist.length !== item.checklist.length || input.checklist.some(x => typeof x !== 'boolean')) reject('Checklist không hợp lệ.');
        item.checklist.forEach((x, i) => { x.done = input.checklist[i]; });
      }
    } else if (action === 'submit') {
      if (!assignee || !['accepted', 'working'].includes(item.status)) reject('Không thể gửi hoàn thành ở trạng thái này.');
      if (item.checklist.some(x => !x.done)) reject('Cần hoàn thành các bước kiểm tra.');
      const report = {actor: username, at: now, body: text(input.report, 10000, 'Báo cáo hoàn thành', true), links: links(input.links || [])};
      if(item.task_type==='thematic')report.fields=reportFields(input.report_fields);
      item.reports.push(report);
      if (item.reports.length > 100) reject('Đã đạt giới hạn báo cáo, cần lưu trữ hồ sơ trước khi tiếp tục.');
      item.progress = 100; item.status = item.reviewer ? 'review' : 'done';
      if (!item.reviewer) item.completed_at = now;
    } else if (action === 'approve' || action === 'return') {
      if (!reviewer || item.status !== 'review') reject('Chỉ người nghiệm thu được xử lý việc chờ duyệt.');
      if (item.reviewer === item.assignee) reject('Việc có nghiệm thu cần người duyệt khác người thực hiện.');
      if (action === 'approve') { item.status = 'done'; item.completed_at = now; item.approved_by = username; }
      else { item.status = 'working'; item.progress = Math.min(item.progress, 99); text(input.reason, 1000, 'Lý do trả lại', true); }
    } else if (action === 'cancel' || action === 'reopen') {
      if (!owner && !reviewer) reject('Không có quyền hủy hoặc mở lại.');
      text(input.reason, 1000, 'Lý do', true);
      if (action === 'reopen' && !['done', 'cancelled'].includes(item.status)) reject('Chỉ mở lại việc đã kết thúc.');
      if (action === 'cancel' && ['done', 'cancelled'].includes(item.status)) reject('Việc đã kết thúc.');
      item.status = action === 'cancel' ? 'cancelled' : 'assigned';
      if (action === 'reopen') { item.progress = 0; item.completed_at = null; item.approved_by = null; }
    } else reject('Thao tác không hỗ trợ.');
  } else reject('Thao tác không hỗ trợ.');
  checkMembers(item, ctx.members);
  history(item, username, action, now, text(input.reason, 1000, 'Lý do'));
  item.updated_at = now; item.revision++;
  return item;
}
function noteRows(rows){
  if(!Array.isArray(rows)||rows.length>200)reject('Tối đa 200 dòng ghi chú.');
  return rows.map(row=>({id:text(row.id||crypto.randomUUID(),100,'Mã dòng',true),title:text(row.title,500,'Nội dung dòng',true),
    done:row.done===true,due_date:date(row.due_date),notes:text(row.notes,2000,'Ghi chú dòng')}));
}
function preferences(input={}){
  const result={notifications_enabled:true,reminders_enabled:true,timezone:'Asia/Bangkok',quiet_start:'22:00',quiet_end:'07:00',home_widgets:[]};
  for(const key of ['notifications_enabled','reminders_enabled'])if(input[key]!==undefined){if(typeof input[key]!=='boolean')reject('Tùy chọn thông báo phải là đúng/sai.');result[key]=input[key];}
  if(input.timezone!==undefined){const zone=text(input.timezone,100,'Múi giờ',true);try{new Intl.DateTimeFormat('en',{timeZone:zone});}catch{reject('Múi giờ không hợp lệ.');}result.timezone=zone;}
  for(const key of ['quiet_start','quiet_end'])if(input[key]!==undefined){const value=text(input[key],5,'Giờ yên lặng');if(value&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))reject('Giờ yên lặng không hợp lệ.');result[key]=value;}
  if(Boolean(result.quiet_start)!==Boolean(result.quiet_end))reject('Cần đặt cả giờ bắt đầu và kết thúc yên lặng.');
  if(input.home_widgets!==undefined){const widgets=names(input.home_widgets,6);if(widgets.some(x=>!['summary','today','tasks','review','support','mail'].includes(x)))reject('Bảng Home không hợp lệ.');result.home_widgets=widgets;}
  return result;
}
function deliveryAllowed(settings,now=new Date()){
  if(!settings.notifications_enabled)return false;
  if(!settings.quiet_start||settings.quiet_start===settings.quiet_end)return true;
  const time=new Intl.DateTimeFormat('en-GB',{timeZone:settings.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
  const quiet=settings.quiet_start<settings.quiet_end?time>=settings.quiet_start&&time<settings.quiet_end:time>=settings.quiet_start||time<settings.quiet_end;
  return !quiet;
}
function summary(tasks, today) {
  const total = tasks.filter(x => x.status !== 'cancelled');
  const done = total.filter(x => x.status === 'done');
  return {total: total.length, done: done.length, review: total.filter(x => x.status === 'review').length,
    open: total.filter(x => x.status !== 'done').length,
    overdue: total.filter(x => x.status !== 'done' && x.due_date && x.due_date < today).length,
    completion_percent: total.length ? Math.round(done.length * 100 / total.length) : null};
}
module.exports = {create, update, visible, memberNames, checkMembers, summary, text, names, date, instant, links, TAGS, STATES,reportFields,statusInfo,sortTasks,noteRows,preferences,deliveryAllowed};
