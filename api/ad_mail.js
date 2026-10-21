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
  if(items!==undefined&&(!Array.isArray(items)||items.length>1000||Buffer.byteLength(JSON.stringify(items),'utf8')>2000000))return fail(400,'Lô đồng bộ quá lớn');
  const connectorState=req.body?.connector_state||'ready';if(!['ready','error','stopped'].includes(connectorState))return fail(400,'Trạng thái connector không hợp lệ');
  const key=`awm:mail:${username}`;const old=await sql`SELECT value FROM bqlda_state WHERE key=${key}`;
  if(items?.some(r=>!r||typeof r.id!=='string'||!r.id||r.id.length>200)||items&&new Set(items.map(r=>r.id)).size!==items.length)return fail(400,'Mã thư thiếu, quá dài hoặc trùng lặp');
  const cleaned=items?.map(r=>({id:r.id,subject:String(r.subject||'').slice(0,1000),sender:String(r.sender||'').slice(0,500),email:String(r.email||'').slice(0,500),date:String(r.date||'').slice(0,100),body:String(r.body||'').slice(0,100000),project:String(r.project||'').slice(0,200),unread:r.unread===true,attachments:Array.isArray(r.attachments)?r.attachments.slice(0,50).map(x=>String(x).slice(0,180)):[]}));
  const now=new Date().toISOString(),previous=old[0]?.value;
  const rawInfo=req.body?.scan_info,scanInfo=rawInfo?{total_inbox:Math.max(0,Number(rawInfo.total_inbox)||0),scan_limit:Math.max(0,Math.min(1000,Number(rawInfo.scan_limit)||0)),body_limit:Math.max(0,Math.min(100000,Number(rawInfo.body_limit)||0))}:previous?.scan_info||null;
  const data={device_name:String(device_name||'AD').slice(0,100),updated_at:now,last_sync_at:items!==undefined?now:previous?.last_sync_at||previous?.updated_at||null,connector_state:connectorState,scan_info:scanInfo,items:cleaned||previous?.items||[]};
  await sql`INSERT INTO bqlda_state(key,value) VALUES(${key},${JSON.stringify(data)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;
  return res.json({ok:true,data:{accepted:data.items.length}});
 }catch(e){console.error('AD mail bridge:',e.message);return fail(500,'Không thể đồng bộ Mail lúc này');}
};}
module.exports=createHandler();
module.exports.createHandler=createHandler;
