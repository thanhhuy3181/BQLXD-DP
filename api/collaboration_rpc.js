'use strict';
const crypto = require('crypto');
const model = require('./collaboration_model');
const {can, permissionValue, active} = require('./awm_rpc');
const ok = data => ({ok:true, data, error:null});
const fail = error => ({ok:false, data:null, error});
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

// One row per entity. Revision compare-and-swap and the outbox write are atomic.
// This DDL creates a new table only; it never changes or migrates existing data.
const schemaPromises=new WeakMap();
async function ensure(sql) {
  if(schemaPromises.has(sql))return schemaPromises.get(sql);
  const promise=initializeSchema(sql);schemaPromises.set(sql,promise);
  try{return await promise;}catch(error){schemaPromises.delete(sql);throw error;}
}
async function initializeSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS bqlda_collaboration (
    id text PRIMARY KEY, kind text NOT NULL, project text NOT NULL,
    owner text NOT NULL, parent_id text, revision integer NOT NULL DEFAULT 1,
    data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS bqlda_collaboration_project_kind ON bqlda_collaboration(project,kind,created_at,id)`;
  await sql`CREATE INDEX IF NOT EXISTS bqlda_collaboration_parent ON bqlda_collaboration(parent_id,created_at,id)`;
  await sql`CREATE INDEX IF NOT EXISTS bqlda_collaboration_recipient ON bqlda_collaboration(project,kind,owner,created_at,id)`;
}
async function get(sql, project, id) {
  if (!uuid(id)) throw new Error('Mã dữ liệu không hợp lệ.');
  const rows = await sql`SELECT data FROM bqlda_collaboration WHERE id=${id} AND project=${project}`;
  return rows[0]?.data || null;
}
function noticeRows(item, actor) {
  // Content is resolved against current ACL when notifications are read.
  const mentions = new Set();
  if (item.kind === 'message' && typeof item.body === 'string') {
    const matches = item.body.match(/@([a-zA-Z0-9._-]+)/g);
    if (matches) {
      for (const m of matches) {
        const u = m.slice(1);
        if (u !== actor && model.memberNames(item).has(u)) mentions.add(u);
      }
    }
  }
  return [...model.memberNames(item)].filter(x => x !== actor).map(owner => ({
    id:crypto.randomUUID(), kind:'notification', owner, project:item.project,
    parent_id:item.parent_id || item.id,
    action: mentions.has(owner) ? 'mention' : item.kind === 'message' ? 'message' : ((item.history || []).at(-1)?.action || 'changed'),
    created_at:item.updated_at,
    revision:1, read_at:null
  }));
}
async function insert(sql, item, requestHash, actor) {
  const notices = noticeRows(item, actor);
  const data = {...item, request_hash:requestHash};
  const rows = await sql`WITH saved AS (
    INSERT INTO bqlda_collaboration(id,kind,project,owner,parent_id,revision,data)
    VALUES(${item.id},${item.kind},${item.project},${item.owner},${item.parent_id || null},1,${JSON.stringify(data)}::jsonb)
    ON CONFLICT(id) DO NOTHING RETURNING data
  ), notified AS (
    INSERT INTO bqlda_collaboration(id,kind,project,owner,parent_id,revision,data)
    SELECT n->>'id','notification',${item.project},n->>'owner',n->>'parent_id',1,n
    FROM jsonb_array_elements(${JSON.stringify(notices)}::jsonb) n WHERE EXISTS(SELECT 1 FROM saved)
    RETURNING id
  ) SELECT data FROM saved`;
  if (rows.length) return rows[0].data;
  const previous = await get(sql, item.project, item.id);
  if (!previous || previous.owner !== item.owner || previous.request_hash !== requestHash) throw new Error('Mã thao tác đã được dùng cho nội dung khác.');
  return previous;
}
async function replace(sql, item, expectedRevision, actor) {
  const notices = noticeRows(item, actor);
  const rows = await sql`WITH saved AS (
    UPDATE bqlda_collaboration SET data=${JSON.stringify(item)}::jsonb, revision=${item.revision}, updated_at=now()
    WHERE id=${item.id} AND project=${item.project} AND revision=${expectedRevision} RETURNING data
  ), notified AS (
    INSERT INTO bqlda_collaboration(id,kind,project,owner,parent_id,revision,data)
    SELECT n->>'id','notification',${item.project},n->>'owner',n->>'parent_id',1,n
    FROM jsonb_array_elements(${JSON.stringify(notices)}::jsonb) n WHERE EXISTS(SELECT 1 FROM saved)
    RETURNING id
  ) SELECT data FROM saved`;
  if (!rows.length) throw new Error('Dữ liệu đã thay đổi. Tải lại trước khi lưu.');
  return rows[0].data;
}
function publicItem(item) { const {request_hash, ...safe} = item; return safe; }
function stableId(value) {
  const hex=crypto.createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
function todayString() { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
async function readPreferences(sql,username){const stored=await get(sql,'__user__',stableId('preferences:'+username));return {revision:stored?.revision||0,settings:model.preferences(stored?.settings||{})};}
async function seedReminders(sql,project,username,settings){
  if(!settings.reminders_enabled)return;
  const today=todayString(),future=new Date(Date.parse(today+'T12:00:00Z')+3*86400000).toISOString().slice(0,10),now=new Date().toISOString();
  const tasks=await sql`SELECT data FROM bqlda_collaboration WHERE project=${project} AND kind='task'
    AND data->>'status' NOT IN ('done','cancelled') AND NULLIF(data->>'due_date','')<=${future}
    AND (data->>'assignee'=${username} OR data->>'reviewer'=${username} OR data->'collaborators' ? ${username}) ORDER BY data->>'due_date' LIMIT 500`;
  const notices=[];
  for(const {data:item} of tasks){const distance=Math.round((Date.parse(item.due_date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
    if(!Number.isFinite(distance)||distance>0&&![1,3].includes(distance))continue;
    notices.push({id:stableId(`due:${item.id}:${username}:${today}`),kind:'notification',owner:username,project,parent_id:item.id,action:'due',created_at:now,revision:1,read_at:null});}
  const scheduled=await sql`SELECT data FROM bqlda_collaboration WHERE project=${project} AND kind IN ('event','note')
    AND NULLIF(data->>'remind_at','')<=${now} AND (owner=${username} OR data->'members' ? ${username}) ORDER BY created_at DESC LIMIT 500`;
  for(const {data:item} of scheduled)notices.push({id:stableId(`remind:${item.id}:${username}:${item.remind_at}`),kind:'notification',owner:username,project,parent_id:item.id,action:'remind',created_at:now,revision:1,read_at:null});
  if(notices.length)await sql`INSERT INTO bqlda_collaboration(id,kind,project,owner,parent_id,revision,data)
    SELECT n->>'id','notification',${project},n->>'owner',n->>'parent_id',1,n FROM jsonb_array_elements(${JSON.stringify(notices)}::jsonb) n ON CONFLICT(id) DO NOTHING`;
}
async function handle({method, args = [], sql, user, state, allowedProject}) {
  if (!method.startsWith('collab_')) return undefined;
  if (!active(user)) return fail('Cần tài khoản đang hoạt động.');
  if (!can(user, state, 'tab_todo')) return fail('Chưa được cấp quyền To do.');
  let project;try{project=model.text(args[0], 200, 'Dự án', true);}catch(error){return fail(error.message);}
  if (!allowedProject(user, project)) return fail('Không có quyền truy cập dự án.');
  const level = permissionValue(user, state, 'tab_todo');
  const writeAllowed = String(user.role).toLowerCase() === 'admin' || level === true || ['edit','full'].includes(level);
  const assignLevel = permissionValue(user, state, 'ql_project_mgmt');
  const canAssign = String(user.role).toLowerCase() === 'admin' || assignLevel === true || ['edit','full'].includes(assignLevel);
  try {
    await ensure(sql);
    const rows = await sql`SELECT username,status,data FROM bqlda_users WHERE status='Active'`;
    const people = rows.map(row => ({...row.data, username:row.username,status:row.status}))
      .filter(person => active(person) && allowedProject(person,project));
    const members = new Set(people.map(x => x.username));
    const ctx = {project, user, canAssign, members};
    if (method === 'collab_migrate_legacy') {
      const {migrateUserProjectTodos} = require('./todo_migration');
      const result = await migrateUserProjectTodos(sql, user.username, project);
      return ok(result);
    }
    if (method === 'collab_bootstrap') {
      const {migrateUserProjectTodos} = require('./todo_migration');
      await migrateUserProjectTodos(sql, user.username, project);
      return ok({user:{username:user.username,fullname:user.fullname},preferences:await readPreferences(sql,user.username),
        can_write:writeAllowed, can_assign:canAssign, tags:model.TAGS,
        members:people.map(x => ({username:x.username, fullname:x.fullname || x.username}))});
    }
    if (method === 'collab_list') {
      const kind = String(args[1] || 'task'), offset = Number(args[2] || 0);
      if (!['task','note','event','conversation','topic'].includes(kind) || !Number.isInteger(offset) || offset < 0 || offset > 100000) return fail('Bộ lọc không hợp lệ.');
      const username = user.username,taskType=model.text(args[3],30,'Loại công việc');
      if(taskType&&!['general','daily','thematic','incident'].includes(taskType))return fail('Loại công việc không hợp lệ.');
      const isManager = Boolean(canAssign || String(user.role || '').toLowerCase() === 'admin');
      const list = isManager
        ? await sql`SELECT data FROM bqlda_collaboration WHERE project=${project} AND kind=${kind}
            AND (${taskType}='' OR data->>'task_type'=${taskType})
            ORDER BY CASE WHEN kind='task' AND data->>'status' IN ('done','cancelled') THEN 1 ELSE 0 END,
              CASE WHEN kind='task' AND data->>'status' NOT IN ('done','cancelled') THEN NULLIF(data->>'due_date','') END ASC NULLS LAST,
              created_at DESC,id DESC LIMIT 51 OFFSET ${offset}`
        : await sql`SELECT data FROM bqlda_collaboration WHERE project=${project} AND kind=${kind}
            AND (${taskType}='' OR data->>'task_type'=${taskType})
            AND (owner=${username} OR data->>'assignee'=${username} OR data->>'reviewer'=${username}
              OR data->'collaborators' ? ${username} OR data->'members' ? ${username})
            ORDER BY CASE WHEN kind='task' AND data->>'status' IN ('done','cancelled') THEN 1 ELSE 0 END,
              CASE WHEN kind='task' AND data->>'status' NOT IN ('done','cancelled') THEN NULLIF(data->>'due_date','') END ASC NULLS LAST,
              created_at DESC,id DESC LIMIT 51 OFFSET ${offset}`;
      return ok({items:list.slice(0,50).map(x => publicItem(x.data)),next_offset:list.length > 50 ? offset + 50 : null});
    }
    if (method === 'collab_get') {
      const item = await get(sql,project,args[1]);
      if (!item || !['task','note','event','conversation','topic','mail_share'].includes(item.kind) || !model.visible(item,user.username)) return fail('Không tìm thấy hoặc không có quyền.');
      if(item.kind==='mail_share'&&(!can(user,state,'tab_mail')||item.revoked))return fail('Không có quyền xem Mail chia sẻ.');
      return ok(publicItem(item));
    }
    if (method === 'collab_messages') {
      const item = await get(sql,project,args[1]);
      if (!item || !['task','event','conversation','topic'].includes(item.kind) || !model.visible(item,user.username)) return fail('Không có quyền xem trao đổi.');
      const offset = Number(args[2] || 0);
      if (!Number.isInteger(offset) || offset < 0 || offset > 100000) return fail('Trang không hợp lệ.');
      const list = await sql`SELECT data FROM bqlda_collaboration WHERE project=${project} AND kind='message' AND parent_id=${item.id}
        ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ${offset}`;
      return ok({items:list.slice(0,50).map(x => publicItem(x.data)),next_offset:list.length > 50 ? offset + 50 : null});
    }
    if (method === 'collab_summary') {
      const username = user.username;
      const list = await sql`SELECT data FROM bqlda_collaboration WHERE project=${project} AND kind='task'
        AND (owner=${username} OR data->>'assignee'=${username} OR data->>'reviewer'=${username} OR data->'collaborators' ? ${username})`;
      const today = todayString();
      return ok({...model.summary(list.map(x=>x.data),today),as_of:new Date().toISOString(),scope:'Các việc bạn được phép xem'});
    }
    if (method === 'collab_daily_list' || method === 'collab_attachments') {
      const parent=await get(sql,project,args[1]);
      if(!parent||!['task','topic','event','conversation'].includes(parent.kind)||!model.visible(parent,user.username))return fail('Không có quyền đọc nguồn.');
      const kind=method==='collab_daily_list'?'daily_update':'attachment';
      const rows=await sql`SELECT data - 'content_base64' AS data FROM bqlda_collaboration WHERE project=${project} AND kind=${kind} AND parent_id=${parent.id} ORDER BY created_at DESC,id DESC LIMIT 500`;
      return ok({items:rows.map(row=>{const {content_base64,...metadata}=row.data;return publicItem(metadata);}),limit:500});
    }
    if(method==='collab_daily_matrix'){
      const start=model.date(args[1],true),end=model.date(args[2],true),username=user.username;
      if(end<start||(Date.parse(end)-Date.parse(start))/86400000>31)return fail('Chọn khoảng tối đa 31 ngày.');
      const rows=await sql`SELECT r.data FROM bqlda_collaboration r JOIN bqlda_collaboration t ON r.parent_id=t.id AND r.project=t.project
        WHERE r.project=${project} AND r.kind='daily_update' AND r.data->>'report_date'>=${start} AND r.data->>'report_date'<=${end}
        AND (t.owner=${username} OR t.data->>'assignee'=${username} OR t.data->>'reviewer'=${username} OR t.data->'collaborators' ? ${username})
        ORDER BY r.created_at DESC LIMIT 1001`;
      return ok({items:rows.slice(0,1000).map(x=>publicItem(x.data)),truncated:rows.length>1000});
    }
    if (method === 'collab_attachment_get') {
      const attachment=await get(sql,project,args[1]);
      if(!attachment||attachment.kind!=='attachment')return fail('Không tìm thấy tệp.');
      const parent=await get(sql,project,attachment.parent_id);
      if(!parent||!model.visible(parent,user.username))return fail('Không có quyền tải tệp.');
      return ok(publicItem(attachment));
    }
    if (method === 'collab_notifications') {
      const username=user.username;
      const preferences=await readPreferences(sql,username);
      await seedReminders(sql,project,username,preferences.settings);
      const rows=await sql`SELECT n.data,p.data->>'title' AS title,p.kind AS source_kind,
        count(*) OVER() AS total,count(*) FILTER(WHERE n.data->>'read_at' IS NULL) OVER() AS unread
        FROM bqlda_collaboration n JOIN bqlda_collaboration p ON p.id=n.parent_id AND p.project=n.project
        WHERE n.project=${project} AND n.kind='notification' AND n.owner=${username}
        AND (n.data->>'action'<>'due' OR p.data->>'status' NOT IN ('done','cancelled'))
        AND (p.owner=${username} OR p.data->>'assignee'=${username} OR p.data->>'reviewer'=${username}
          OR p.data->'collaborators' ? ${username} OR p.data->'members' ? ${username})
        ORDER BY n.created_at DESC,n.id DESC LIMIT 100`;
      return ok({items:rows.map(row=>({...publicItem(row.data),title:row.title||'Trao đổi mới',source_kind:row.source_kind})),unread:Number(rows[0]?.unread||0),total:Number(rows[0]?.total||0),delivery_allowed:model.deliveryAllowed(preferences.settings)});
    }
    if (method === 'collab_notification_read') {
      const item=await get(sql,project,args[1]);
      if(!item||item.kind!=='notification'||item.owner!==user.username)return fail('Không có quyền cập nhật thông báo.');
      const updated={...item,read_at:item.read_at||new Date().toISOString()};
      await sql`UPDATE bqlda_collaboration SET data=${JSON.stringify(updated)}::jsonb,updated_at=now() WHERE id=${item.id} AND owner=${user.username} AND project=${project}`;
      return ok({read:true});
    }
    if (method === 'collab_home') {
      const username=user.username;
      const tasks=await sql`SELECT data FROM bqlda_collaboration WHERE project=${project} AND kind='task'
        AND (owner=${username} OR data->>'assignee'=${username} OR data->>'reviewer'=${username} OR data->'collaborators' ? ${username})`;
      const all=tasks.map(x=>publicItem(x.data)),mine=all.filter(x=>x.assignee===username||(x.collaborators||[]).includes(username)),today=todayString();
      const role=String(user.role||'').toLowerCase(),layout=role==='admin'||canAssign?'management':role.includes('văn phòng')?'office':'personal';
      return ok({layout,role:user.role,today,preferences:await readPreferences(sql,username),summary:model.summary(all,today),
        scope_work:model.sortTasks(all).slice(0,200).map(x=>({...x,display_status:model.statusInfo(x,today)})),
        my_work:model.sortTasks(mine).slice(0,100).map(x=>({...x,display_status:model.statusInfo(x,today)})),
        review:all.filter(x=>x.reviewer===username&&x.status==='review').slice(0,100),
        support:all.filter(x=>x.task_type==='incident'&&x.status!=='done'&&x.status!=='cancelled').slice(0,50),as_of:new Date().toISOString()});
    }
    if(method==='collab_preferences')return ok(await readPreferences(sql,user.username));
    if(method==='collab_save_preferences'){
      const input=args[1]||{},id=stableId('preferences:'+user.username),old=await get(sql,'__user__',id),settings=model.preferences(input.settings||{}),now=new Date().toISOString();
      if(input.revision!==(old?.revision||0))return fail('Cài đặt đã thay đổi. Tải lại trước khi lưu.');
      const value={id,kind:'preferences',project:'__user__',owner:user.username,members:[user.username],settings,revision:(old?.revision||0)+1,created_at:old?.created_at||now,updated_at:now};
      const saved=old?await replace(sql,value,old.revision,user.username):await insert(sql,value,crypto.createHash('sha256').update(JSON.stringify(settings)).digest('hex'),user.username);
      return ok({revision:saved.revision,settings:saved.settings});
    }
    if (!writeAllowed) return fail('Bạn chỉ được xem To do.');
    if (method === 'collab_topic_create') {
      if(!canAssign)return fail('Không có quyền giao báo cáo chuyên đề.');
      const input=args[1]||{},respondents=model.names(input.respondents||[]);
      if(!uuid(input.request_id)||!respondents.length)return fail('Chọn người phản hồi và mã thao tác hợp lệ.');
      const now=new Date().toISOString(),hash=crypto.createHash('sha256').update(JSON.stringify({input,project,user:user.username})).digest('hex');
      const previous=await get(sql,project,input.request_id);
      if(previous){if(previous.owner===user.username&&previous.request_hash===hash)return ok(publicItem(previous));return fail('Mã thao tác đã được dùng.');}
      const parent=model.create('topic',{...input,members:respondents},{...ctx,id:input.request_id,now});
      const children=respondents.map(assignee=>({...model.create('task',{...input,task_type:'thematic',assignee,collaborators:[],reviewer:user.username},{...ctx,id:stableId(parent.id+':'+assignee),now}),parent_id:parent.id}));
      parent.task_ids=children.map(x=>x.id);parent.request_hash=hash;
      const notifications=children.flatMap(x=>noticeRows(x,user.username));
      const rows=await sql`WITH saved AS (
        INSERT INTO bqlda_collaboration(id,kind,project,owner,revision,data)
        VALUES(${parent.id},'topic',${project},${parent.owner},1,${JSON.stringify(parent)}::jsonb)
        ON CONFLICT(id) DO NOTHING RETURNING data
      ), children AS (
        INSERT INTO bqlda_collaboration(id,kind,project,owner,parent_id,revision,data)
        SELECT c->>'id','task',${project},c->>'owner',${parent.id},1,c FROM jsonb_array_elements(${JSON.stringify(children)}::jsonb) c WHERE EXISTS(SELECT 1 FROM saved) RETURNING id
      ), notified AS (
        INSERT INTO bqlda_collaboration(id,kind,project,owner,parent_id,revision,data)
        SELECT n->>'id','notification',${project},n->>'owner',n->>'parent_id',1,n FROM jsonb_array_elements(${JSON.stringify(notifications)}::jsonb) n WHERE EXISTS(SELECT 1 FROM saved) RETURNING id
      ) SELECT data FROM saved`;
      if(rows.length)return ok(publicItem(rows[0].data));
      const retry=await get(sql,project,parent.id);
      if(retry?.owner===user.username&&retry.request_hash===hash)return ok(publicItem(retry));
      return fail('Không thể xác nhận yêu cầu chuyên đề. Tải lại trước khi thử lại.');
    }
    if (method === 'collab_daily_save') {
      const parent=await get(sql,project,args[1]),input=args[2]||{};
      if(!parent||parent.kind!=='task'||!model.visible(parent,user.username)||![parent.assignee,...(parent.collaborators||[])].includes(user.username))return fail('Chỉ cán bộ được giao hoặc phối hợp được cập nhật ngày.');
      if(['done','cancelled'].includes(parent.status))return fail('Việc đã kết thúc.');
      const day=model.date(input.date,true);
      if(day>todayString())return fail('Không báo cáo kết quả cho ngày tương lai.');
      const id=stableId(`${project}:${parent.id}:${user.username}:${day}`),old=await get(sql,project,id),now=new Date().toISOString();
      const requestHash=crypto.createHash('sha256').update(JSON.stringify({input,user:user.username})).digest('hex');
      if(old?.request_hash===requestHash)return ok(publicItem(old));
      const data={id,kind:'daily_update',project,parent_id:parent.id,owner:user.username,members:[...model.memberNames(parent)],
        report_date:day,fields:model.reportFields(input.fields),body:model.text(input.body,3000,'Ghi chú'),links:model.links(input.links||[]),
        progress:input.progress,request_hash:requestHash,revision:old?old.revision+1:1,created_at:old?.created_at||now,updated_at:now};
      if(!Number.isInteger(data.progress)||data.progress<0||data.progress>100)return fail('Tiến độ không hợp lệ.');
      if(old){if(input.revision!==old.revision)return fail('Báo cáo ngày đã thay đổi. Tải lại trước khi sửa.');data.history=[...(old.history||[]),{at:old.updated_at,fields:old.fields,progress:old.progress,links:old.links}].slice(-50);return ok(publicItem(await replace(sql,data,old.revision,user.username)));}
      if(input.revision!==undefined&&input.revision!==0)return fail('Phiên bản báo cáo không hợp lệ.');
      return ok(publicItem(await insert(sql,data,requestHash,user.username)));
    }
    if (method === 'collab_upload') {
      const parent=await get(sql,project,args[1]),input=args[2]||{};
      if(!parent||!['task','topic','conversation','event'].includes(parent.kind)||!model.visible(parent,user.username))return fail('Không có quyền gửi tệp.');
      if(!uuid(input.request_id)||typeof input.content_base64!=='string'||input.content_base64.length>1400000||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.content_base64))return fail('Tệp không hợp lệ hoặc vượt 1 MB.');
      const bytes=Buffer.from(input.content_base64,'base64');if(!bytes.length||bytes.length>1048576)return fail('Mỗi tệp tối đa 1 MB; tệp lớn dùng liên kết tài liệu.');
      const filename=model.text(input.filename,180,'Tên tệp',true).replace(/[\\/\x00-\x1f]/g,'_');
      const mime=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':'application/octet-stream';
      const now=new Date().toISOString(),hash=crypto.createHash('sha256').update(bytes).digest('hex');
      const item={id:input.request_id,kind:'attachment',project,owner:user.username,parent_id:parent.id,members:[...model.memberNames(parent)],filename,mime,size:bytes.length,sha256:hash,content_base64:input.content_base64,revision:1,created_at:now,updated_at:now};
      const requestHash=crypto.createHash('sha256').update(JSON.stringify({hash,filename,parent:parent.id,owner:user.username})).digest('hex');
      const saved=await insert(sql,item,requestHash,user.username);const {content_base64,...metadata}=saved;return ok(publicItem(metadata));
    }
    if (method === 'collab_create') {
      const kind = String(args[1] || ''), input = args[2] || {};
      if(kind==='topic')return fail('Dùng chức năng giao báo cáo chuyên đề để tạo các đầu việc phản hồi.');
      if (!uuid(input.request_id)) return fail('Thiếu mã thao tác hợp lệ để chống gửi trùng.');
      const hash = crypto.createHash('sha256').update(JSON.stringify({kind,project,input,user:user.username})).digest('hex');
      const item = model.create(kind,input,{...ctx,id:input.request_id});
      if(input.source_id){const source=await get(sql,project,input.source_id);if(kind!=='note'||!source||!model.visible(source,user.username))return fail('Không có quyền lưu nguồn vào ghi chú.');item.source_ref={id:source.id,kind:source.kind,project};}
      return ok(publicItem(await insert(sql,item,hash,user.username)));
    }
    if (method === 'collab_update') {
      const item = await get(sql,project,args[1]);
      if (!item || !['task','note','event','conversation'].includes(item.kind)) return fail('Không tìm thấy dữ liệu.');
      const input = args[2] || {}, updated = model.update(item,input,ctx);
      return ok(publicItem(await replace(sql,updated,input.revision,user.username)));
    }
    if (method === 'collab_send') {
      const parent = await get(sql,project,args[1]), input = args[2] || {};
      if (!parent || !['task','event','conversation','topic'].includes(parent.kind) || !model.visible(parent,user.username)) return fail('Không có quyền gửi trao đổi.');
      if (!uuid(input.request_id)) return fail('Thiếu mã thao tác hợp lệ.');
      const now = new Date().toISOString();
      const item = {id:input.request_id,kind:'message',project,owner:user.username,parent_id:parent.id,
        body:model.text(input.body,10000,'Nội dung',true),links:model.links(input.links || []),
        members:[...model.memberNames(parent)],revision:1,created_at:now,updated_at:now};
      const hash = crypto.createHash('sha256').update(JSON.stringify({project,parent:parent.id,input,user:user.username})).digest('hex');
      return ok(publicItem(await insert(sql,item,hash,user.username)));
    }
    return fail('Phương thức cộng tác chưa hỗ trợ.');
  } catch (error) { return fail(error.message || 'Không thể xử lý cộng tác.'); }
}
module.exports = handle;
module.exports.storage = {ensure,get,insert,replace};
