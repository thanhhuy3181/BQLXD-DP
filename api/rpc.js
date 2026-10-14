const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');
const seed = require('./data/core.json');
const hsmtData = require('./data/hsmt.json');
const hdData = require('./data/hd.json');
const paymentData = require('./data/payment.json');
const progressData = require('./data/progress.json');
const contractorData = require('./data/contractors.json');
const homeData = require('./data/home.json');
const boqData = require('./data/boq.json');
const sapData = require('./data/sap.json');

let initPromise;
const databaseUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || '';
const hashPassword = value => crypto.createHash('sha256').update(`SALT_BNGUA_${value}`).digest('hex');
const result = data => ({ ok: true, data, error: null });
const failure = error => ({ ok: false, data: null, error: String(error?.message || error || 'Lỗi máy chủ') });
const publicUser = row => {
  if (!row) return null;
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  return { ...data, username: row.username, status: row.status || data.status || 'Active' };
};

function sqlClient() {
  const url = databaseUrl();
  if (!url) throw new Error('Cơ sở dữ liệu Vercel chưa được kết nối');
  return neon(url);
}

async function ensureDb() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const sql = sqlClient();
    await sql`CREATE TABLE IF NOT EXISTS bqlda_state (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
    await sql`CREATE TABLE IF NOT EXISTS bqlda_users (username text PRIMARY KEY, password_hash text NOT NULL, status text NOT NULL DEFAULT 'Active', data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
    await sql`CREATE TABLE IF NOT EXISTS bqlda_sessions (token text PRIMARY KEY, username text NOT NULL REFERENCES bqlda_users(username) ON DELETE CASCADE, expires_at timestamptz NOT NULL)`;
    const initialState = {
      projects: seed.projects,
      tabs_by_project: seed.tabs_by_project || {},
      links: seed.links || {__common__:[]},
      role_permissions: seed.role_permissions,
      app_config: seed.app_config || {},
      theme: seed.theme || {theme:'rose_pine',font_size:'md',compact:false}
    };
    await sql`INSERT INTO bqlda_state (key,value) VALUES ('state',${JSON.stringify(initialState)}::jsonb) ON CONFLICT (key) DO NOTHING`;
    const admin = {id:crypto.randomUUID(),username:'admin',fullname:'Quản Trị Viên (Admin)',email:'admin@bngua.com',phone:'',role:'Admin',status:'Active',allowed_projects:['*'],current_project:seed.projects.current_project,created_at:new Date().toISOString()};
    await sql`INSERT INTO bqlda_users (username,password_hash,status,data) VALUES ('admin',${hashPassword('55555')},'Active',${JSON.stringify(admin)}::jsonb) ON CONFLICT (username) DO NOTHING`;
    return sql;
  })().catch(error => { initPromise = null; throw error; });
  return initPromise;
}

async function getState(sql) {
  const rows = await sql`SELECT value FROM bqlda_state WHERE key='state'`;
  return rows[0]?.value || {};
}

async function saveState(sql, state) {
  await sql`UPDATE bqlda_state SET value=${JSON.stringify(state)}::jsonb, updated_at=now() WHERE key='state'`;
}

async function getSessionUser(sql, req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const rows = await sql`SELECT u.username,u.status,u.data FROM bqlda_sessions s JOIN bqlda_users u ON u.username=s.username WHERE s.token=${token} AND s.expires_at>now()`;
  return publicUser(rows[0]);
}

function allowedProject(user, project) {
  if (!user) return false;
  if (user.role === 'Admin') return true;
  const allowed = Array.isArray(user.allowed_projects) ? user.allowed_projects : [];
  return allowed.includes('*') || allowed.includes(project);
}

function visibleProjects(user, projects) {
  if (user?.role === 'Admin' || user?.allowed_projects?.includes('*')) return projects;
  const allowed = new Set(user?.allowed_projects || []);
  return projects.filter(project => allowed.has(project));
}

function canEdit(user, state, permissionKey) {
  if (user?.role === 'Admin') return true;
  const level = state.role_permissions?.permissions?.[user?.role]?.[permissionKey] || 'view';
  return level === 'edit' || level === 'full' || level === true;
}

function currentProject(user, state) {
  const preferred = user?.current_project || state.projects?.current_project;
  if (allowedProject(user, preferred)) return preferred;
  return visibleProjects(user, state.projects?.all_projects || [])[0] || '';
}

const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
function searchRows(rows, query) {
  const q=norm(query).trim(); if(!q)return rows.slice();
  return rows.filter(row=>norm(Object.values(row||{}).filter(v=>typeof v!=='object').join(' ')).includes(q));
}
function sortRows(rows,key,direction='asc') {
  if(!key)return rows;const sign=direction==='desc'?-1:1;
  return rows.sort((a,b)=>String(a?.[key]??'').localeCompare(String(b?.[key]??''),'vi',{numeric:true})*sign);
}
function paged(rows,pageNo=1,pageSize=50) {
  pageNo=Math.max(1,Number(pageNo)||1);pageSize=Math.max(1,Math.min(1000,Number(pageSize)||50));const start=(pageNo-1)*pageSize;
  return {items:rows.slice(start,start+pageSize),total:rows.length,page:pageNo,page_size:pageSize,total_pages:Math.max(1,Math.ceil(rows.length/pageSize))};
}
function projectRows(rows, project) {
  if(project===seed.projects.current_project)return rows;
  return rows.filter(row=>[row.project,row.du_an,row.ten_du_an,row.project_name].some(v=>v===project));
}

async function rpc(req) {
  const sql = await ensureDb();
  const { method, args=[] } = req.body || {};
  if (!method) return failure('Thiếu tên phương thức');
  let state = await getState(sql);
  let user = await getSessionUser(sql, req);

  if (method === 'get_bootstrap') return result({version:seed.version,theme:state.theme||seed.theme,catalog:seed.catalog});
  if (method === 'get_theme') return result(state.theme||seed.theme);
  if (method === 'get_management_categories_catalog') return result(seed.catalog);
  if (method === 'get_app_info') return result({version:seed.version,runtime:'vercel-web',base_dir:'Google Drive / Cloud'});

  if (method === 'login_user') {
    const identifier = String(args[0]||'').trim().toLowerCase();
    const passwordHash = hashPassword(String(args[1]||''));
    const rows = await sql`SELECT username,password_hash,status,data FROM bqlda_users WHERE lower(username)=${identifier} OR lower(data->>'email')=${identifier} LIMIT 1`;
    const row = rows[0];
    if (!row) return failure('Tài khoản không tồn tại trên hệ thống!');
    if (row.status === 'Locked') return failure('Tài khoản này đã bị khóa bởi Quản trị viên!');
    if (row.password_hash !== passwordHash) return failure('Sai mật khẩu đăng nhập!');
    const token = crypto.randomBytes(32).toString('hex');
    await sql`DELETE FROM bqlda_sessions WHERE expires_at<=now()`;
    await sql`INSERT INTO bqlda_sessions (token,username,expires_at) VALUES (${token},${row.username},now()+interval '30 days')`;
    return {...result(publicUser(row)), session_token:token};
  }
  if (method === 'register_user') {
    const d=args[0]||{}, username=String(d.username||'').trim().toLowerCase();
    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) return failure('Tên tài khoản không hợp lệ (3-30 ký tự, không dấu)!');
    if (String(d.password||'').length<4) return failure('Mật khẩu phải từ 4 ký tự trở lên!');
    const exists=await sql`SELECT 1 FROM bqlda_users WHERE username=${username}`; if(exists.length)return failure('Tài khoản này đã tồn tại!');
    const project=state.projects?.current_project||'';
    const data={id:crypto.randomUUID(),username,fullname:String(d.fullname||username),email:String(d.email||''),phone:String(d.phone||''),role:'Thành viên',status:'Active',allowed_projects:project?[project]:[],current_project:project,created_at:new Date().toISOString()};
    await sql`INSERT INTO bqlda_users (username,password_hash,status,data) VALUES (${username},${hashPassword(String(d.password))},'Active',${JSON.stringify(data)}::jsonb)`;
    return result({message:'Đăng ký tài khoản thành công! Quản trị viên có thể điều chỉnh dự án và quyền.'});
  }
  if (method === 'logout_user') {
    const token=(req.headers.authorization||'').replace(/^Bearer /,''); if(token)await sql`DELETE FROM bqlda_sessions WHERE token=${token}`;
    return result({logged_out:true});
  }
  if (method === 'get_current_user') return result(user || {username:'guest',fullname:'Khách',role:'Thành viên',status:'Active',allowed_projects:[]});

  if (!user) return failure('Bạn cần đăng nhập để sử dụng dữ liệu dùng chung.');

  const project=currentProject(user,state);
  const menuResult=await require('./menu_rpc')({method,args,sql,user,state,project,allowedProject,visibleProjects,canEdit});
  if(menuResult!==undefined)return menuResult;
  if (method === 'get_hsmt_list') {let rows=searchRows(projectRows(hsmtData,project),args[2]);if(args[3])rows=rows.filter(r=>[r.cdt,r.chu_dau_tu].includes(args[3]));sortRows(rows,args[4],args[5]);return result(paged(rows,args[0],args[1]));}
  if (method === 'get_hsmt_summary') return result(project===seed.projects.current_project?seed.summaries.hsmt:{count:0,has_file:0,cdts:[]});
  if (method === 'get_hd_list') {let rows=searchRows(projectRows(hdData,project),args[2]);if(args[3])rows=rows.filter(r=>[r.nha_thau,r.nt].includes(args[3]));sortRows(rows,args[4],args[5]);return result(paged(rows,args[0],args[1]));}
  if (method === 'get_hd_summary') return result(project===seed.projects.current_project?seed.summaries.hd:{count:0,total_gia_tri:0,total_gia_tri_fmt:'0',total_tt:0,total_tt_fmt:'0'});
  if (method === 'get_payment_list') {let rows=searchRows(projectRows(paymentData,project),args[2]);if(args[3])rows=rows.filter(r=>[r.loai_tt,r.loai].includes(args[3]));sortRows(rows,args[4],args[5]);return result(paged(rows,args[0],args[1]));}
  if (method === 'get_payment_summary') return result(project===seed.projects.current_project?seed.summaries.payment:{count:0,total_so_tien:0,total_so_tien_fmt:'0',total_gia_tri_hd:0,total_gia_tri_hd_fmt:'0',loai_counts:{}});
  if (method === 'get_payment_loai_tt_list') return result([...new Set(projectRows(paymentData,project).map(x=>x.loai_tt).filter(Boolean))].sort());
  if (method === 'get_payment_record') return result(projectRows(paymentData,project)[Number(args[0])]);
  if (method === 'get_progress_list') {let rows=searchRows(projectRows(progressData,project),args[2]);sortRows(rows,args[3],args[4]);return result(paged(rows,args[0],args[1]));}
  if (method === 'get_progress_summary') return result(project===seed.projects.current_project?seed.summaries.progress:{count:0});
  if (method === 'get_home_progress_alerts' || method === 'get_progress_alerts') return result(project===seed.projects.current_project?homeData:{eval_date:'',current_project:project,matrix:{},records:[],total_records:0});
  if (method === 'get_dashboard_stats') return result({projects:visibleProjects(user,state.projects?.tab_projects||[]).length,progress:project===seed.projects.current_project?homeData.total_records:0,hsmt:project===seed.projects.current_project?seed.summaries.hsmt.count:0,contracts:project===seed.projects.current_project?seed.summaries.hd.count:0});
  if (method === 'get_contractor_summary') {let rows=searchRows(projectRows(contractorData.summary,project),args[2]);sortRows(rows,args[3],args[4]);return result(paged(rows,args[0],args[1]));}
  if (method === 'get_contractor_detail') {const row=projectRows(contractorData.summary,project).find(x=>x.name===args[0]);return row?result(row):failure('Không tìm thấy nhà thầu');}
  if (method === 'get_contractor_directory') return result(paged(searchRows(projectRows(contractorData.directory,project),args[2]),args[0],args[1]));
  if (method === 'get_contractor_list') return result(projectRows(contractorData.summary,project).map(x=>x.name));
  if (method === 'get_boq_data') return result(paged(searchRows(projectRows(boqData,project),args[0]),args[1],args[2]));
  if (method === 'get_sap_data') {const base=sapData[args[0]||'hsmt']||{headers:[],rows:[]};const rows=searchRows(projectRows(base.rows||[],project),args[1]);return result({...base,...paged(rows,args[2],args[3]),rows:paged(rows,args[2],args[3]).items});}

  if (method === 'get_projects_bar_data') {
    const all=visibleProjects(user,state.projects?.all_projects||[]), tabs=visibleProjects(user,state.projects?.tab_projects||[]);
    const current=currentProject(user,state);
    return result({current_project:current,tab_projects:tabs.includes(current)?tabs:[current,...tabs].filter(Boolean),all_projects:all});
  }
  if (method === 'switch_project' || method === 'add_project_to_bar') {
    const project=String(args[0]||'').trim(); if(!allowedProject(user,project))return failure('Tài khoản không có quyền xem dự án này.');
    const rows=await sql`SELECT data FROM bqlda_users WHERE username=${user.username}`; const data=rows[0].data; data.current_project=project;
    await sql`UPDATE bqlda_users SET data=${JSON.stringify(data)}::jsonb,updated_at=now() WHERE username=${user.username}`;
    if(method==='add_project_to_bar' && user.role==='Admin' && !state.projects.tab_projects.includes(project)){state.projects.tab_projects.push(project);await saveState(sql,state);}
    return result({current_project:project});
  }
  if (method === 'get_explorer_tabs') {
    const project=String(args[0]||currentProject(user,state)); if(!allowedProject(user,project))return failure('Không có quyền xem dự án.');
    return result({current_project:project,tabs:state.tabs_by_project?.[project]||[]});
  }
  if (['save_explorer_tabs','add_explorer_tab','update_explorer_tab','move_explorer_tab','remove_explorer_tab'].includes(method)) {
    if(!canEdit(user,state,'ql_file'))return failure('Tài khoản chỉ có quyền xem Quản lý File.');
    let project=currentProject(user,state), tabs=[...(state.tabs_by_project?.[project]||[])]; state.tabs_by_project=state.tabs_by_project||{};
    if(method==='save_explorer_tabs') tabs=Array.isArray(args[0])?args[0]:[];
    if(method==='add_explorer_tab') {const [name,path,category='custom',options={}] = args;tabs.push({id:`tab_${crypto.randomUUID()}`,name,path,category_code:category,show_dir:true,show_file:true,level_1:true,level_2:false,level_3:false,level_4:false,level_5:false,...options});}
    if(method==='update_explorer_tab') {const [id,data,explicitProject='']=args;project=explicitProject||project;if(!allowedProject(user,project))return failure('Không có quyền sửa dự án.');tabs=[...(state.tabs_by_project[project]||[])].map(t=>t.id===id?{...t,...data}:t);}
    if(method==='move_explorer_tab') {const [id,direction]=args,index=tabs.findIndex(t=>t.id===id),target=direction==='up'?index-1:index+1;if(index>=0&&target>=0&&target<tabs.length)[tabs[index],tabs[target]]=[tabs[target],tabs[index]];}
    if(method==='remove_explorer_tab') tabs=tabs.filter(t=>t.id!==args[0]);
    state.tabs_by_project[project]=tabs;await saveState(sql,state);
    const targetId=method==='update_explorer_tab'?args[0]:tabs.at(-1)?.id;
    return result(method==='save_explorer_tabs'?{saved:true}:tabs.find(t=>t.id===targetId)||{removed:args[0]});
  }
  if (method === 'get_link_scopes') return result({current_project:currentProject(user,state),projects:visibleProjects(user,Object.keys(state.links||{}).filter(k=>k!=='__common__'))});
  if (method === 'get_managed_links') {
    const query=String(args[0]||'').toLowerCase(),scope=String(args[1]||currentProject(user,state)); if(scope!=='__common__'&&!allowedProject(user,scope))return failure('Không có quyền xem dự án.');
    const rows=(state.links?.[scope]||[]).filter(row=>!query||JSON.stringify(row).toLowerCase().includes(query));return result(rows);
  }
  if (method === 'save_managed_link' || method === 'delete_managed_link') {
    if(!canEdit(user,state,'cai_dat'))return failure('Tài khoản không có quyền sửa Quản lý Link.');
    const scope=String(args[1]||currentProject(user,state)); if(scope!=='__common__'&&!allowedProject(user,scope))return failure('Không có quyền sửa dự án.');
    state.links=state.links||{};let rows=[...(state.links[scope]||[])];
    if(method==='save_managed_link'){const row={...(args[0]||{})};row.id=row.id||`link_${crypto.randomUUID()}`;rows=rows.filter(x=>x.id!==row.id).concat(row);state.links[scope]=rows;await saveState(sql,state);return result(row);}
    rows=rows.filter(x=>x.id!==args[0]);state.links[scope]=rows;await saveState(sql,state);return result({deleted:args[0]});
  }
  if (method === 'get_users_list') {
    if(user.role!=='Admin')return failure('Chỉ Admin được quản lý tài khoản.'); const rows=await sql`SELECT username,status,data FROM bqlda_users ORDER BY username`;return result(rows.map(publicUser));
  }
  if (method === 'update_user_role' || method === 'toggle_user_lock') {
    if(user.role!=='Admin')return failure('Chỉ Admin được quản lý tài khoản.'); const username=String(args[0]||'');if(username==='admin')return failure('Không thay đổi tài khoản Admin hệ thống.');
    const rows=await sql`SELECT status,data FROM bqlda_users WHERE username=${username}`;if(!rows.length)return failure('Không tìm thấy tài khoản.');const data=rows[0].data;
    if(method==='update_user_role'){data.role=String(args[1]||'Thành viên');await sql`UPDATE bqlda_users SET data=${JSON.stringify(data)}::jsonb,updated_at=now() WHERE username=${username}`;return result({username,role:data.role});}
    const status=rows[0].status==='Locked'?'Active':'Locked';data.status=status;await sql`UPDATE bqlda_users SET status=${status},data=${JSON.stringify(data)}::jsonb,updated_at=now() WHERE username=${username}`;return result({username,status});
  }
  if (method === 'get_role_permissions') return result(state.role_permissions);
  if (method === 'save_role_permissions') {if(user.role!=='Admin')return failure('Chỉ Admin được sửa phân quyền.');state.role_permissions.permissions=args[0]||{};await saveState(sql,state);return result({saved:true});}
  if (method === 'get_app_config_full') return result(state.app_config||{});
  if (method === 'save_app_config_full') {if(!canEdit(user,state,'cai_dat'))return failure('Không có quyền sửa cài đặt.');state.app_config={...(state.app_config||{}),...(args[0]||{})};await saveState(sql,state);return result(state.app_config);}
  if (method === 'save_theme') {state.theme={theme:args[0],font_size:args[1],compact:!!args[2]};await saveState(sql,state);return result(state.theme);}
  return failure(`API máy chủ chưa hỗ trợ: ${method}`);
}

module.exports = async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET') return res.status(200).json({ok:true,data:{status:'ready',database:!!databaseUrl()}});
  if(req.method!=='POST') return res.status(405).json(failure('Method not allowed'));
  try { return res.status(200).json(await rpc(req)); }
  catch(error) { console.error(error); return res.status(500).json(failure(error)); }
};
