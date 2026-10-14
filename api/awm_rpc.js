const crypto = require('crypto');
const snapshots = require('./data/menu_workspace.json');
const ok = data => ({ok:true,data,error:null});
const fail = error => ({ok:false,data:null,error});
const groups = {progress:['Tiến độ','td_progress'],hsmt:['HSMT','td_hsmt'],contract:['Hợp đồng','td_contract'],payment:['Thanh toán','td_payment'],boq:['BOQ','td_boq'],contractor:['Nhà thầu','td_contractor'],sap:['SAP','td_sap'],'chu-truong':['Chủ trương','ql_tab_phe_duyet'],bvtk:['BVTK','ql_tab_bvtk']};
const menus = [['approval','Phê duyệt','ql_tab_phe_duyet'],['design','Bản vẽ thiết kế','ql_tab_bvtk'],['hsmt','HSMT','ql_tab_hsmt'],['contract','Hợp đồng','ql_tab_hop_dong'],['payment','Thanh toán','ql_tab_tu_tt']];
function can(user,state,key){if(user?.role==='Admin')return true;const v=state.role_permissions?.permissions?.[user?.role]?.[key];return v===true||['view','edit','full'].includes(v);}
function active(user){return !!user&&user.username!=='guest'&&user.status==='Active';}
const norm = s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
async function read(sql,key,fallback){const rows=await sql`SELECT value FROM bqlda_state WHERE key=${key}`;return rows[0]?.value??fallback;}
async function write(sql,key,value){await sql`INSERT INTO bqlda_state(key,value) VALUES(${key},${JSON.stringify(value)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;}
module.exports=async({method,args,sql,user,state,allowedProject,visibleProjects})=>{
 if(!method.startsWith('awm_'))return undefined;
 if(!active(user))return fail('Phiên đăng nhập không hợp lệ hoặc tài khoản chưa được kích hoạt.');
 const permission=key=>can(user,state,key);
 if(method==='awm_bootstrap')return ok({user:{username:user.username,fullname:user.fullname,email:user.email,role:user.role},projects:visibleProjects(user,state.projects?.all_projects||[]),nav:{home:permission('tab_home'),mail:permission('tab_mail'),files:permission('tab_quan_ly'),tracking:permission('tab_theo_doi'),todo:true},groups:Object.entries(groups).filter(([,g])=>permission('tab_theo_doi')&&permission(g[1])).map(([id,g])=>({id,name:g[0]})),menus:menus.filter(m=>permission('tab_quan_ly')&&permission(m[2])).map(([id,name])=>({id,name}))});
 const project=String(args[0]||'');
 if(method==='awm_tracking'){
  const [,tab,query='',cursor=0]=args;
  if(!allowedProject(user,project)||!permission('tab_theo_doi')||!groups[tab]||!permission(groups[tab][1]))return fail('Không có quyền đọc nhóm hồ sơ hoặc dự án này.');
  let snapshot=snapshots[project]?.[tab];if(snapshot?.shared)snapshot=snapshots[snapshot.shared];
  const stored=await read(sql,`tracking:${project}:${tab}:`,snapshot||{items:[],columns:snapshots.__columns?.[tab]||[]});
  const q=norm(String(query).slice(0,200));const rows=(stored.items||[]).filter(r=>!q||norm(Object.values(r).filter(v=>typeof v!=='object').join(' ')).includes(q));
  const start=Math.max(0,Number(cursor)||0),end=start+30;
  return ok({project,columns:stored.columns||[],items:rows.slice(start,end),total:rows.length,next_cursor:end<rows.length?end:null,revision:stored.revision||'snapshot'});
 }
 if(method==='awm_folders'||method==='awm_save_folder'){
  const menu=menus.find(m=>m[0]===args[1]);
  if(!allowedProject(user,project)||!permission('tab_quan_ly'))return fail('Không có quyền xem QL hoặc dự án.');
  if(method==='awm_folders'){
   const data={};for(const [id,,key]of menus)if(permission(key))data[id]=await read(sql,`awm:folder:${user.username}:${project}:${id}`,null);
   return ok(data);
  }
  if(!menu||!permission(menu[2]))return fail('Không có quyền truy cập menu.');
  const folder=String(args[2]||'').trim();if(!/^[a-zA-Z0-9_-]{10,200}$/.test(folder))return fail('Folder ID Google Drive không hợp lệ.');
  await write(sql,`awm:folder:${user.username}:${project}:${menu[0]}`,{id:folder});return ok({saved:true});
 }
 if(method==='awm_mail_status'||method==='awm_mail_list'){
  if(!permission('tab_mail'))return fail('Không có quyền xem Mail.');
  const bridge=await read(sql,`awm:mail:${user.username}`,null);
  const online=!!bridge&&Date.now()-Date.parse(bridge.updated_at)<90000;
  if(method==='awm_mail_status')return ok({online,last_sync:bridge?.updated_at||null,source:bridge?.device_name||'',configured:!!bridge});
  if(!online)return fail('AD chưa kết nối. Mở AD trên máy tính để xem Mail.');
  const query=norm(args[1]);const items=(bridge.items||[]).filter(r=>(!r.project||allowedProject(user,r.project))&&(!project||!r.project||r.project===project)&&norm([r.subject,r.sender,r.body].join(' ')).includes(query));
  return ok({items:items.slice(0,100),last_sync:bridge.updated_at});
 }
 if(method==='awm_pair_device'){
  if(!permission('tab_mail'))return fail('Không có quyền kết nối Mail.');
  const token=crypto.randomBytes(32).toString('hex');
  await write(sql,`awm:device:${user.username}`,{hash:crypto.createHash('sha256').update(token).digest('hex'),created_at:new Date().toISOString()});
  return ok({device_token:token});
 }
 if(method==='awm_revoke_device'){
  await write(sql,`awm:device:${user.username}`,null);await write(sql,`awm:mail:${user.username}`,null);return ok({revoked:true});
 }
 return fail('AwM chưa hỗ trợ phương thức này.');
};
module.exports.can=can;
module.exports.active=active;
module.exports.groups=groups;
