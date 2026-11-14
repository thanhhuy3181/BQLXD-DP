const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'pdf', 'index.html');
let html = fs.readFileSync(filePath, 'utf8');

// 1. Update CSS
const targetCss = `.float{position:absolute;left:50%;bottom:16px;transform:translate(-50%,80px);opacity:0;display:flex;gap:2px;align-items:center;background:var(--surface);border:1.5px solid var(--fg);border-radius:8px;padding:5px;box-shadow:4px 4px 0 var(--hard);transition:transform var(--mid),opacity var(--mid);z-index:45;max-width:calc(100% - 24px);overflow-x:auto}
.app.immersive .float{transform:translate(-50%,0);opacity:1}
.float .tool{min-width:44px;font-size:10px}
.float-menu-btn{font-weight:700}
.float-menu-btn.on{background:var(--accent);color:var(--accent-fg);border-color:var(--fg)}`;

const newCss = `.float{position:absolute;left:50%;bottom:16px;transform:translate(-50%,80px);opacity:0;display:flex;gap:4px;align-items:center;background:var(--surface);border:1.5px solid var(--fg);border-radius:10px;padding:5px 8px;box-shadow:0 8px 24px rgba(0,0,0,0.28), 4px 4px 0 var(--hard);transition:transform var(--mid),opacity var(--mid);z-index:45;max-width:calc(100% - 24px);overflow-x:auto;-webkit-overflow-scrolling:touch}
.app.immersive .float{transform:translate(-50%,0);opacity:1}
.float .tool,.float button{width:42px;height:42px;min-width:42px;padding:0;display:inline-flex;align-items:center;justify-content:center;border-radius:7px;border:1.5px solid transparent;color:var(--fg);background:transparent;flex:none;cursor:pointer;transition:transform var(--fast),background var(--fast),border-color var(--fast)}
.float .tool span,.float button span{display:none!important}
.float .tool svg.i,.float button svg.i{width:24px!important;height:24px!important;stroke-width:2}
.float .tool:hover,.float button:hover{transform:scale(1.08);background:var(--surface-2);border-color:var(--line)}
.float .tool.on,.float button.on{background:var(--accent)!important;color:var(--accent-fg)!important;border-color:var(--fg)!important}`;

if (!html.includes(targetCss)) {
  console.error('Target CSS not found!');
  process.exit(1);
}
html = html.replace(targetCss, newCss);

// Update mobile media query for .float
const targetMobileCss = `@media (max-width: 600px){
  .float-menu-pop{bottom:64px;width:96vw;max-height:calc(100vh - 75px);border-radius:8px}`;

const newMobileCss = `@media (max-width: 600px){
  .float{bottom:10px;padding:4px 6px;gap:3px}
  .float .tool,.float button{width:38px;height:38px;min-width:38px}
  .float .tool svg.i,.float button svg.i{width:22px!important;height:22px!important}
  .float-menu-pop{bottom:64px;width:96vw;max-height:calc(100vh - 75px);border-radius:8px}`;

if (html.includes(targetMobileCss)) {
  html = html.replace(targetMobileCss, newMobileCss);
}

// 2. Update renderFloat and add updateFloatActiveTool
const targetRenderFloat = `function renderFloat(){
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

const newRenderFloat = `const FLOAT_BOTTOM_TOOLS = [
  ['hand', 'Kéo (Hand)', 'tool'],
  ['pick', 'Chọn ghi chú (Select Annotation)', 'tool'],
  ['rect', 'Tô vùng (Rectangle)', 'tool'],
  ['text', 'Viết chữ (Text Box)', 'tool'],
  ['callout', 'Callout (Chú dẫn mũi tên)', 'tool'],
  ['line', 'Đường thẳng (Line)', 'tool'],
  ['note', 'Ghi chú (Sticky Note)', 'tool'],
  ['pen', 'Bút vẽ (Draw Pen)', 'tool'],
  ['zout', 'Thu nhỏ (Zoom Out)', 'zout'],
  ['zin', 'Phóng to (Zoom In)', 'zin'],
  ['exit', 'Thoát toàn màn hình (Esc)', 'exit'],
  ['menu', 'Menu công cụ (≡)', 'menu']
];

function updateFloatActiveTool(){
  const f = $('#float') || $('#fullBar');
  if(!f) return;
  f.querySelectorAll('[data-tool-id]').forEach(btn => {
    btn.classList.toggle('on', S.tool === btn.dataset.toolId);
  });
}

function renderFloat(){
  const f = $('#float') || $('#fullBar');
  if(!f) return;
  f.replaceChildren();

  FLOAT_BOTTOM_TOOLS.forEach(([id, label, kind]) => {
    if(kind === 'exit'){
      const b = el('button', 'tool float-tool-btn', ic('exit'));
      b.dataset.floatAction = 'exit';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.onclick = () => { closeFloatMenu(); immersive(false); };
      f.append(b);
    }else if(kind === 'menu'){
      const b = el('button', 'tool float-tool-btn float-menu-btn', ic('menu'));
      b.id = 'fullMenuBtn';
      b.dataset.floatAction = 'menu';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.onclick = (e) => { e.stopPropagation(); toggleFloatMenu(); };
      f.append(b);
    }else if(kind === 'zout'){
      const b = el('button', 'tool float-tool-btn', ic('zout'));
      b.dataset.floatAction = 'zout';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.onclick = () => { act('zout', 'zout', 'Thu nhỏ'); };
      f.append(b);
    }else if(kind === 'zin'){
      const b = el('button', 'tool float-tool-btn', ic('zin'));
      b.dataset.floatAction = 'zin';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.onclick = () => { act('zin', 'zin', 'Phóng to'); };
      f.append(b);
    }else{
      const b = el('button', 'tool float-tool-btn' + (S.tool === id ? ' on' : ''), ic(id));
      b.dataset.toolId = id;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.onclick = () => {
        act(id, 'tool', label);
        updateFloatActiveTool();
      };
      f.append(b);
    }
  });
}`;

if (!html.includes(targetRenderFloat)) {
  console.error('Target renderFloat not found!');
  process.exit(1);
}
html = html.replace(targetRenderFloat, newRenderFloat);

// 3. In act(): updateFloatActiveTool()
const targetAct = `S.tool=id;
    $('#stTool').textContent='Công cụ: '+(TOOLN[id]||label);
    renderTools(false);
    syncLayers();`;

const newAct = `S.tool=id;
    $('#stTool').textContent='Công cụ: '+(TOOLN[id]||label);
    renderTools(false);
    if(typeof updateFloatActiveTool==='function') updateFloatActiveTool();
    syncLayers();`;

if (html.includes(targetAct)) {
  html = html.replace(targetAct, newAct);
}

fs.writeFileSync(filePath, html, 'utf8');
console.log('Successfully updated float buttons and styles!');
