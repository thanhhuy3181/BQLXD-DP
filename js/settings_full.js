'use strict';
const SettingsFullModule = (() => {
  let loaded=false, current='cd-theme', categories=null, matrix=null, group='', section=0;
  const esc=s=>window.escapeHtml(s);
  const btn=(label,action)=>`<button class="btn btn-xs btn-outline" onclick="SettingsFullModule.${action}">${label}</button>`;
  async function request(method,...args) { const r=await API.call(method,...args); if(!r.ok){toast(r.error,'error');return null;}return r.data; }
  function build() {
    if(document.getElementById('settings-ribbon'))return;
    const host=document.getElementById('cd-subpane-container');
    host.insertAdjacentHTML('afterbegin',`<div id="settings-ribbon" class="flex flex-wrap gap-2 mb-4 pb-3 border-b border-base-300"><strong id="settings-title" class="mr-auto">Cài đặt</strong>${btn('↻ Nạp lại','reload()')}${btn('💾 Lưu','saveCurrent()')}</div>`);
    if (!document.getElementById('cd-hm-ctr')) {
      host.insertAdjacentHTML('beforeend',`<div id="cd-hm-ctr" class="cd-subtab-pane hidden flex flex-col gap-3"><div class="flex flex-wrap gap-2"><label>Dự án <select id="settings-project" class="select select-sm select-bordered"></select></label><label>Nhóm <select id="settings-group" class="select select-sm select-bordered"></select></label>${btn('＋ Nhóm','addGroup()')}${btn('Đổi tên nhóm','renameGroup()')}${btn('＋ Dòng','addCategoryRow()')}${btn('Xuất JSON','downloadCategories()')}</div><div class="overflow-auto"><table class="table table-sm"><thead><tr><th>STT</th><th>Tên hạng mục / công trình</th><th>Mã</th><th>Thao tác</th></tr></thead><tbody id="settings-categories"></tbody></table></div></div><div id="cd-data-matrix" class="cd-subtab-pane hidden flex flex-col gap-3"><div class="flex flex-wrap gap-2"><select id="settings-matrix-section" class="select select-sm select-bordered"></select>${btn('＋ Dòng','addMatrixRow()')}${btn('Xuất JSON','downloadMatrix()')}</div><div class="overflow-auto"><table class="table table-sm"><thead id="settings-matrix-head"></thead><tbody id="settings-matrix-body"></tbody></table></div></div>`);
    }
    const prjEl = document.getElementById('settings-project');
    if (prjEl) prjEl.onchange = e => loadCategories(e.target.value);
    const grpEl = document.getElementById('settings-group');
    if (grpEl) grpEl.onchange = e => { group = e.target.value; renderCategories(); };
    const mtxEl = document.getElementById('settings-matrix-section');
    if (mtxEl) mtxEl.onchange = e => { section = Number(e.target.value); renderMatrix(); };
    if (!document.getElementById('settings-font')) {
      document.getElementById('cd-theme')?.insertAdjacentHTML('beforeend',`<label>Cỡ chữ <select id="settings-font" class="select select-sm select-bordered" onchange="setFontSize(this.value)"><option value="sm">Nhỏ</option><option value="md">Vừa</option><option value="lg">Lớn</option></select></label>`);
    }
    if (!document.getElementById('cfg-excel-path-btn')) {
      document.getElementById('cd-excel')?.insertAdjacentHTML('beforeend',`<div id="cfg-excel-path-btn" class="flex flex-wrap gap-2">${btn('Chọn Excel',"choosePath('cfg-excel-path',false)")}${btn('Chọn thư mục',"choosePath('cfg-last-dir',true)")}${btn('Mở Excel',"openConfigured('cfg-excel-path')")}${btn('Mở thư mục',"openConfigured('cfg-last-dir')")}</div>`);
    }
    if (!document.getElementById('settings-ai-status')) {
      document.getElementById('cd-ai')?.insertAdjacentHTML('beforeend',`<div class="flex flex-wrap gap-2">${btn('Kiểm tra Gemini',"testAi('gemini')")}${btn('Kiểm tra Ollama',"testAi('ollama')")}<span id="settings-ai-status" role="status" class="text-xs"></span></div>`);
    }
    if (!document.getElementById('settings-restore')) {
      document.getElementById('cd-backup')?.insertAdjacentHTML('afterbegin',`<div class="flex flex-wrap gap-2 mb-2">${btn('Xuất sao lưu cài đặt','backup()')}${btn('Chọn bản phục hồi','previewBackup()')}<button id="settings-restore" class="btn btn-xs btn-warning" disabled onclick="SettingsFullModule.restoreBackup()">Phục hồi bản đã chọn</button><span id="settings-restore-info" role="status" class="text-xs"></span><span class="text-xs">Sao lưu giao diện, đường dẫn, danh mục và ma trận; không chứa API Key.</span></div>`);
    }
  }
  async function loadConfig(){
    const c=await request('get_app_config_full');if(!c)return false;loaded=true;
    const fields={'cfg-gemini-key':'gemini_api_key','cfg-ollama-url':'ollama_url','cfg-ollama-model':'ollama_model','cfg-excel-path':'excel_path','cfg-last-dir':'last_dir'};
    for(const[id,key]of Object.entries(fields))document.getElementById(id).value=c[key]||(key==='ollama_url'?'http://localhost:11434':key==='ollama_model'?'qwen2.5:7b':'');
    const t=await request('get_theme');if(t){document.getElementById('cfg-compact-toggle').checked=!!t.compact;document.getElementById('settings-font').value=t.font_size||'md';}return true;
  }
  async function init(){build();await loadConfig();}
  async function switchCdSubTab(id){
    build();current=id;document.querySelectorAll('.cd-subtab-pane').forEach(el=>el.classList.toggle('hidden',el.id!==id));
    document.getElementById('settings-title').textContent=document.querySelector(`[data-cd="${id}"] span:last-child`)?.textContent||'Cài đặt';
    if(!loaded)await loadConfig();if(id==='cd-hm-ctr')await loadCategories();if(id==='cd-data-matrix')await loadMatrix();if(id==='cd-backup')await loadHistoryLogs();
  }
  async function savePatch(patch){if(!loaded&&!await loadConfig())return;const r=await request('save_app_config_full',patch);if(r)toast('Đã lưu cài đặt','success');}
  async function saveAiConfig(){
    const url=document.getElementById('cfg-ollama-url').value.trim();try{if(!/^https?:$/.test(new URL(url).protocol))throw Error();}catch(_){toast('URL Ollama phải bắt đầu bằng http:// hoặc https://','error');return;}
    return savePatch({gemini_api_key:document.getElementById('cfg-gemini-key').value.trim(),ollama_url:url,ollama_model:document.getElementById('cfg-ollama-model').value.trim()});
  }
  async function saveExcelConfig(){
    const patch={excel_path:document.getElementById('cfg-excel-path').value.trim(),last_dir:document.getElementById('cfg-last-dir').value.trim()};
    for(const path of Object.values(patch)){if(path){const r=await request('path_exists',path);if(!r||!r.exists){toast('Không tìm thấy đường dẫn: '+path,'error');return;}}}return savePatch(patch);
  }
  async function choosePath(id,folder){const d=await request(folder?'select_folder_dialog':'select_file_dialog',folder?'Chọn thư mục':'Chọn Excel',...(folder?[]:['Excel (*.xlsx;*.xlsm;*.xls)']));if(d)document.getElementById(id).value=typeof d==='string'?d:d.file||d.folder||d.path||'';}
  async function openConfigured(id){const p=document.getElementById(id).value.trim();if(p)await request('open_path',p);else toast('Chưa chọn đường dẫn','warning');}
  async function testAi(provider){const el=document.getElementById('settings-ai-status');el.textContent='Đang kiểm tra cấu hình đã lưu…';const d=await request('test_ai_connection',provider);el.textContent=d?`Đã kết nối ${provider} · ${d.models.length} mô hình`:'Kết nối thất bại';}
  async function loadCategories(project=''){const d=await request('get_settings_categories',project);if(!d)return;categories=d;document.getElementById('settings-project').innerHTML=[...new Set([d.project,...d.projects])].map(p=>`<option ${p===d.project?'selected':''}>${esc(p)}</option>`).join('');group=Object.keys(d.categories)[0]||'';renderCategories();}
  function renderCategories(){
    document.getElementById('settings-group').innerHTML=Object.keys(categories.categories).map(k=>`<option ${k===group?'selected':''}>${esc(k)}</option>`).join('');
    const items=categories.categories[group]?.items||[];
    document.getElementById('settings-categories').innerHTML=items.map((r,i)=>`<tr><td>${i+1}</td>${['name','code'].map(k=>`<td><input class="input input-sm input-bordered w-full" value="${esc(r[k]||'')}" data-cat-index="${i}" data-cat-key="${k}"></td>`).join('')}<td>${btn('↑',`moveCategoryRow(${i},-1)`)}${btn('↓',`moveCategoryRow(${i},1)`)}${btn('Xóa',`deleteCategoryRow(${i})`)}</td></tr>`).join('');
    document.querySelectorAll('[data-cat-index]').forEach(el=>el.oninput=()=>items[Number(el.dataset.catIndex)][el.dataset.catKey]=el.value);
  }
  function addGroup(){if(!categories)return;const name=prompt('Tên nhóm danh mục:')?.trim();if(!name||categories.categories[name])return;group=name;categories.categories[group]={code:group,items:[]};renderCategories();}
  function renameGroup(){if(!group)return;const name=prompt('Tên nhóm mới:',group)?.trim();if(!name||name===group||categories.categories[name])return;categories.categories[name]=categories.categories[group];delete categories.categories[group];group=name;renderCategories();}
  function addCategoryRow(){if(categories?.categories[group]){categories.categories[group].items.push({stt:categories.categories[group].items.length+1,name:'',code:''});renderCategories();}}
  function deleteCategoryRow(i){categories.categories[group].items.splice(i,1);renderCategories();}
  function moveCategoryRow(i,delta){const rows=categories.categories[group].items,j=i+delta;if(j<0||j>=rows.length)return;[rows[i],rows[j]]=[rows[j],rows[i]];rows.forEach((r,n)=>r.stt=n+1);renderCategories();}
  async function loadMatrix(){const d=await request('get_settings_matrix');if(d){matrix=d;section=0;renderMatrix();}}
  function renderMatrix(){
    document.getElementById('settings-matrix-section').innerHTML=matrix.sections.map((s,i)=>`<option value="${i}" ${i===section?'selected':''}>${esc(s.title)}</option>`).join('');const s=matrix.sections[section];
    document.getElementById('settings-matrix-head').innerHTML=s?`<tr>${s.headers.map(h=>`<th>${esc(h)}</th>`).join('')}<th>Thao tác</th></tr>`:'';
    document.getElementById('settings-matrix-body').innerHTML=s?s.rows.map((r,i)=>`<tr>${s.headers.map((_,j)=>`<td><textarea class="textarea textarea-bordered text-xs" data-matrix-row="${i}" data-matrix-col="${j}">${esc(r[j]||'')}</textarea></td>`).join('')}<td>${btn('Xóa',`deleteMatrixRow(${i})`)}</td></tr>`).join(''):'<tr><td>Không có bảng quy tắc trong nguồn dữ liệu.</td></tr>';
    document.querySelectorAll('[data-matrix-row]').forEach(el=>el.oninput=()=>s.rows[Number(el.dataset.matrixRow)][Number(el.dataset.matrixCol)]=el.value);
  }
  function addMatrixRow(){const s=matrix?.sections[section];if(s){s.rows.push(s.headers.map(()=>''));renderMatrix();}}
  function deleteMatrixRow(i){matrix.sections[section].rows.splice(i,1);renderMatrix();}
  async function saveCurrent(){
    if(current==='cd-ai')return saveAiConfig();if(current==='cd-excel')return saveExcelConfig();if(current==='cd-perm')return AccountsModule.savePermissions();
    if(current==='cd-hm-ctr'&&categories){const r=await request('save_settings_categories',categories.project,categories.categories);if(r)toast('Đã lưu danh mục dự án','success');return;}
    if(current==='cd-data-matrix'&&matrix){const r=await request('save_settings_matrix',matrix);if(r)toast('Đã lưu ma trận dữ liệu','success');return;}toast('Menu này lưu qua từng thao tác trên màn hình','info');
  }
  async function reload(){if(current==='cd-acc'||current==='cd-perm')return AccountsModule.init();loaded=false;await switchCdSubTab(current);}
  async function backup(){const r=await request('export_settings_backup');if(r&&!r.cancelled)toast('Đã xuất sao lưu: '+r.path,'success');}
  async function previewBackup(){document.getElementById('settings-restore').disabled=true;const file=await request('select_file_dialog','Chọn sao lưu cài đặt','JSON (*.json)');if(!file?.file)return;const data=await request('preview_settings_backup',file.file);if(data){document.getElementById('settings-restore-info').textContent=`${data.path} · ${data.projects} dự án · ${data.sections} bảng quy tắc`;document.getElementById('settings-restore').disabled=false;}}
  async function restoreBackup(){if(!confirm('Phục hồi cài đặt từ bản đã chọn? Cài đặt hiện tại sẽ được sao lưu trước khi thay thế.'))return;const data=await request('restore_settings_backup');if(data){loaded=false;document.getElementById('settings-restore').disabled=true;await loadConfig();await initTheme();toast('Đã phục hồi cài đặt','success');}}
  function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function downloadCategories(){if(categories)download(categories,'danh-muc-du-an.json');}
  function downloadMatrix(){if(matrix)download(matrix,'ma-tran-du-lieu.json');}
  async function loadHistoryLogs(){const d=await request('get_action_history_logs',50);if(d)document.getElementById('history-logs-tbody').innerHTML=d.length?d.map((h,i)=>`<tr><td>${i+1}</td><td>${esc(h.time||h.timestamp||'')}</td><td>${esc(h.module||'Hệ thống')}</td><td>${esc(h.action||h.description||'')}</td><td>${esc(h.user||'')}</td></tr>`).join(''):'<tr><td colspan="5">Chưa có nhật ký thao tác.</td></tr>';}
  return {init,switchCdSubTab,saveAiConfig,saveExcelConfig,loadHistoryLogs,reload,saveCurrent,choosePath,openConfigured,testAi,backup,previewBackup,restoreBackup,addGroup,renameGroup,addCategoryRow,deleteCategoryRow,moveCategoryRow,addMatrixRow,deleteMatrixRow,downloadCategories,downloadMatrix,loadCategories,renderCategories,loadMatrix,renderMatrix};
})();
