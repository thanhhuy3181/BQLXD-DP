const crypto = require('crypto');
const snapshots = require('./data/menu_workspace.json');
const projectFoldersSeed = require('./data/project_folders.json');
const ok = data => ({ok:true,data,error:null});
const fail = error => ({ok:false,data:null,error});
const groups = {
  progress: ['Tiến độ', 'td_progress'],
  'chu-truong': ['Chủ trương', 'ql_tab_phe_duyet', 'td_progress'],
  bvtk: ['BVTK', 'ql_tab_bvtk', 'td_progress'],
  hsmt: ['HSMT', 'td_hsmt'],
  contract: ['Hợp đồng', 'td_contract'],
  payment: ['Thanh toán', 'td_payment'],
  boq: ['BOQ', 'td_boq'],
  contractor: ['Nhà thầu', 'td_contractor'],
  sap: ['SAP', 'td_sap']
};
// Keep the phone file areas aligned with every AwD Explorer tab that is
// backed by a project Drive folder.  Permissions remain the same RBAC keys
// used by AwD, so a phone never exposes a folder hidden on desktop.
const menus = [
 ['approval','Phê duyệt','ql_tab_phe_duyet'],
 ['progress','Tiến độ','ql_tab_tien_do'],
 ['technical','YC kỹ thuật','ql_tab_yc_kt'],
 ['design','Bản vẽ thiết kế','ql_tab_bvtk'],
 ['legal','Pháp lý','ql_tab_phap_ly'],
 ['guide','Cẩm nang','ql_tab_cam_nang'],
 ['standard','Chuẩn hóa','ql_tab_chuan_hoa'],
 ['hsmt','HSMT','ql_tab_hsmt'],
 ['contract','Hợp đồng','ql_tab_hop_dong'],
 ['payment','Thanh toán','ql_tab_tu_tt'],
 ['finalization','Quyết toán','ql_tab_tqt']
];
// Accounts created before the current job-title scheme still have their RBAC
// matrix stored under the former roles.  `publicUser` exposes the current
// names, so resolve the old entry as a fallback until an admin saves the
// matrix again.  This is shared by AwD RPCs and AwM; a phone must never get a
// different permission result from the desktop for the same account.
const legacyRole = {CBGS:'Thành viên','Nội nghiệp':'Phó nhóm'};
const levelRank={none:0,view:1,edit:2,full:3};
const mainTabs=new Set(['tab_home','tab_mail','tab_quan_ly','tab_theo_doi','tab_bao_cao','tab_so_sanh','tab_thanh_toan','tab_chuc_nang','tab_cai_dat']);
const detailParents={
 ql_tab_phe_duyet:['grp_ql_file','tab_quan_ly'],ql_tab_tien_do:['grp_ql_file','tab_quan_ly'],ql_tab_yc_kt:['grp_ql_file','tab_quan_ly'],ql_tab_bvtk:['grp_ql_file','tab_quan_ly'],ql_tab_phap_ly:['grp_ql_file','tab_quan_ly'],ql_tab_cam_nang:['grp_ql_file','tab_quan_ly'],ql_tab_chuan_hoa:['grp_ql_file','tab_quan_ly'],ql_tab_hsmt:['grp_ql_file','tab_quan_ly'],ql_tab_hop_dong:['grp_ql_file','tab_quan_ly'],ql_tab_tu_tt:['grp_ql_file','tab_quan_ly'],ql_tab_tqt:['grp_ql_file','tab_quan_ly'],ql_project_mgmt:['grp_ql_file','tab_quan_ly'],
 td_progress:['grp_theo_doi','tab_theo_doi'],td_hsmt:['grp_theo_doi','tab_theo_doi'],td_contract:['grp_theo_doi','tab_theo_doi'],td_boq:['grp_theo_doi','tab_theo_doi'],td_payment:['grp_theo_doi','tab_theo_doi'],td_contractor:['grp_theo_doi','tab_theo_doi'],td_sap:['grp_theo_doi','tab_theo_doi'],td_contractor_data:['grp_theo_doi','tab_theo_doi'],
 cn_tab_b1_word:['grp_chuc_nang','tab_chuc_nang'],cn_tab_b2_hsmt:['grp_chuc_nang','tab_chuc_nang'],cn_tab_b3_hd:['grp_chuc_nang','tab_chuc_nang'],cn_tab_b4_heading:['grp_chuc_nang','tab_chuc_nang'],cn_tab_b5_skill_hsmt:['grp_chuc_nang','tab_chuc_nang'],cn_tab_b5_skill_hd:['grp_chuc_nang','tab_chuc_nang'],cn_tab_b6_ai:['grp_chuc_nang','tab_chuc_nang'],cn_tab_b7_search:['grp_chuc_nang','tab_chuc_nang'],cn_tab_b8_central:['grp_chuc_nang','tab_chuc_nang'],cn_tab_b9_merge_boq:['grp_chuc_nang','tab_chuc_nang'],cn_down_hd:['grp_chuc_nang','tab_chuc_nang'],cn_down_cks:['grp_chuc_nang','tab_chuc_nang'],cn_export_excel:['grp_chuc_nang','tab_chuc_nang'],
 cd_theme:['grp_cai_dat','tab_cai_dat'],cd_hm_ctr:['grp_cai_dat','tab_cai_dat'],cd_ql_acc:['grp_cai_dat','tab_cai_dat'],cd_perm:['grp_cai_dat','tab_cai_dat'],cd_ai_engine:['grp_cai_dat','tab_cai_dat'],cd_excel_cfg:['grp_cai_dat','tab_cai_dat'],cd_links:['grp_cai_dat','tab_cai_dat'],cd_data_matrix:['grp_cai_dat','tab_cai_dat'],cd_backup:['grp_cai_dat','tab_cai_dat']
};
// grp_tabs is a desktop bulk-edit convenience only. It must not become a
// server-side cap, or a role set to Xem there could never receive Full for a
// specific primary tab and its detailed mobile area.
function parentKeys(key){if(key==='grp_tabs')return [];if(key==='grp_ql_file')return ['tab_quan_ly'];if(key==='grp_theo_doi')return ['tab_theo_doi'];if(key==='grp_chuc_nang')return ['tab_chuc_nang'];if(key==='grp_cai_dat')return ['tab_cai_dat'];if(mainTabs.has(key))return [];return detailParents[key]||[];}
function permissionValue(user,state,key){
 const permissions=state.role_permissions?.permissions||{};
 const role=user?.role;
 if(!role)return undefined;
 const current=permissions[role]?.[key];
 let value=current===undefined ? permissions[legacyRole[role]]?.[key] : current;
 // Existing saved matrices have no group-control records; absence means an
 // unrestricted ceiling, not a newly introduced denial.
 value=value===undefined?(key.startsWith('grp_')?'full':'none'):value;
 for(const parent of parentKeys(key)){const parentValue=permissionValue(user,state,parent);if((levelRank[parentValue]??0)<(levelRank[value]??0))value=parentValue;}
 return value;
}
function can(user,state,key){if(user?.role==='Admin')return true;const v=permissionValue(user,state,key);return v===true||['view','edit','full'].includes(v);}
function canEdit(user,state,key){if(user?.role==='Admin')return true;const v=permissionValue(user,state,key);return v===true||['edit','full'].includes(v);}
function active(user){return !!user&&user.username!=='guest'&&user.status==='Active';}
const norm = s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
// AwM is a reading interface, so each group opens with the newest document
// first.  Different datasets use different date field names and older
// records commonly store Vietnamese dd/mm/yyyy values.
function recordDate(row){
 for(const key of ['ngay_ph','date','date_sign','ngay_ky_hd','ngay_ph_hsmt','ngay_bd_tc_tt','updated_at','created_at']){
  const raw=String(row?.[key]||'').trim();if(!raw)continue;
  const vn=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(vn){const value=Date.UTC(Number(vn[3]),Number(vn[2])-1,Number(vn[1]));if(!Number.isNaN(value))return value;}
  const value=Date.parse(raw);if(!Number.isNaN(value))return value;
 }
 return -Infinity;
}
async function read(sql,key,fallback){const rows=await sql`SELECT value FROM bqlda_state WHERE key=${key}`;return rows[0]?.value??fallback;}
async function write(sql,key,value){await sql`INSERT INTO bqlda_state(key,value) VALUES(${key},${JSON.stringify(value)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;}
module.exports=async({method,args,sql,user,state,allowedProject,visibleProjects})=>{
 if(!method.startsWith('awm_'))return undefined;
 if(!active(user))return fail('Phiên đăng nhập không hợp lệ hoặc tài khoản chưa được kích hoạt.');
 const permission=key=>can(user,state,key);
 if(method==='awm_bootstrap')return ok({user:{username:user.username,fullname:user.fullname,email:user.email,role:user.role,current_project:user.current_project||''},projects:visibleProjects(user,state.projects?.all_projects||[]),nav:{home:permission('tab_home'),mail:permission('tab_mail'),files:permission('tab_quan_ly'),links:permission('cd_links')||permission('tab_cai_dat')||user?.role==='Admin',tracking:permission('tab_theo_doi'),todo:permission('tab_home')},files:{can_configure:canEdit(user,state,'ql_project_mgmt')},links_can_manage:canEdit(user,state,'cd_links')||canEdit(user,state,'tab_cai_dat')||user?.role==='Admin',groups:Object.entries(groups).filter(([,g])=>permission('tab_theo_doi')&&(permission(g[1])||(g[2]&&permission(g[2])))).map(([id,g])=>({id,name:g[0]})),menus:menus.filter(m=>permission('tab_quan_ly')&&permission(m[2])).map(([id,name])=>({id,name}))});
 const project=String(args[0]||'');
 const todoKey=`awm:todo:${user.username}:${project}`;
 const todoAllowed=()=>allowedProject(user,project)&&permission('tab_home');
 if(method==='awm_todos'){
  if(!todoAllowed())return fail('Không có quyền xem việc của dự án này.');
  const filter=String(args[1]||'open');
  const items=await read(sql,todoKey,[]);
  const filtered=items.filter(item=>filter==='all'||(filter==='done'?item.status==='done':item.status!=='done'));
  filtered.sort((a,b)=>String(a.status==='done').localeCompare(String(b.status==='done'))||String(a.due_date||'9999-12-31').localeCompare(String(b.due_date||'9999-12-31'))||String(b.created_at).localeCompare(String(a.created_at)));
  return ok({items:filtered,summary:{open:items.filter(x=>x.status!=='done').length,done:items.filter(x=>x.status==='done').length,overdue:items.filter(x=>x.status!=='done'&&x.due_date&&x.due_date<new Date().toISOString().slice(0,10)).length}});
 }
 if(method==='awm_save_todo'){
  if(!todoAllowed())return fail('Không có quyền tạo việc cho dự án này.');
  const input=args[1]||{},title=String(input.title||'').trim(),priority=String(input.priority||'normal'),due=String(input.due_date||'');
  if(!title||title.length>180)return fail('Tên việc cần có từ 1 đến 180 ký tự.');
  if(!['low','normal','high'].includes(priority)|| (due&&!/^\d{4}-\d{2}-\d{2}$/.test(due)))return fail('Thông tin việc không hợp lệ.');
  const items=await read(sql,todoKey,[]),now=new Date().toISOString();
  const item={id:crypto.randomUUID(),title,notes:String(input.notes||'').trim().slice(0,1000),priority,due_date:due,status:'open',created_at:now,updated_at:now};
  items.push(item);await write(sql,todoKey,items);return ok(item);
 }
 if(method==='awm_update_todo'){
  if(!todoAllowed())return fail('Không có quyền sửa việc của dự án này.');
  const id=String(args[1]||''),patch=args[2]||{},items=await read(sql,todoKey,[]),item=items.find(x=>x.id===id);
  if(!item)return fail('Không tìm thấy việc cần cập nhật.');
  if(patch.status!==undefined){if(!['open','done'].includes(patch.status))return fail('Trạng thái không hợp lệ.');item.status=patch.status;}
  if(patch.title!==undefined){const title=String(patch.title).trim();if(!title||title.length>180)return fail('Tên việc cần có từ 1 đến 180 ký tự.');item.title=title;}
  if(patch.notes!==undefined)item.notes=String(patch.notes).trim().slice(0,1000);
  if(patch.priority!==undefined){if(!['low','normal','high'].includes(patch.priority))return fail('Mức ưu tiên không hợp lệ.');item.priority=patch.priority;}
  if(patch.due_date!==undefined){const due=String(patch.due_date||'');if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))return fail('Ngày hạn không hợp lệ.');item.due_date=due;}
  item.updated_at=new Date().toISOString();await write(sql,todoKey,items);return ok(item);
 }
 if(method==='awm_delete_todo'){
  if(!todoAllowed())return fail('Không có quyền xóa việc của dự án này.');
  const id=String(args[1]||''),items=await read(sql,todoKey,[]),next=items.filter(x=>x.id!==id);
  if(next.length===items.length)return fail('Không tìm thấy việc cần xóa.');await write(sql,todoKey,next);return ok({deleted:true});
 }
 if(method==='awm_dashboard'){
  if(!todoAllowed())return fail('Không có quyền xem tổng quan dự án này.');
  const todos=await read(sql,todoKey,[]),mail=await read(sql,`awm:mail:${user.username}`,null),online=!!mail&&Date.now()-Date.parse(mail.updated_at)<90000;
  return ok({todos:{open:todos.filter(x=>x.status!=='done').length,overdue:todos.filter(x=>x.status!=='done'&&x.due_date&&x.due_date<new Date().toISOString().slice(0,10)).length},mail:{online,last_sync:mail?.updated_at||null},groups:Object.entries(groups).filter(([,g])=>permission('tab_theo_doi')&&permission(g[1])).length,drive_menus:menus.filter(m=>permission('tab_quan_ly')&&permission(m[2])).length});
 }
 if(method==='awm_tracking'){
  const [,tab,query='',cursor=0]=args;
  if(!allowedProject(user,project)||!permission('tab_theo_doi')||!groups[tab]||!(permission(groups[tab][1])||(groups[tab][2]&&permission(groups[tab][2]))))return fail('Không có quyền đọc nhóm hồ sơ hoặc dự án này.');
  let snapshot=snapshots[project]?.[tab];if(snapshot?.shared)snapshot=snapshots[snapshot.shared];
  const stored=await read(sql,`tracking:${project}:${tab}:`,snapshot||{items:[],columns:snapshots.__columns?.[tab]||[]});
  const q=norm(String(query).slice(0,200));const rows=(stored.items||[]).filter(r=>!q||norm(Object.values(r).filter(v=>typeof v!=='object').join(' ')).includes(q)).sort((a,b)=>recordDate(b)-recordDate(a));
  const start=Math.max(0,Number(cursor)||0),end=start+30;
  return ok({project,columns:stored.columns||[],items:rows.slice(start,end),total:rows.length,next_cursor:end<rows.length?end:null,revision:stored.revision||'snapshot'});
 }
 if(method==='awm_folders'||method==='awm_save_folder'){
  const menu=menus.find(m=>m[0]===args[1]);
  if(!allowedProject(user,project)||!permission('tab_quan_ly'))return fail('Không có quyền xem QL hoặc dự án.');
  if(method==='awm_folders'){
   const seed=projectFoldersSeed[project]||{};
   const data={};for(const [id,,key]of menus)if(permission(key)){
    const def=seed[id]?{id:seed[id].id,name:seed[id].name,path:seed[id].path,url:seed[id].url,subs:seed[id].subs||[],scope:'project',updated_by:'Hệ thống (AD)'}:null;
    const shared=await read(sql,`awm:project-folder:${project}:${id}`,def);
    const personal=shared?null:await read(sql,`awm:folder:${user.username}:${project}:${id}`,null);
    data[id]=shared?{...def,...shared,scope:'project'}:personal?{...personal,scope:'personal'}:def;
   }
   return ok(data);
  }
  if(!menu||!permission(menu[2]))return fail('Không có quyền truy cập menu.');
  const folder=String(args[2]||'').trim();if(!/^[a-zA-Z0-9_-]{10,200}$/.test(folder))return fail('Folder ID Google Drive không hợp lệ.');
  if(!canEdit(user,state,'ql_project_mgmt')){
   await write(sql,`awm:folder:${user.username}:${project}:${menu[0]}`,{id:folder,updated_at:new Date().toISOString()});
   return ok({saved:true,scope:'personal'});
  }
  await write(sql,`awm:project-folder:${project}:${menu[0]}`,{id:folder,updated_by:user.username,updated_at:new Date().toISOString()});return ok({saved:true,scope:'project'});
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
module.exports.canEdit=canEdit;
module.exports.permissionValue=permissionValue;
module.exports.recordDate=recordDate;
module.exports.active=active;
module.exports.groups=groups;
