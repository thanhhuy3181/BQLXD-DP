const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'pdf', 'index.html');
let html = fs.readFileSync(filePath, 'utf8');

// 1. Markup
const targetMarkup = '<div class="float" id="float"></div>';
const newMarkup = `<div class="float" id="float" data-fullbar="true"></div>

      <!-- Bảng Menu nổi chế độ toàn màn hình -->
      <div class="float-menu-pop" id="floatMenuPop" hidden aria-label="Menu toàn màn hình">
        <div class="float-menu-head">
          <div class="float-menu-title">
            <svg class="i" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M4 6h16M4 12h16M4 18h16"></path></svg>
            <span>CÔNG CỤ TOÀN MÀN HÌNH</span>
          </div>
          <div class="float-menu-tabs" id="floatMenuTabs"></div>
          <button class="icon-btn float-menu-close" id="btnCloseFloatMenu" title="Đóng menu (Esc)">✕</button>
        </div>
        <div class="float-menu-body" id="floatMenuBody"></div>
      </div>`;

if (!html.includes(targetMarkup)) {
  console.error('Target markup not found!');
  process.exit(1);
}
html = html.replace(targetMarkup, newMarkup);

// 2. CSS
const targetCss = `.float{position:absolute;left:50%;bottom:16px;transform:translate(-50%,80px);opacity:0;display:flex;gap:2px;align-items:center;background:var(--surface);border:1.5px solid var(--fg);border-radius:8px;padding:5px;box-shadow:4px 4px 0 var(--hard);transition:transform var(--mid),opacity var(--mid);z-index:5;max-width:calc(100% - 24px);overflow-x:auto}
.app.immersive .float{transform:translate(-50%,0);opacity:1}
.float .tool{min-width:44px;font-size:10px}`;

const newCss = `.float{position:absolute;left:50%;bottom:16px;transform:translate(-50%,80px);opacity:0;display:flex;gap:2px;align-items:center;background:var(--surface);border:1.5px solid var(--fg);border-radius:8px;padding:5px;box-shadow:4px 4px 0 var(--hard);transition:transform var(--mid),opacity var(--mid);z-index:45;max-width:calc(100% - 24px);overflow-x:auto}
.app.immersive .float{transform:translate(-50%,0);opacity:1}
.float .tool{min-width:44px;font-size:10px}
.float-menu-btn{font-weight:700}
.float-menu-btn.on{background:var(--accent);color:var(--accent-fg);border-color:var(--fg)}

.float-menu-pop{position:fixed;left:50%;bottom:74px;transform:translateX(-50%) translateY(10px) scale(0.98);width:min(94vw, 760px);max-height:calc(100vh - 90px);background:var(--surface);border:1.5px solid var(--fg);border-radius:10px;box-shadow:0 16px 40px rgba(0,0,0,0.35), 4px 4px 0 var(--hard);z-index:55;display:none;flex-direction:column;overflow:hidden;opacity:0;transition:opacity 160ms var(--out),transform 160ms var(--out)}
.float-menu-pop.show{display:flex;opacity:1;transform:translateX(-50%) translateY(0) scale(1)}
.float-menu-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;background:var(--surface-2,#f8fafc);border-bottom:1.5px solid var(--line);flex:none}
.float-menu-title{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;font-family:var(--mono);color:var(--accent);letter-spacing:.3px;white-space:nowrap;flex:none}
.float-menu-tabs{display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:thin;flex:1;padding:2px 0}
.float-menu-tab-btn{padding:5px 9px;font-size:11px;font-weight:700;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--muted);cursor:pointer;white-space:nowrap;transition:all var(--fast)}
.float-menu-tab-btn:hover{color:var(--fg);background:var(--surface)}
.float-menu-tab-btn.on{color:var(--accent);background:var(--surface);border-color:var(--line);box-shadow:0 1px 3px rgba(0,0,0,0.08)}
.float-menu-close{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border-radius:4px;border:1px solid var(--line);background:var(--surface);cursor:pointer;font-size:13px;flex:none}
.float-menu-close:hover{background:#fee2e2;color:#dc2626;border-color:#dc2626}
.float-menu-body{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;align-content:flex-start}
.float-menu-body .rgroup{background:var(--surface-2,rgba(0,0,0,0.02));border:1px solid var(--line);border-radius:6px;padding:6px;margin-right:0;display:flex;flex-direction:column;justify-content:space-between}
.float-menu-body .rgroup-body{display:flex;align-items:stretch;gap:3px;flex:1}
.float-menu-body .rgroup-title{font-size:9.5px;font-weight:700;color:var(--muted);text-align:center;margin-top:4px;padding-top:3px;border-top:1px dotted var(--line);letter-spacing:.2px}
@media (max-width: 600px){
  .float-menu-pop{bottom:64px;width:96vw;max-height:calc(100vh - 75px);border-radius:8px}
  .float-menu-head{flex-wrap:wrap;padding:4px 8px}
  .float-menu-title{font-size:10px}
  .float-menu-body{flex-direction:column;flex-wrap:nowrap;gap:8px;padding:8px}
  .float-menu-body .rgroup{width:100%;box-sizing:border-box}
  .float-menu-body .rgroup-body{flex-wrap:wrap;gap:4px}
  .float-menu-body .tool.sm{height:28px;padding:2px 8px;font-size:11px}
}`;

if (!html.includes(targetCss)) {
  console.error('Target CSS not found!');
  process.exit(1);
}
html = html.replace(targetCss, newCss);

// 3. JavaScript: renderFloat, open/closeFloatMenu, and events
const targetJs = `function renderFloat(){
  const f=$('#float');
  [['hand','Kéo','tool'],['rect','Tô vùng','tool'],['cloud','Đám mây','tool'],['text','Ô chữ','tool'],['note','Ghi chú','tool'],['zout','Nhỏ','zout'],['zin','To','zin']].forEach(t=>f.append(toolBtn(t)));
  const x=el('button','tool',ic('exit')+'<span>Thoát</span>');
  x.onclick=()=>immersive(false);
  f.append(x);
}`;

const newJs = `const FULL_MENU_TABS = ['Trang chủ', 'Ghi chú', 'Bình luận', 'Xem', 'Trang', 'Bảo vệ', 'Biểu mẫu', 'Xuất'];

function renderFloatMenuTabs(activeTab){
  const tabsBox = $('#floatMenuTabs');
  if(!tabsBox) return;
  tabsBox.replaceChildren();

  const allTabs = (S.sel && S.sel.size > 0) ? [...FULL_MENU_TABS, ...CTX_RIB_TABS] : FULL_MENU_TABS;
  allTabs.forEach(tName => {
    const isAct = (tName === activeTab);
    const b = el('button', 'float-menu-tab-btn' + (isAct ? ' on' : ''), tName);
    b.onclick = () => {
      S.tab = tName;
      if(FULL_MENU_TABS.includes(tName)) S.lastRegularTab = tName;
      renderFloatMenuTabs(tName);
      renderFloatMenuBody(tName);
      try { renderTabs(); renderTools(false); } catch(_) {}
    };
    tabsBox.append(b);
  });
}

function renderFloatMenuBody(targetTab){
  const body = $('#floatMenuBody');
  if(!body) return;
  body.replaceChildren();

  const tName = targetTab || S.tab || 'Trang chủ';
  let groups = [];
  if(CTX_RIB_TABS.includes(tName) && S.sel && S.sel.size > 0){
    groups = buildContextualRibbon(tName);
  }else if(tName === LAYER_TAB){
    for(const [name, items] of LAYER_RIB){
      groups.push(buildRibbonGroup(name, items));
    }
  }else if(RIB[tName]){
    for(const [name, items] of RIB[tName]){
      groups.push(buildRibbonGroup(name, items));
    }
    const mine = (custom[tName] || []).filter(k => CAT[k]);
    if(mine.length){
      groups.push(buildRibbonGroup('Nút tôi thêm', mine.map(k => CAT[k])));
    }
  }

  groups.forEach(g => body.append(g));
}

function openFloatMenu(){
  const pop = $('#floatMenuPop');
  if(!pop) return;
  const curTab = (CTX_RIB_TABS.includes(S.tab) && (!S.sel || S.sel.size === 0)) ? (S.lastRegularTab || 'Trang chủ') : (S.tab || 'Trang chủ');
  renderFloatMenuTabs(curTab);
  renderFloatMenuBody(curTab);
  pop.hidden = false;
  pop.classList.add('show');
  $('#fullMenuBtn')?.classList.add('on');
}

function closeFloatMenu(){
  const pop = $('#floatMenuPop');
  if(!pop) return;
  pop.classList.remove('show');
  pop.hidden = true;
  $('#fullMenuBtn')?.classList.remove('on');
}

function toggleFloatMenu(){
  const pop = $('#floatMenuPop');
  if(pop && pop.classList.contains('show') && !pop.hidden){
    closeFloatMenu();
  }else{
    openFloatMenu();
  }
}

function renderFloat(){
  const f = $('#float') || $('#fullBar');
  if(!f) return;
  f.replaceChildren();

  // Nút Menu (≡) mở bảng chứa đầy đủ các nút của tab đang chọn
  const m = el('button', 'tool float-menu-btn', ic('menu') + '<span>Menu</span>');
  m.id = 'fullMenuBtn';
  m.title = 'Menu công cụ toàn màn hình (≡)';
  m.onclick = (e) => {
    e.stopPropagation();
    toggleFloatMenu();
  };
  f.append(m);

  [['hand','Kéo','tool'],['rect','Tô vùng','tool'],['cloud','Đám mây','tool'],['text','Ô chữ','tool'],['note','Ghi chú','tool'],['zout','Nhỏ','zout'],['zin','To','zin']].forEach(t=>f.append(toolBtn(t)));
  const x = el('button', 'tool', ic('exit') + '<span>Thoát</span>');
  x.onclick = () => {
    closeFloatMenu();
    immersive(false);
  };
  f.append(x);
}`;

if (!html.includes(targetJs)) {
  console.error('Target JS not found!');
  process.exit(1);
}
html = html.replace(targetJs, newJs);

// 4. Update immersive(on) to close float menu when exiting
const targetImmersive = `function immersive(on){
  $('#app').classList.toggle('immersive',on);
  try{on?document.documentElement.requestFullscreen?.().catch(()=>{}):document.fullscreenElement&&document.exitFullscreen().catch(()=>{})}catch(_){}
  if(on)toast('Chế độ tràn viền. Bấm Esc hoặc nút Thoát');
}`;

const newImmersive = `function immersive(on){
  if(!on) closeFloatMenu();
  $('#app').classList.toggle('immersive',on);
  try{on?document.documentElement.requestFullscreen?.().catch(()=>{}):document.fullscreenElement&&document.exitFullscreen().catch(()=>{})}catch(_){}
  if(on)toast('Chế độ tràn viền. Bấm Esc hoặc nút Thoát');
}`;

if (html.includes(targetImmersive)) {
  html = html.replace(targetImmersive, newImmersive);
}

// 5. Update Escape keydown and click-outside listeners
const targetKeydown = `document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(ACTIVE_POLY)cancelActivePoly();closeAll();immersive(false);$('#colorPop').classList.remove('show');$('#ctxMenu').classList.remove('show')}});`;
const newKeydown = `document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(ACTIVE_POLY)cancelActivePoly();closeFloatMenu();closeAll();immersive(false);$('#colorPop').classList.remove('show');$('#ctxMenu').classList.remove('show')}});`;

if (html.includes(targetKeydown)) {
  html = html.replace(targetKeydown, newKeydown);
}

// 6. Bind click-outside, close button, and tool action auto-close
const targetInit = `$('#btnSet').innerHTML=ic('gear');`;
const newInit = `$('#btnSet').innerHTML=ic('gear');

  $('#btnCloseFloatMenu')?.addEventListener('click', closeFloatMenu);
  $('#floatMenuBody')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button.tool, button.btn');
    if (!btn) return;
    if (btn.classList.contains('has-dd') && ev.target.closest('.tool-dd')) return;
    if (ev.target.closest('.split-arrow') || ev.target.closest('.color-btn-trigger') || ev.target.closest('#colorPop') || ev.target.closest('input') || ev.target.closest('select')) return;
    closeFloatMenu();
  });
  document.addEventListener('pointerdown', (e) => {
    const pop = $('#floatMenuPop');
    if (!pop || pop.hidden || !pop.classList.contains('show')) return;
    if (!e.target.closest('#floatMenuPop') && 
        !e.target.closest('#fullMenuBtn') && 
        !e.target.closest('#colorPop') && 
        !e.target.closest('#rgroupPop') && 
        !e.target.closest('#ctxMenu') && 
        !e.target.closest('#stampGallery')) {
      closeFloatMenu();
    }
  });`;

if (html.includes(targetInit)) {
  html = html.replace(targetInit, newInit);
} else {
  console.error('Target init not found!');
  process.exit(1);
}

fs.writeFileSync(filePath, html, 'utf8');
console.log('Successfully patched pdf/index.html with fullscreen Menu!');
