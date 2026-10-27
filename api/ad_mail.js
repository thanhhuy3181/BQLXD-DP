// AD sends normalized mail over HTTPS with its individually paired device token.
const crypto=require('crypto');
const {neon}=require('@neondatabase/serverless');
const {can,active}=require('./awm_rpc');
function createHandler(getSql=()=>neon(process.env.DATABASE_URL||process.env.POSTGRES_URL||process.env.POSTGRES_PRISMA_URL||'')){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 const fail=(code,error)=>res.status(code).json({ok:false,error});
 if(req.method!=='POST')return fail(405,'POST required');
 try{
  const sql=getSql();
  const {username,device_name,items}=req.body||{};
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  if(!token||!username||String(username).length>100)return fail(401,'Thiếu danh tính thiết bị');
  const rows=await sql`SELECT u.username,u.status,u.data,s.value AS device FROM bqlda_users u JOIN bqlda_state s ON s.key=${`awm:device:${username}`} WHERE u.username=${username}`;
  const row=rows[0],user=row&&{...row.data,role:({'Phó nhóm':'Nội nghiệp','Thành viên':'CBGS'}[row.data.role]||row.data.role),username:row.username,status:row.status};
  const states=await sql`SELECT value FROM bqlda_state WHERE key='state'`;const state=states[0]?.value||{};
  const actual=crypto.createHash('sha256').update(token).digest('hex');
  if(!active(user)||!can(user,state,'tab_mail')||! /^[0-9a-f]{64}$/.test(row.device?.hash||'')||!crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(row.device.hash)))return fail(403,'Thiết bị không được cấp quyền');
  // ---- Hộp thư đi: AwD/AwM soạn, AD lấy về gửi qua Outlook ----
  const action=String(req.body?.action||''),outKey=`awm:outbox:${username}`;
  const readKey=async k=>(await sql`SELECT value FROM bqlda_state WHERE key=${k}`)[0]?.value;
  const writeKey=(k,v)=>sql`INSERT INTO bqlda_state(key,value) VALUES(${k},${JSON.stringify(v)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;
  if(action==='outbox_fetch'){
   const box=Array.isArray(await readKey(outKey))?await readKey(outKey):[];const now=new Date().toISOString();const jobs=[];
   for(const j of box){if(j.status==='queued'){j.status='sending';j.updated_at=now;jobs.push(j);}else if(j.status==='sending'&&Date.now()-Date.parse(j.updated_at)>10*60000){j.status='error';j.error='AD không phản hồi khi gửi. Kiểm tra Hộp thư đi trong Outlook trước khi gửi lại.';j.updated_at=now;}}
   await writeKey(outKey,box);return res.json({ok:true,data:{jobs}});
  }
  if(action==='att_get'){
   const id=String(req.body?.att_id||'');if(!/^[0-9a-f]{32}$/.test(id))return fail(400,'Mã tệp không hợp lệ');
   const att=await readKey(`awm:att:${username}:${id}`);if(!att)return fail(404,'Tệp đính kèm không còn trên máy chủ');
   return res.json({ok:true,data:{name:att.name,type:att.type,data:att.data}});
  }
  if(action==='outbox_result'){
   const box=Array.isArray(await readKey(outKey))?await readKey(outKey):[];const job=box.find(j=>j.id===String(req.body?.id||''));
   if(job){job.status=req.body?.ok===true?'sent':'error';job.error=req.body?.ok===true?'':String(req.body?.error||'Gửi thất bại').slice(0,500);job.updated_at=new Date().toISOString();
    for(const a of job.attachments||[])await sql`DELETE FROM bqlda_state WHERE key=${`awm:att:${username}:${a.id}`}`;
    await writeKey(outKey,box.slice(-50));}
   return res.json({ok:true,data:{updated:!!job}});
  }
  if(Array.isArray(req.body?.contacts)){
   const contacts=req.body.contacts.slice(0,3000).map(c=>({name:String(c?.name||'').slice(0,200),email:String(c?.email||'').slice(0,200)})).filter(c=>/^[^@\s]+@[^@\s]+$/.test(c.email));
   await writeKey(`awm:contacts:${username}`,contacts);
  }
  if(items!==undefined&&(!Array.isArray(items)||items.length>1000||Buffer.byteLength(JSON.stringify(items),'utf8')>2000000))return fail(400,'Lô đồng bộ quá lớn');
  const connectorState=req.body?.connector_state||'ready';if(!['ready','error','stopped'].includes(connectorState))return fail(400,'Trạng thái connector không hợp lệ');
  const key=`awm:mail:${username}`;const old=await sql`SELECT value FROM bqlda_state WHERE key=${key}`;
  if(items?.some(r=>!r||typeof r.id!=='string'||!r.id||r.id.length>200)||items&&new Set(items.map(r=>r.id)).size!==items.length)return fail(400,'Mã thư thiếu, quá dài hoặc trùng lặp');
  const people=v=>Array.isArray(v)?v.slice(0,50).map(p=>({name:String(p?.name||'').slice(0,200),email:String(p?.email||'').slice(0,200)})):[];
  const cleaned=items?.map(r=>({id:r.id,subject:String(r.subject||'').slice(0,1000),sender:String(r.sender||'').slice(0,500),email:String(r.email||'').slice(0,500),date:String(r.date||'').slice(0,100),body:String(r.body||'').slice(0,100000),project:String(r.project||'').slice(0,200),account:String(r.account||'').slice(0,200),folder:String(r.folder||'').slice(0,200),unread:r.unread===true,attachments:Array.isArray(r.attachments)?r.attachments.slice(0,50).map(x=>String(x).slice(0,180)):[],to:people(r.to),cc:people(r.cc)}));
  // Danh sách giữ tối đa 200 thư (chỉ tiêu đề, nhẹ). Nội dung chỉ giữ cho 50 thư nhận
  // và 20 thư gửi mới nhất; các thư còn lại để trống nội dung.
  const HEADER_MAX=200,BODY_KEEP={inbox:50,sent:20};
  const retainMail=list=>{const counts={inbox:0,sent:0};return [...list].sort((a,b)=>Date.parse(b.date||0)-Date.parse(a.date||0)).slice(0,HEADER_MAX).map(r=>{const k=r.folder==='Sent Items'?'sent':'inbox';const keepBody=counts[k]<BODY_KEEP[k];counts[k]++;return keepBody?r:{...r,body:''};});};
  const kept=cleaned&&retainMail(cleaned);
  const now=new Date().toISOString(),previous=old[0]?.value;
  const rawInfo=req.body?.scan_info,scanInfo=rawInfo?{total_inbox:Math.max(0,Number(rawInfo.total_inbox)||0),scan_limit:Math.max(0,Math.min(1000,Number(rawInfo.scan_limit)||0)),body_limit:Math.max(0,Math.min(100000,Number(rawInfo.body_limit)||0))}:previous?.scan_info||null;
  const data={device_name:String(device_name||'AD').slice(0,100),updated_at:now,last_sync_at:items!==undefined?now:previous?.last_sync_at||previous?.updated_at||null,connector_state:connectorState,scan_info:scanInfo,items:kept||previous?.items||[]};
  await sql`INSERT INTO bqlda_state(key,value) VALUES(${key},${JSON.stringify(data)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;
  // Thông báo đẩy khi có thư Inbox mới (bỏ qua lần đồng bộ đầu để không dội hàng loạt)
  if(kept&&Array.isArray(previous?.items)&&previous.items.length){
   const seenIds=new Set(previous.items.map(r=>r.id));
   const fresh=kept.filter(r=>!seenIds.has(r.id)&&(r.folder||'Inbox')==='Inbox'&&Date.now()-Date.parse(r.date||0)<6*3600000);
   if(fresh.length){
    try{const {notifyUser}=require('./_webpush');const first=fresh[0];
     await notifyUser(sql,username,{title:fresh.length>1?`📧 ${fresh.length} thư mới`:`📧 ${first.sender||'Thư mới'}`,body:fresh.length>1?fresh.slice(0,3).map(r=>`${r.sender}: ${r.subject}`).join('\n'):`${first.subject}\n${String(first.body||'').slice(0,120)}`,url:'/mobile/?view=mobile#mail',tag:'awm-mail',count:fresh.length});
    }catch(e){console.error('push:',e.message);}
   }
  }
  const outbox=await readKey(outKey);const pending=Array.isArray(outbox)?outbox.filter(j=>j.status==='queued').length:0;
  return res.json({ok:true,data:{accepted:data.items.length,outbox_pending:pending}});
 }catch(e){console.error('AD mail bridge:',e.message);return fail(500,'Không thể đồng bộ Mail lúc này');}
};}
module.exports=createHandler();
module.exports.createHandler=createHandler;
