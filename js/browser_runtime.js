/** Browser runtime for the Vercel build.
 *
 * It mirrors the pywebview RPC surface. Reporting data is lazy-loaded from
 * deployment snapshots; mutable configuration and RBAC are stored by /api/rpc;
 * Google Drive is accessed directly with the signed-in user's OAuth token.
 */
'use strict';

window.BrowserRuntime = (() => {
  const TOKEN_KEY = 'bqlda_web_session';
  const DRIVE_KEY = 'bqlda_web_drive_accounts';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';
  const cache = new Map();
  let core = null;
  let currentProject = '';
  let driveState = {login_busy:false, sync_busy:false, login_result:null, sync_result:null};
  let localProcessState = 'idle';

  const ok = data => ({ok:true, data, error:null});
  const err = error => ({ok:false, data:null, error:String(error?.message || error || 'Lỗi không xác định')});
  const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
  const clone = value => JSON.parse(JSON.stringify(value));

  async function loadJson(name) {
    if (!cache.has(name)) {
      cache.set(name, fetch(`data/${name}.json`, {cache:'no-cache'}).then(r => {
        if (!r.ok) throw new Error(`Không tải được dữ liệu ${name}`);
        return r.json();
      }));
    }
    return cache.get(name);
  }

  async function getCore() {
    if (!core) {
      try {
        const response = await serverCall('get_bootstrap', []);
        if (!response.ok) throw new Error(response.error);
        core = response.data;
      } catch (_) {
        core = {version:'V386-web',theme:{theme:'rose_pine',font_size:'md',compact:false},catalog:[],projects:{current_project:'',tab_projects:[],all_projects:[]},tabs_by_project:{},links:{__common__:[]},role_permissions:{permissions:{},groups:[],levels:[]},summaries:{hsmt:{count:0},hd:{count:0},payment:{count:0},progress:{count:0}},app_config:{}};
      }
      currentProject = localStorage.getItem('bqlda_current_project') || core.projects?.current_project || '';
    }
    return core;
  }

  const serverMethods = new Set([
    'get_current_user','login_user','logout_user','get_users_list','update_user_role',
    'toggle_user_lock','register_user','get_role_permissions','save_role_permissions',
    'get_projects_bar_data','switch_project','add_project_to_bar','get_explorer_tabs',
    'save_explorer_tabs','add_explorer_tab','update_explorer_tab','move_explorer_tab',
    'remove_explorer_tab','get_link_scopes','get_managed_links','save_managed_link',
    'delete_managed_link','get_app_config_full','save_app_config_full','save_theme'
  ]);

  async function serverCall(method, args) {
    const headers = {'Content-Type':'application/json'};
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch('/api/rpc', {method:'POST', headers, body:JSON.stringify({method,args})});
    const payload = await response.json().catch(() => null);
    if (!payload) throw new Error(`API web không phản hồi (${response.status})`);
    if (payload.session_token) localStorage.setItem(TOKEN_KEY, payload.session_token);
    if (method === 'logout_user') localStorage.removeItem(TOKEN_KEY);
    return payload;
  }

  function page(items, pageNo=1, pageSize=50) {
    pageNo = Math.max(1, Number(pageNo)||1); pageSize = Math.max(1, Number(pageSize)||50);
    const start = (pageNo-1)*pageSize;
    return {items:items.slice(start,start+pageSize), total:items.length, page:pageNo, page_size:pageSize, total_pages:Math.max(1,Math.ceil(items.length/pageSize))};
  }

  function searchRows(rows, query) {
    const q = norm(query).trim();
    if (!q) return rows.slice();
    return rows.filter(row => norm(Object.values(row||{}).filter(v => typeof v !== 'object').join(' ')).includes(q));
  }

  function sortRows(rows, key, direction='asc') {
    if (!key) return rows;
    const sign = direction === 'desc' ? -1 : 1;
    return rows.sort((a,b) => String(a?.[key]??'').localeCompare(String(b?.[key]??''),'vi',{numeric:true})*sign);
  }

  async function dataList(name, pageNo, pageSize, query, filterValue, sortKey, sortDir, filterKeys=[]) {
    let rows = searchRows(await loadJson(name), query);
    if (filterValue) rows = rows.filter(row => filterKeys.some(k => String(row?.[k]??'') === String(filterValue)));
    sortRows(rows, sortKey, sortDir);
    return ok(page(rows,pageNo,pageSize));
  }

  function driveAccounts() {
    try { return JSON.parse(localStorage.getItem(DRIVE_KEY)||'[]'); } catch (_) { return []; }
  }
  function saveDriveAccounts(rows) { localStorage.setItem(DRIVE_KEY, JSON.stringify(rows)); }
  function driveAccount(id) { return driveAccounts().find(a => a.id === id); }
  function validToken(id) {
    const a = driveAccount(id);
    return a && a.token && Number(a.expiry||0) > Date.now()+10000 ? a.token : '';
  }

  async function waitForGoogle() {
    const deadline = Date.now()+12000;
    while (!window.google?.accounts?.oauth2 && Date.now()<deadline) await new Promise(r=>setTimeout(r,120));
    if (!window.google?.accounts?.oauth2) throw new Error('Không tải được thư viện đăng nhập Google');
  }

  async function startDriveLogin() {
    const clientId = window.BQLDA_WEB_CLIENT_ID;
    if (!clientId) return err('Bản web chưa được gắn OAuth Web Client ID');
    if (driveState.login_busy) return err('Đang chờ đăng nhập Google');
    driveState.login_busy = true; driveState.login_result = null;
    try {
      await waitForGoogle();
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope:'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
        callback: async response => {
          try {
            if (response.error) throw new Error(response.error_description || response.error);
            const profileResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:`Bearer ${response.access_token}`}});
            if (!profileResp.ok) throw new Error('Không đọc được thông tin tài khoản Google');
            const profile = await profileResp.json();
            const account = {id:`google_${profile.sub}`, email:profile.email, name:profile.name||profile.email,
              picture:profile.picture||'', token:response.access_token, expiry:Date.now()+Number(response.expires_in||3600)*1000};
            const rows = driveAccounts().filter(a => a.id!==account.id && a.email!==account.email);
            rows.push(account); saveDriveAccounts(rows);
            driveState.login_result = {ok:true,data:{id:account.id,email:account.email,name:account.name}};
            document.dispatchEvent(new CustomEvent('py:drive_login',{detail:{ok:true,data:account}}));
          } catch (e) {
            driveState.login_result = {ok:false,error:String(e.message||e)};
            document.dispatchEvent(new CustomEvent('py:drive_login',{detail:driveState.login_result}));
          } finally { driveState.login_busy=false; }
        }
      });
      client.requestAccessToken({prompt:'select_account consent'});
      return ok({started:true});
    } catch (e) { driveState.login_busy=false; return err(e); }
  }

  async function driveFetch(accountId, url) {
    const token = validToken(accountId);
    if (!token) throw new Error('Phiên Google Drive đã hết hạn. Hãy đăng nhập lại tài khoản.');
    const response = await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
    const body = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(body.error?.message || `Google Drive lỗi ${response.status}`);
    return body;
  }

  async function folderChildren(accountId, folderId='root', foldersOnly=true) {
    const q = [`'${folderId}' in parents`,'trashed=false'];
    if (foldersOnly) q.push(`mimeType='${FOLDER_MIME}'`);
    const fields = 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,parents)';
    let token='', rows=[];
    do {
      const url = new URL('https://www.googleapis.com/drive/v3/files');
      url.searchParams.set('q',q.join(' and ')); url.searchParams.set('fields',fields);
      url.searchParams.set('orderBy','folder,name'); url.searchParams.set('pageSize','1000');
      if (token) url.searchParams.set('pageToken',token);
      const data = await driveFetch(accountId,url.toString()); rows.push(...(data.files||[])); token=data.nextPageToken||'';
    } while(token);
    return rows;
  }

  async function folderInfo(accountId, folderId) {
    if (folderId === 'root') return {id:'root',name:'Drive của tôi',mimeType:FOLDER_MIME,webViewLink:'https://drive.google.com/drive/my-drive'};
    return driveFetch(accountId,`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,webViewLink,parents`);
  }

  async function drivePath(accountId, folderId) {
    const names=[]; let id=folderId, guard=0;
    while (id && id!=='root' && guard++<30) {
      const item=await folderInfo(accountId,id); names.unshift(item.name); id=item.parents?.[0]||'root';
    }
    return 'My Drive/'+names.join('/');
  }

  async function driveTree(args) {
    const [folderPath, subPath, levelFlags, showDir=true, showFile=true, search='', fromDate='', toDate='', sortCol='name', sortReverse=false] = args;
    const [accountId, rootId] = String(folderPath).replace('gdrive://','').split('/');
    const currentId = subPath ? String(subPath).replace('gdrive://','').split('/')[1] : rootId;
    const flags = levelFlags?.length ? levelFlags : [true,false,false,false,false];
    const maxLevel = Math.max(1,...flags.map((v,i)=>v?i+1:0));
    const contents = new Map(); let pending=[currentId];
    for(let depth=1; depth<=maxLevel && pending.length; depth++) {
      const ids=[...new Set(pending)].filter(id=>!contents.has(id)); pending=[];
      const groups=await Promise.all(ids.map(id=>folderChildren(accountId,id,false)));
      ids.forEach((id,i)=>{ contents.set(id,groups[i]); if(depth<maxLevel) pending.push(...groups[i].filter(x=>x.mimeType===FOLDER_MIME).map(x=>x.id)); });
    }
    const files=[]; let hidden=0;
    const q=norm(search).trim(); const start=fromDate?new Date(fromDate):null; const end=toDate?new Date(toDate):null;
    function walk(id,level,seen=new Set()) {
      if(seen.has(id)) return []; seen=new Set(seen); seen.add(id);
      const tree=[];
      for(const item of contents.get(id)||[]) {
        const isDir=item.mimeType===FOLDER_MIME, path=`gdrive://${accountId}/${item.id}`;
        const children=isDir && level<maxLevel ? walk(item.id,level+1,seen) : [];
        if(isDir) tree.push({name:item.name,path,children,has_children:children.length>0});
        if(!isDir && !showFile) hidden++;
        const date=item.modifiedTime?new Date(item.modifiedTime):null;
        const visible=flags[level-1] && ((isDir&&showDir)||(!isDir&&showFile)) && (!q||norm(item.name).includes(q)) && (!start||date>=start) && (!end||date<=new Date(end.getTime()+86400000));
        if(visible) files.push({name:item.name,path,url:item.webViewLink||(isDir?`https://drive.google.com/drive/folders/${item.id}`:`https://drive.google.com/file/d/${item.id}/view`),is_dir:isDir,ext:(item.name.match(/\.[^.]+$/)||[''])[0],level,date_str:date?date.toLocaleString('vi-VN'):'',size:Number(item.size||0),size_fmt:isDir?'Thư mục':item.size?`${(Number(item.size)/1024).toLocaleString('vi-VN',{maximumFractionDigits:1})} KB`:'—'});
      }
      return tree;
    }
    const tree=walk(currentId,1); const key=sortCol==='size'?'size':sortCol==='date'?'date_str':'name';
    files.sort((a,b)=>String(a[key]??'').localeCompare(String(b[key]??''),'vi',{numeric:true})*(sortReverse?-1:1));
    return ok({exists:true,path:folderPath,tree,files,message:hidden&&!files.length?`Có ${hidden} tệp đang bị ẩn. Bật File để xem.`:''});
  }

  async function localServerFallback(method,args) {
    const c=await getCore();
    const state=JSON.parse(localStorage.getItem('bqlda_local_state')||'{}');
    state.tabs=state.tabs||clone(c.tabs_by_project); state.links=state.links||clone(c.links);
    const save=()=>localStorage.setItem('bqlda_local_state',JSON.stringify(state));
    if(method==='get_current_user') return ok(JSON.parse(localStorage.getItem('bqlda_local_user')||'null')||{username:'guest',fullname:'Khách',role:'Thành viên',allowed_projects:[currentProject]});
    if(method==='login_user') {
      if(String(args[0]).toLowerCase()==='admin' && String(args[1])==='55555') { const u={username:'admin',fullname:'Quản Trị Viên (Admin)',email:'admin@bngua.com',role:'Admin',status:'Active',allowed_projects:['*']}; localStorage.setItem('bqlda_local_user',JSON.stringify(u)); return ok(u); }
      return err('Cơ sở dữ liệu đang khởi tạo; tài khoản tạm thời là admin / 55555');
    }
    if(method==='logout_user'){localStorage.removeItem('bqlda_local_user');return ok({logged_out:true});}
    if(method==='get_users_list') return ok([{username:'admin',fullname:'Quản Trị Viên (Admin)',email:'admin@bngua.com',role:'Admin',status:'Active',allowed_projects:['*']}]);
    if(method==='get_role_permissions') return ok(c.role_permissions);
    if(method==='get_projects_bar_data') return ok({...c.projects,current_project:currentProject});
    if(method==='switch_project'||method==='add_project_to_bar'){currentProject=String(args[0]);localStorage.setItem('bqlda_current_project',currentProject);return ok({current_project:currentProject});}
    if(method==='get_explorer_tabs') {const p=args[0]||currentProject;return ok({current_project:p,tabs:clone(state.tabs[p]||[])});}
    if(method==='update_explorer_tab'){const [id,data,p='']=args, project=p||currentProject;state.tabs[project]=(state.tabs[project]||[]).map(t=>t.id===id?{...t,...data}:t);save();return ok(state.tabs[project].find(t=>t.id===id));}
    if(method==='get_link_scopes') return ok({current_project:currentProject,projects:Object.keys(state.links).filter(k=>k!=='__common__')});
    if(method==='get_managed_links'){const [q='',scope='']=args;return ok(searchRows(state.links[scope||currentProject]||[],q));}
    if(method==='save_managed_link'){const [raw,scope='']=args,s=scope||currentProject,row={...raw,id:raw.id||`link_${crypto.randomUUID()}`};state.links[s]=(state.links[s]||[]).filter(x=>x.id!==row.id).concat(row);save();return ok(row);}
    if(method==='delete_managed_link'){const [id,scope='']=args,s=scope||currentProject;state.links[s]=(state.links[s]||[]).filter(x=>x.id!==id);save();return ok({deleted:id});}
    if(method==='get_app_config_full') return ok(c.app_config);
    if(method==='save_app_config_full') return ok(args[0]);
    if(method==='save_theme') return ok({theme:args[0],font_size:args[1],compact:args[2]});
    return err('Chức năng máy chủ đang khởi tạo');
  }

  async function mutableCall(method,args) {
    try { return await serverCall(method,args); }
    catch (_) { return localServerFallback(method,args); }
  }

  async function call(method,...args) {
    try {
      const c=await getCore();
      if(serverMethods.has(method)) return await mutableCall(method,args);
      if(method==='get_app_info') return ok({version:c.version,runtime:'vercel-web',base_dir:'Google Drive / Cloud'});
      if(method==='get_theme') return ok(c.theme);
      if(method==='get_projects') return ok(c.projects.all_projects||[]);
      if(method==='get_management_categories_catalog') return ok(c.catalog);
      if(['get_hsmt_list','get_hsmt_summary','get_hd_list','get_hd_summary','get_payment_list','get_payment_summary','get_payment_loai_tt_list','get_payment_record','get_progress_list','get_progress_summary','get_home_progress_alerts','get_progress_alerts','get_dashboard_stats','get_contractor_summary','get_contractor_detail','get_contractor_directory','get_contractor_list','get_boq_data','get_sap_data'].includes(method)) return serverCall(method,args);
      if(method==='get_folder_tree_and_files') return String(args[0]||'').startsWith('gdrive://')?driveTree(args):err('Bản web chỉ đọc nguồn Google Drive. Hãy bấm “Chọn nguồn online”.');
      if(method==='get_folder_contents') return String(args[0]||'').startsWith('gdrive://')?driveTree([args[0],args[1],[true,true,true,true,true],true,true]):err('Hãy chọn nguồn Google Drive');
      if(method==='get_drive_accounts') return ok(driveAccounts().map(({token,expiry,...a})=>a));
      if(method==='get_drive_state') return ok(clone(driveState));
      if(method==='login_drive_account') return startDriveLogin();
      if(method==='remove_drive_account'){saveDriveAccounts(driveAccounts().filter(a=>a.id!==args[0]));return ok({removed:args[0]});}
      if(method==='get_drive_folder_children') return ok(await folderChildren(args[0],args[1]||'root',args[2]!==false));
      if(method==='get_drive_shared_drives'){
        const d=await driveFetch(args[0],'https://www.googleapis.com/drive/v3/drives?pageSize=100&fields=drives(id,name)');return ok(d.drives||[]);
      }
      if(method==='add_explorer_online_source'){
        const [tabId,accountId,folderId,project='']=args, account=driveAccount(accountId), item=await folderInfo(accountId,folderId), displayPath=await drivePath(accountId,folderId);
        const source={account_id:accountId,email:account.email,folder_id:folderId,name:item.name,path:`gdrive://${accountId}/${folderId}`,display_path:displayPath,url:item.webViewLink||`https://drive.google.com/drive/folders/${folderId}`};
        const tabsRes=await mutableCall('get_explorer_tabs',[project||currentProject]), tab=tabsRes.data.tabs.find(x=>x.id===tabId);
        const sources=(tab.online_sources||[]).filter(x=>x.path!==source.path).concat(source);
        await mutableCall('update_explorer_tab',[tabId,{online_sources:sources,active_online_source:source.path,show_file:true},project||currentProject]);
        await mutableCall('save_managed_link',[{id:`source_${accountId}_${folderId}`,name:item.name,url:source.url,display_path:displayPath,category:'Drive / Thư mục',notes:account.email,drive_file_id:folderId,drive_accounts:[accountId]},project||currentProject]);
        return ok(source);
      }
      if(method==='sync_drive_links') return err('Bản web dùng “Chọn nguồn online” để thêm đúng thư mục cần quản lý.');
      if(method==='import_drive_oauth_config') return err('OAuth Web được cấu hình sẵn trên máy chủ, không cần chọn file JSON.');
      if(method==='open_link'||method==='open_path') {const u=String(args[0]||''); if(!u)return err('Đường dẫn trống'); if(/^https?:/.test(u))window.open(u,'_blank','noopener'); else if(u.startsWith('gdrive://'))window.open(`https://drive.google.com/drive/folders/${u.split('/').pop()}`,'_blank','noopener'); else return err('Đường dẫn ổ cứng chỉ mở được trong ứng dụng desktop'); return ok({url:u});}
      if(method==='path_exists') return ok(String(args[0]||'').startsWith('gdrive://'));
      if(method==='select_folder_dialog'){
        if(!window.showDirectoryPicker)return err('Trình duyệt không hỗ trợ chọn thư mục cục bộ'); const handle=await showDirectoryPicker(); window.__bqldaFolderHandles=window.__bqldaFolderHandles||new Map(); const id=`webfolder://${crypto.randomUUID()}`;window.__bqldaFolderHandles.set(id,handle);return ok({folder:id,name:handle.name});
      }
      if(method==='select_file_dialog'||method==='select_boq_pdf_files_dialog'){
        if(!window.showOpenFilePicker)return err('Trình duyệt không hỗ trợ chọn tệp'); const handles=await showOpenFilePicker({multiple:method==='select_boq_pdf_files_dialog'});window.__bqldaFileHandles=window.__bqldaFileHandles||new Map();const rows=handles.map(h=>{const id=`webfile://${crypto.randomUUID()}`;window.__bqldaFileHandles.set(id,h);return id;});return ok(method==='select_file_dialog'?{file:rows[0]}:rows);
      }
      if(['pause_process','resume_process','cancel_process'].includes(method)){localProcessState=method.split('_')[0];return ok({state:localProcessState});}
      if(method==='get_action_history_logs') return ok([]);
      if(method==='report_js_error'||method==='report_js_log') return ok();
      if(method==='open_master_excel'||method==='open_project_folder') return err('Bản web dùng tài liệu Google Drive trong Quản lý Link.');
      if(method==='run_ai_chat') return err('AI Engine chưa được cấu hình bằng khóa máy chủ.');
      if(['scan_files_in_folder','scan_msg_folder','scan_payment_folder','scan_boq_folder','extract_boq_contract_data','export_word_files','export_boq_excel_file','move_boq_excel_files','search_system_files','save_payment_record','delete_payment_record','stop_boq_contract_extraction'].includes(method)) return err('Chức năng này đang chờ tệp tải lên hoặc nguồn Google Drive trên bản web.');
      return err(`API web chưa hỗ trợ: ${method}`);
    } catch(e) { return err(e); }
  }

  return {call};
})();
