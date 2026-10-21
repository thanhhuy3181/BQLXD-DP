'use strict';
const crypto=require('crypto');
const model=require('./collaboration_model');
const {storage}=require('./collaboration_rpc');
const {active,can,mailOnline}=require('./awm_rpc');
const ok=data=>({ok:true,data,error:null}),fail=error=>({ok:false,data:null,error});
const validId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const onlineBridge=mailOnline;
async function bridge(sql,username){const rows=await sql`SELECT value FROM bqlda_state WHERE key=${'awm:mail:'+username}`;return rows[0]?.value||null;}
async function source(sql,share,state){
 const rows=await sql`SELECT username,status,data FROM bqlda_users WHERE username=${share.owner}`;
 const row=rows[0],owner=row&&{...row.data,username:row.username,status:row.status};
 if(!active(owner)||!can(owner,state,'tab_mail'))return {online:false};
 const data=await bridge(sql,share.owner),online=onlineBridge(data);
 if(!online)return {online:false};
 const message=(data.items||[]).find(x=>x.id===share.source_mail_id);
 return {online:true,message,last_sync:data.last_sync_at||data.updated_at};
}
module.exports=async({method,args=[],sql,user,state,allowedProject})=>{
 if(!method.startsWith('mailshare_'))return undefined;
 if(!active(user)||!can(user,state,'tab_mail'))return fail('Không có quyền truy cập Mail.');
 try{
  const project=model.text(args[0],200,'Dự án',true);
  if(!allowedProject(user,project))return fail('Không có quyền truy cập dự án.');
  await storage.ensure(sql);
  if(method==='mailshare_candidates'){
   const rows=await sql`SELECT username,status,data FROM bqlda_users WHERE status='Active'`;
   return ok({members:rows.map(row=>({...row.data,username:row.username,status:row.status})).filter(person=>active(person)&&allowedProject(person,project)&&can(person,state,'tab_mail')).map(person=>({username:person.username,fullname:person.fullname||person.username}))});
  }
  if(method==='mailshare_list'){
   const rows=await sql`SELECT data FROM bqlda_collaboration WHERE project=${project} AND kind='mail_share'
    AND NOT COALESCE((data->>'revoked')::boolean,false) AND (owner=${user.username} OR data->'members' ? ${user.username}) ORDER BY created_at DESC,id DESC LIMIT 100`;
   const items=[];
   for(const row of rows){const share=row.data,live=await source(sql,share,state);items.push({id:share.id,owner:share.owner,note:share.note,created_at:share.created_at,online:live.online,available:!!live.message,subject:live.message?.subject||'',sender:live.message?.sender||''});}
   return ok({items});
  }
  if(method==='mailshare_read'||method==='mailshare_revoke'){
   if(!validId(args[1]))return fail('Mã chia sẻ không hợp lệ.');
   const share=await storage.get(sql,project,args[1]);
   if(!share||share.kind!=='mail_share'||share.revoked||!model.visible(share,user.username))return fail('Chia sẻ không tồn tại hoặc đã bị thu hồi.');
   if(method==='mailshare_revoke'){
    if(share.owner!==user.username)return fail('Chỉ chủ thư được thu hồi chia sẻ.');
    const changed={...share,revoked:true,members:[],revision:share.revision+1,updated_at:new Date().toISOString()};
    await storage.replace(sql,changed,share.revision,user.username);return ok({revoked:true});
   }
   const live=await source(sql,share,state);
   if(!live.online)return fail('AD nguồn chưa kết nối. Không thể đọc thư.');
   if(!live.message)return fail('Thư không còn trong nguồn đồng bộ hiện tại.');
   // Return only the normalized, shared message; never the owner's mailbox.
   return ok({share:{id:share.id,owner:share.owner,note:share.note},message:live.message,last_sync:live.last_sync});
  }
  if(method==='mailshare_create'){
   const input=args[1]||{},id=input.request_id,mailId=model.text(input.mail_id,200,'Mã thư',true),recipients=model.names(input.recipients||[]);
   if(!validId(id)||!recipients.length)return fail('Chọn cán bộ nhận thư và mã thao tác hợp lệ.');
   const own=await bridge(sql,user.username),message=(own?.items||[]).find(x=>x.id===mailId);
   if(!onlineBridge(own)||!message)return fail('AD chưa kết nối hoặc thư không có trong nguồn của bạn.');
   if(message.project&&message.project!==project)return fail('Thư thuộc dự án khác.');
   const rows=await sql`SELECT username,status,data FROM bqlda_users WHERE status='Active'`;
   const eligible=new Set(rows.map(row=>({...row.data,username:row.username,status:row.status})).filter(person=>active(person)&&allowedProject(person,project)&&can(person,state,'tab_mail')).map(x=>x.username));
   for(const name of recipients)if(!eligible.has(name))return fail('Cán bộ nhận chưa có quyền Mail hoặc dự án.');
   const now=new Date().toISOString(),share={id,kind:'mail_share',project,owner:user.username,members:recipients,title:'Thư được chia sẻ',
    source_mail_id:mailId,note:model.text(input.note,2000,'Lời nhắn'),revoked:false,revision:1,created_at:now,updated_at:now};
   const hash=crypto.createHash('sha256').update(JSON.stringify({project,user:user.username,input})).digest('hex');
   const saved=await storage.insert(sql,share,hash,user.username);return ok({id:saved.id,shared_with:saved.members});
  }
  return fail('Phương thức chia sẻ Mail chưa hỗ trợ.');
 }catch(error){return fail(error.message||'Không thể chia sẻ thư.');}
};
