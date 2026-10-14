const crypto=require('crypto');
const snapshots=require('./data/menu_workspace.json');
const settingsSeed=require('./data/menu_settings.json');
const ok=data=>({ok:true,data,error:null});
const err=message=>({ok:false,data:null,error:message});
const copy=x=>JSON.parse(JSON.stringify(x));
const hash=row=>crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k])=>!k.startsWith('_')).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');
async function read(sql,key,fallback){const rows=await sql`SELECT value FROM bqlda_state WHERE key=${key}`;return rows.length?rows[0].value:copy(fallback);}
async function write(sql,key,value,previous){
 if(previous===undefined){await sql`INSERT INTO bqlda_state (key,value) VALUES (${key},${JSON.stringify(value)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;return true;}
 const inserted=await sql`INSERT INTO bqlda_state (key,value) VALUES (${key},${JSON.stringify(value)}::jsonb) ON CONFLICT(key) DO NOTHING RETURNING key`;
 if(inserted.length)return true;
 const result=await sql`UPDATE bqlda_state SET value=${JSON.stringify(value)}::jsonb,updated_at=now() WHERE key=${key} AND value=${JSON.stringify(previous)}::jsonb RETURNING key`;
 return !!result.length;
}
module.exports=async({method,args,sql,user,state,project,allowedProject,visibleProjects,canEdit})=>{
 const supported=new Set(['get_tracking_workspace','save_tracking_cell','get_settings_categories','save_settings_categories','get_settings_matrix','save_settings_matrix','export_settings_backup','preview_settings_backup','restore_settings_backup','test_ai_connection']);
 if(!supported.has(method))return undefined;
 if(!user)return err('Cần đăng nhập để dùng dữ liệu dự án.');
 if(!allowedProject(user,project))return err('Không có quyền xem dự án này.');
 if(method==='get_tracking_workspace'){
  const [tab,mode='summary']=args,sub=tab==='sap'?mode:tab==='contractor'&&mode==='detail'?'detail':'';
  const acl=require('./awm_rpc');
  const permission=tab==='contractor-data'?'td_contractor_data':acl.groups[tab]?.[1];
  if(!permission||!acl.can(user,state,permission))return err('Không có quyền đọc nhóm hồ sơ này.');
  let snapshot=snapshots[project]?.[sub?`${tab}:${sub}`:tab];
  if(snapshot?.shared)snapshot=snapshots[snapshot.shared];
  if(!snapshot)return ok({project,items:[],columns:snapshots.__columns?.[tab]||[]});
  const stored=await read(sql,`tracking:${project}:${tab}:${sub}`,snapshot);
  const cursor=Math.max(0,Number(args[2])||0),end=Math.min(cursor+500,stored.items.length);
  return ok({...stored,project,items:stored.items.slice(cursor,end),total:stored.items.length,next_cursor:end<stored.items.length?end:null,revision:stored.revision||'initial'});
 }
 if(method==='save_tracking_cell'){
  const [tab,target,token,key,value]=args;
  if(target!==project||!allowedProject(user,target))return err('Dự án đã thay đổi; nạp lại bảng.');
  if(!['progress','hsmt','contract','payment','contractor-data'].includes(tab)||!canEdit(user,state,'theo_doi'))return err('Không có quyền sửa bảng này.');
  if(typeof key!=='string'||key.startsWith('_')||/(path|folder|file)/.test(key))return err('Không được sửa cột này.');
  let seed=snapshots[target]?.[tab];if(seed?.shared)seed=snapshots[seed.shared];if(!seed)return err('Không có bảng nguồn.');
  const storage=`tracking:${target}:${tab}:`,previous=await read(sql,storage,seed),next=copy(previous);
  if(!next.columns.some(c=>c.key===key))return err('Cột không hợp lệ.');
  const row=next.items.find(r=>r._row_token===token);if(!row)return err('Dòng đã thay đổi; nạp lại trước khi sửa.');
  row[key]=String(value??'');row._row_token=hash(row);next.revision=crypto.randomUUID();
  return await write(sql,storage,next,previous)?ok({saved:true}):err('Bảng vừa được sửa ở phiên khác; nạp lại và thử lại.');
 }
 if(method==='get_settings_categories'){
  const target=args[0]||project;if(!allowedProject(user,target))return err('Không có quyền xem danh mục dự án này.');
  const categories=await read(sql,`categories:${target}`,settingsSeed.categories[target]||settingsSeed.categories[project]||{});
  return ok({project:target,projects:visibleProjects(user,state.projects?.all_projects||[]),categories});
 }
 if(method==='save_settings_categories'){
  const[target,data]=args;if(!allowedProject(user,target)||!canEdit(user,state,'cai_dat'))return err('Không có quyền sửa danh mục.');
  if(!data||Array.isArray(data)||typeof data!=='object'||Object.values(data).some(g=>!g||!Array.isArray(g.items)))return err('Danh mục không hợp lệ.');
  await write(sql,`categories:${target}`,data);return ok({saved:true});
 }
 if(method==='get_settings_matrix')return ok(await read(sql,'settings:matrix',settingsSeed.matrix));
 if(method==='save_settings_matrix'){
  if(user.role!=='Admin')return err('Chỉ Admin được sửa quy tắc dùng chung.');
  const d=args[0];if(!d||!Array.isArray(d.sections)||d.sections.some(s=>!Array.isArray(s.headers)||!s.headers.length||!Array.isArray(s.rows)||s.rows.some(r=>!Array.isArray(r)||r.length!==s.headers.length)))return err('Ma trận không hợp lệ.');
  await write(sql,'settings:matrix',d);return ok({saved:true});
 }
 if(method==='export_settings_backup'){
  if(user.role!=='Admin')return err('Chỉ Admin được xuất cài đặt dùng chung.');
  const categories={};for(const p of visibleProjects(user,state.projects?.all_projects||[]))categories[p]=await read(sql,`categories:${p}`,settingsSeed.categories[p]||{});
  const config=Object.fromEntries(Object.entries(state.app_config||{}).filter(([k])=>!/(key|token|password|secret)/i.test(k)));
  return ok({download:{format:'bongua-web-settings',version:1,runtime:'web',config,webview:{theme:state.theme},categories,matrix:await read(sql,'settings:matrix',settingsSeed.matrix)}});
 }
 if(method==='preview_settings_backup'){
  if(user.role!=='Admin')return err('Chỉ Admin được phục hồi cài đặt dùng chung.');
  const d=args[0];if(!d||d.format!=='bongua-web-settings'||d.version!==1||d.runtime!=='web'||!d.categories||!Array.isArray(d.matrix?.sections))return err('Không phải sao lưu cài đặt web hợp lệ.');
  for(const [p,cats] of Object.entries(d.categories)){if(!allowedProject(user,p)||!cats||typeof cats!=='object'||Object.values(cats).some(g=>!Array.isArray(g?.items)))return err('Danh mục dự án trong sao lưu không hợp lệ.');}
  if(d.matrix.sections.some(s=>!Array.isArray(s.headers)||!Array.isArray(s.rows)||s.rows.some(r=>!Array.isArray(r)||r.length!==s.headers.length)))return err('Ma trận trong sao lưu không hợp lệ.');
  await write(sql,`settings:restore:${user.username}`,d);return ok({path:args[1]||'Sao lưu đã tải lên',projects:Object.keys(d.categories).length,sections:d.matrix.sections.length});
 }
 if(method==='restore_settings_backup'){
  if(user.role!=='Admin')return err('Chỉ Admin được phục hồi cài đặt dùng chung.');
  const key=`settings:restore:${user.username}`,d=await read(sql,key,null);if(!d)return err('Chưa chọn bản sao lưu.');
  const changes=[];for(const[p,cats]of Object.entries(d.categories))changes.push([`categories:${p}`,cats,settingsSeed.categories[p]||{}]);changes.push(['settings:matrix',d.matrix,settingsSeed.matrix]);
  for(const[k,value,seed]of changes){const previous=await read(sql,k,seed);await write(sql,k+':before-restore',previous);await write(sql,k,value);}
  const config=Object.fromEntries(Object.entries(d.config||{}).filter(([k])=>['ollama_url','ollama_model','excel_path','last_dir','gemini_model'].includes(k)));
  await sql`UPDATE bqlda_state SET value=jsonb_set(value,'{app_config}',COALESCE(value->'app_config','{}'::jsonb)||${JSON.stringify(config)}::jsonb),updated_at=now() WHERE key='state'`;
  await sql`DELETE FROM bqlda_state WHERE key=${key}`;return ok({restored:true});
 }
 if(method==='test_ai_connection'){
  if(!canEdit(user,state,'cai_dat'))return err('Không có quyền kiểm tra cấu hình AI.');
  if(args[0]!=='gemini')return err('Ollama cục bộ được kiểm tra từ trình duyệt trên máy của bạn.');
  const key=state.app_config?.gemini_api_key||process.env.GEMINI_API_KEY;if(!key)return err('Chưa cấu hình Gemini API Key.');
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models',{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(15000)});
  if(!response.ok)return err('Gemini từ chối kết nối; kiểm tra khóa và quyền truy cập.');
  const data=await response.json();return ok({provider:'gemini',models:(data.models||[]).map(m=>m.name)});
 }
};
