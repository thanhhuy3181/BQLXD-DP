// AD sends normalized mail over HTTPS with its individually paired device token.
const crypto=require('crypto');
const {neon}=require('@neondatabase/serverless');
const {can,active,deviceKeyMatches}=require('./awm_rpc');
// Cây hòm thư/Data do AD gửi lên: chỉ tên, mã và số thư của từng thư mục (không có nội dung thư)
const TREE_MAX_NODES=1500,TREE_MAX_DEPTH=8,TREE_MAX_STORES=40;
const hex24=v=>typeof v==='string'&&/^[0-9a-f]{24}$/.test(v);
function sanitizeTree(stores){
 let budget=TREE_MAX_NODES;
 const count=v=>Math.max(0,Math.min(10000000,Number(v)||0));
 const node=(n,depth)=>{
  if(!n||!hex24(n.id)||budget<=0||depth>TREE_MAX_DEPTH)return null;
  budget--;
  const children=(Array.isArray(n.children)?n.children:[]).map(c=>node(c,depth+1)).filter(Boolean);
  return {id:n.id,name:String(n.name||'').slice(0,200),count:count(n.count),unread:count(n.unread),children};
 };
 return (Array.isArray(stores)?stores:[]).slice(0,TREE_MAX_STORES).map(s=>{
  if(!s||!hex24(s.id))return null;
  const folders=(Array.isArray(s.folders)?s.folders:[]).map(f=>node(f,1)).filter(Boolean);
  return {id:s.id,kind:s.kind==='mailbox'?'mailbox':'data',name:String(s.name||'').slice(0,200),folders};
 }).filter(Boolean);
}
// Một dòng thư trong danh sách thư mục: tiêu đề, người gửi, ngày, cờ (không có nội dung)
function cleanFolderRow(r){
 if(!r||typeof r.id!=='string'||!/^[0-9a-f]{64}$/.test(r.id))return null;
 return {id:r.id,subject:String(r.subject||'').slice(0,1000),sender:String(r.sender||'').slice(0,500),to_text:String(r.to_text||'').slice(0,500),date:String(r.date||'').slice(0,100),unread:r.unread===true,att_count:Math.max(0,Math.min(999,Number(r.att_count)||0)),categories:String(r.categories||'').slice(0,300)};
}
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
  // Kiểm tra khóa trước: người không có khóa đúng luôn nhận cùng một lỗi, không dò được tài khoản.
  if(!row||!deviceKeyMatches(row.device,token))return fail(403,'Khóa thiết bị không còn hiệu lực, cần ghép cặp lại.');
  if(!active(user))return fail(403,'Tài khoản web chưa được kích hoạt hoặc đã bị khóa.');
  if(!can(user,state,'tab_mail'))return fail(403,'Tài khoản web không có quyền Mail.');
  // ---- Hộp thư đi: AwD/AwM soạn, AD lấy về gửi qua Outlook ----
  const action=String(req.body?.action||''),outKey=`awm:outbox:${username}`;
  const readKey=async k=>(await sql`SELECT value FROM bqlda_state WHERE key=${k}`)[0]?.value;
  const writeKey=(k,v)=>sql`INSERT INTO bqlda_state(key,value) VALUES(${k},${JSON.stringify(v)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;
  // ---- Yêu cầu nội dung thư cũ: AwD/AwM tạo, AD lấy về đọc rồi trả kết quả ----
  const op=String(req.body?.op||''),reqKey=`awm:mailreq:${username}`;
  if(op==='mailreq_fetch'){
   const list=Array.isArray(await readKey(reqKey))?await readKey(reqKey):[];const now=new Date().toISOString();const out=[];
   for(const r of list){if(r.status==='fetching'&&Date.now()-Date.parse(r.updated_at)>2*60000)r.status='queued';
    if(r.status==='queued'){r.status='fetching';r.updated_at=now;out.push({id:r.id,type:r.type,mail_id:r.mail_id,folder_id:r.folder_id||''});}}
   await writeKey(reqKey,list);return res.json({ok:true,data:{requests:out}});
  }
  if(op==='mailreq_result'){
   const rid=String(req.body?.id||''),good=req.body?.ok===true;
   const list=Array.isArray(await readKey(reqKey))?await readKey(reqKey):[];const target=list.find(r=>r.id===rid);
   if(!target)return res.json({ok:true,data:{updated:false}});
   const now=new Date().toISOString();
   if(target.type==='list'){
    // Danh sách thư của một thư mục: lưu riêng để danh sách yêu cầu không phình to
    const rows=good&&Array.isArray(req.body?.items)?req.body.items.slice(0,500).map(cleanFolderRow).filter(Boolean):[];
    if(good&&hex24(target.folder_id))await writeKey(`awm:mailfolder:${username}:${target.folder_id}`,{updated_at:now,items:rows});
    target.result=good?{count:rows.length}:null;
   }else target.result=good?{text:String(req.body?.text||'').slice(0,100000)}:null;
   target.status=good?'done':'error';
   target.error=good?'':String(req.body?.error||'AD không đọc được thư này.').slice(0,300);
   target.progress=null;
   target.updated_at=now;
   await writeKey(reqKey,list);return res.json({ok:true,data:{updated:true}});
  }
  // ---- Cây hòm thư/Data (AD gửi), thứ tự hiển thị, tiến trình liệt kê thư mục ----
  if(op==='mail_tree'){
   const stores=sanitizeTree(req.body?.stores);
   await writeKey(`awm:mailtree:${username}`,{updated_at:new Date().toISOString(),stores});
   return res.json({ok:true,data:{stores:stores.length,order:(await readKey(`awm:mailorder:${username}`))||[]}});
  }
  if(op==='mail_order'){
   const order=Array.isArray(req.body?.order)?req.body.order.filter(hex24).slice(0,TREE_MAX_STORES):[];
   await writeKey(`awm:mailorder:${username}`,order);
   return res.json({ok:true,data:{saved:order.length}});
  }
  if(op==='mailreq_progress'){
   const rid=String(req.body?.id||'');
   const raw=await readKey(reqKey),list=Array.isArray(raw)?raw:[];const target=list.find(r=>r.id===rid);
   if(!target||target.status!=='fetching')return res.json({ok:true,data:{updated:false}});
   const total=Math.max(0,Math.min(1000000,Number(req.body?.total)||0));
   target.progress={done:Math.max(0,Math.min(total,Number(req.body?.done)||0)),total};
   target.updated_at=new Date().toISOString();
   await writeKey(reqKey,list);return res.json({ok:true,data:{updated:true}});
  }
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
  if(items!==undefined&&(!Array.isArray(items)||items.length>1000||Buffer.byteLength(JSON.stringify(items),'utf8')>4000000))return fail(400,'Lô đồng bộ quá lớn');
  const connectorState=req.body?.connector_state||'ready';if(!['ready','error','stopped'].includes(connectorState))return fail(400,'Trạng thái connector không hợp lệ');
  const key=`awm:mail:${username}`;const old=await sql`SELECT value FROM bqlda_state WHERE key=${key}`;
  if(items?.some(r=>!r||typeof r.id!=='string'||!r.id||r.id.length>200)||items&&new Set(items.map(r=>r.id)).size!==items.length)return fail(400,'Mã thư thiếu, quá dài hoặc trùng lặp');
  const people=v=>Array.isArray(v)?v.slice(0,50).map(p=>({name:String(p?.name||'').slice(0,200),email:String(p?.email||'').slice(0,200)})):[];
  const cleaned=items?.map(r=>({id:r.id,subject:String(r.subject||'').slice(0,1000),sender:String(r.sender||'').slice(0,500),email:String(r.email||'').slice(0,500),date:String(r.date||'').slice(0,100),body:String(r.body||'').slice(0,100000),project:String(r.project||'').slice(0,200),account:String(r.account||'').slice(0,200),folder:String(r.folder||'').slice(0,200),categories:String(r.categories||'').slice(0,300),unread:r.unread===true,attachments:Array.isArray(r.attachments)?r.attachments.slice(0,50).map(x=>String(x).slice(0,180)):[],to:people(r.to),cc:people(r.cc)}));
  // Giữ toàn bộ tiêu đề và người gửi (nhẹ). Nội dung chỉ giữ cho 50 thư nhận
  // và 20 thư gửi mới nhất; các thư còn lại để trống nội dung.
  const BODY_KEEP={inbox:50,sent:20};
  const retainMail=list=>{const counts={inbox:0,sent:0};return [...list].sort((a,b)=>Date.parse(b.date||0)-Date.parse(a.date||0)).map(r=>{const k=r.folder==='Sent Items'?'sent':'inbox';const keepBody=counts[k]<BODY_KEEP[k];counts[k]++;return keepBody?r:{...r,body:''};});};
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
  const reqRaw=await readKey(reqKey),mailreqPending=Array.isArray(reqRaw)?reqRaw.filter(r=>r.status==='queued').length:0;
  return res.json({ok:true,data:{accepted:data.items.length,outbox_pending:pending,mailreq_pending:mailreqPending}});
 }catch(e){console.error('AD mail bridge:',e.message);return fail(500,'Không thể đồng bộ Mail lúc này');}
};}
module.exports=createHandler();
module.exports.createHandler=createHandler;
