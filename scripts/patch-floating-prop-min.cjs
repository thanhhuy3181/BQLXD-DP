const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'pdf', 'index.html');
let html = fs.readFileSync(filePath, 'utf8');

// 1. Update HTML of propFloating
const targetHtml = `<div class="prop-floating" id="propFloating" hidden>
    <div class="prop-floating-head" id="propFloatingHead">
      <span>THUỘC TÍNH (PROPERTIES)</span>
      <div style="display:flex;gap:4px">
        <button class="icon-btn" id="btnDockProp" title="Ghim lại vào cột phải" style="width:22px;height:22px">📌</button>
        <button class="icon-btn" id="btnCloseFloatProp" title="Đóng cửa sổ" style="width:22px;height:22px">✕</button>
      </div>
    </div>
    <div class="prop-box" id="propBoxFloating" style="max-height:calc(80vh - 40px)"></div>
  </div>`;

const newHtml = `<div class="prop-floating" id="propFloating" hidden>
    <div class="prop-floating-head" id="propFloatingHead">
      <span id="propFloatingTitle">THUỘC TÍNH (PROPERTIES)</span>
      <div style="display:flex;gap:4px;align-items:center">
        <button class="icon-btn" id="btnMinFloatProp" title="Thu nhỏ (—)" style="width:22px;height:22px;font-size:12px;font-weight:700;line-height:1">—</button>
        <button class="icon-btn" id="btnDockProp" title="Ghim lại vào cột phải" style="width:22px;height:22px">📌</button>
        <button class="icon-btn" id="btnCloseFloatProp" title="Đóng cửa sổ" style="width:22px;height:22px">✕</button>
      </div>
    </div>
    <div class="prop-box" id="propBoxFloating" style="max-height:calc(80vh - 40px)"></div>
  </div>`;

if (!html.includes(targetHtml)) {
  console.error('Target HTML not found!');
  process.exit(1);
}
html = html.replace(targetHtml, newHtml);

// 2. Update CSS of propFloating
const targetCss = `.prop-floating{position:fixed;top:100px;right:40px;width:320px;max-height:80vh;background:var(--surface);border:1.5px solid var(--fg);border-radius:8px;box-shadow:8px 8px 0 var(--hard);z-index:20;display:flex;flex-direction:column;overflow:hidden}
.prop-floating[hidden]{display:none}
.prop-floating-head{padding:6px 10px;background:var(--surface-2);border-bottom:1.5px solid var(--fg);display:flex;align-items:center;justify-content:space-between;cursor:move;user-select:none;font-weight:700;font-size:12px;font-family:var(--mono)}`;

const newCss = `.prop-floating{position:fixed;top:100px;right:40px;width:320px;max-height:80vh;background:var(--surface);border:1.5px solid var(--fg);border-radius:8px;box-shadow:8px 8px 0 var(--hard);z-index:52;display:flex;flex-direction:column;overflow:hidden;transition:max-height 180ms ease,width 180ms ease,box-shadow 180ms ease}
.prop-floating[hidden]{display:none}
.prop-floating-head{padding:6px 10px;background:var(--surface-2);border-bottom:1.5px solid var(--fg);display:flex;align-items:center;justify-content:space-between;cursor:move;user-select:none;font-weight:700;font-size:12px;font-family:var(--mono)}
.prop-floating.minimized{max-height:36px!important;width:auto!important;min-width:180px!important;box-shadow:0 4px 12px rgba(0,0,0,0.25),3px 3px 0 var(--hard)!important;border-radius:8px!important;overflow:hidden!important}
.prop-floating.minimized .prop-box{display:none!important}
.prop-floating.minimized .prop-floating-head{border-bottom:0!important;padding:5px 10px!important;cursor:pointer!important}
.prop-floating.minimized #btnDockProp{display:none!important}
.app.immersive .prop-floating{z-index:52;box-shadow:0 16px 36px rgba(0,0,0,0.35),4px 4px 0 var(--hard)}`;

if (!html.includes(targetCss)) {
  console.error('Target CSS not found!');
  process.exit(1);
}
html = html.replace(targetCss, newCss);

// 3. Update act() to trigger openFloatingPropForTool in fullscreen mode
const targetAct = `else if(id==='pen'){
      toast('Kéo vẽ tự do bằng chuột hoặc bút cảm ứng — chọn loại bút & màu ở bảng Thuộc tính');
      if(!matchMedia('(max-width:760px)').matches){ $('#cmt')?.classList.remove('closed'); if(typeof switchRightTab==='function') switchRightTab('prop'); }
    }`;

const newAct = `else if(id==='pen'){
      toast('Kéo vẽ tự do bằng chuột hoặc bút cảm ứng — chọn loại bút & màu ở bảng Thuộc tính');
      if($('#app').classList.contains('immersive')){
        openFloatingPropForTool('pen');
      }else if(!matchMedia('(max-width:760px)').matches){
        $('#cmt')?.classList.remove('closed');
        if(typeof switchRightTab==='function') switchRightTab('prop');
      }
    }
    if($('#app').classList.contains('immersive') && ['pen', 'line', 'arrow', 'rect', 'oval', 'poly', 'cloud', 'text', 'callout', 'note'].includes(id)){
      openFloatingPropForTool(id);
    }`;

if (!html.includes(targetAct)) {
  console.error('Target act not found!');
  process.exit(1);
}
html = html.replace(targetAct, newAct);

// 4. Update JS for floating window: toggleMinFloatProp, openFloatingPropForTool, and listeners
const targetDock = `$('#btnDockProp').onclick=()=>{
  S.propDocked=true;
  $('#propFloating').hidden=true;
  switchRightTab('prop');
  syncPropertiesPanel();
  toast('Đã ghim Bảng thuộc tính vào cột bên phải');
};`;

const newDock = `function toggleMinFloatProp(forceState){
  const win = $('#propFloating');
  const btn = $('#btnMinFloatProp');
  if(!win) return;
  const isMin = (typeof forceState === 'boolean') ? forceState : !win.classList.contains('minimized');
  win.classList.toggle('minimized', isMin);
  if(btn){
    btn.textContent = isMin ? '🗖' : '—';
    btn.title = isMin ? 'Phóng to bảng thuộc tính (để chỉnh thông số)' : 'Thu nhỏ bảng thuộc tính';
    btn.setAttribute('aria-label', btn.title);
  }
}

function openFloatingPropForTool(toolId){
  const win = $('#propFloating');
  if(!win) return;
  win.hidden = false;
  toggleMinFloatProp(false); // To ra khi muốn chỉnh thông số
  if(!win.style.top || parseInt(win.style.top) < 0 || parseInt(win.style.top) > window.innerHeight - 100){
    win.style.top = '24px';
    win.style.left = Math.max(16, window.innerWidth - 340) + 'px';
  }
  const titleEl = $('#propFloatingTitle');
  if(titleEl){
    titleEl.textContent = (toolId === 'pen') ? 'THUỘC TÍNH: BÚT VẼ' : ('THUỘC TÍNH: ' + (TOOLN[toolId] || toolId).toUpperCase());
  }
  syncPropertiesPanel();
}

$('#btnMinFloatProp')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMinFloatProp();
});

$('#propFloatingHead')?.addEventListener('dblclick', (e) => {
  if(e.target.closest('button')) return;
  toggleMinFloatProp();
});

$('#propFloatingHead')?.addEventListener('click', (e) => {
  if(e.target.closest('button')) return;
  if($('#propFloating')?.classList.contains('minimized')){
    toggleMinFloatProp(false);
  }
});

$('#btnDockProp').onclick=()=>{
  if($('#app').classList.contains('immersive')){
    toast('Đang ở chế độ toàn màn hình, bảng thuộc tính luôn ở dạng cửa sổ nổi');
    return;
  }
  S.propDocked=true;
  $('#propFloating').hidden=true;
  switchRightTab('prop');
  syncPropertiesPanel();
  toast('Đã ghim Bảng thuộc tính vào cột bên phải');
};`;

if (!html.includes(targetDock)) {
  console.error('Target dock not found!');
  process.exit(1);
}
html = html.replace(targetDock, newDock);

// 5. Update title in syncPropertiesPanel
const targetSyncPen = `if(S.sel.size===0 && S.tool==='pen'){
    const sec=el('div','prop-sec');
    sec.append(el('div','prop-sec-title','▼ Bút vẽ (nét tiếp theo)'));
    sec.append(buildPenPicker(null));
    targetBox.append(sec);
    return;
  }`;

const newSyncPen = `if(S.sel.size===0 && S.tool==='pen'){
    const titleEl=$('#propFloatingTitle');
    if(titleEl) titleEl.textContent='THUỘC TÍNH: BÚT VẼ';
    const sec=el('div','prop-sec');
    sec.append(el('div','prop-sec-title','▼ Bút vẽ (nét tiếp theo)'));
    sec.append(buildPenPicker(null));
    targetBox.append(sec);
    return;
  }`;

if (html.includes(targetSyncPen)) {
  html = html.replace(targetSyncPen, newSyncPen);
}

fs.writeFileSync(filePath, html, 'utf8');
console.log('Successfully patched floating properties with minimize/expand & fullscreen pen tool!');
