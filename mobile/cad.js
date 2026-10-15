'use strict';
/**
 * AwmCad: 2D CAD & DXF geometry viewer with multi-layer background (file nền/Xref) support.
 */
window.AwmCad = {
  parseDxf(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    if (lines.length > 800000) throw Error('Tệp CAD quá lớn để dựng 2D trực tiếp.');
    const pairs = [];
    for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i].trim()), lines[i + 1].trim()]);
    const entities = [];
    let section = false, current = null;
    for (let i = 0; i < pairs.length; i++) {
      const [code, value] = pairs[i];
      if (code === 0 && value === 'SECTION' && pairs[i + 1]?.[1] === 'ENTITIES') { section = true; continue; }
      if (code === 0 && value === 'ENDSEC') { if (current) entities.push(current); current = null; section = false; continue; }
      if (!section) continue;
      if (code === 0) { if (current) entities.push(current); current = { type: value, pairs: [] }; }
      else if (current) current.pairs.push([code, value]);
    }
    return entities;
  },

  render(mainText, body, controls, bgText = null) {
    let currentMain = mainText, currentBg = bgText;
    let showBg = true;

    function build() {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.style.cssText = 'width:100%;height:70dvh;background:#182b29;touch-action:none;border-radius:8px;';
      const rootG = document.createElementNS(svg.namespaceURI, 'g');
      rootG.setAttribute('transform', 'scale(1,-1)');
      svg.append(rootG);

      const groupBg = document.createElementNS(svg.namespaceURI, 'g');
      groupBg.id = 'cad-bg-layer';
      groupBg.setAttribute('stroke', '#60a5fa');
      groupBg.setAttribute('stroke-width', '1');
      groupBg.setAttribute('opacity', '0.7');
      groupBg.setAttribute('fill', 'none');
      if (!showBg) groupBg.style.display = 'none';
      rootG.append(groupBg);

      const groupFg = document.createElementNS(svg.namespaceURI, 'g');
      groupFg.id = 'cad-fg-layer';
      groupFg.setAttribute('stroke', '#d5e6b0');
      groupFg.setAttribute('stroke-width', '1.2');
      groupFg.setAttribute('fill', 'none');
      rootG.append(groupFg);

      let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
      let fgCount = 0, bgCount = 0;

      const point = (x, y) => {
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e12 || Math.abs(y) > 1e12) return;
        xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
        ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
      };

      const addEntity = (e, targetGroup) => {
        const get = code => Number(e.pairs.find(p => p[0] === code)?.[1]);
        const shape = (tag, attrs) => {
          const el = document.createElementNS(svg.namespaceURI, tag);
          for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
          el.setAttribute('vector-effect', 'non-scaling-stroke');
          targetGroup.append(el);
          if (targetGroup === groupFg) fgCount++; else bgCount++;
        };

        if (e.type === 'LINE') {
          const x = get(10), y = get(20), xx = get(11), yy = get(21);
          point(x, y); point(xx, yy);
          shape('line', { x1: x, y1: y, x2: xx, y2: yy });
        } else if (e.type === 'CIRCLE' || e.type === 'ARC') {
          const x = get(10), y = get(20), r = get(40);
          if (!(r > 0)) return;
          point(x - r, y - r); point(x + r, y + r);
          if (e.type === 'CIRCLE') shape('circle', { cx: x, cy: y, r });
          else {
            const a = get(50) * Math.PI / 180, b = get(51) * Math.PI / 180;
            const span = ((b - a) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            shape('path', { d: `M ${x + r * Math.cos(a)} ${y + r * Math.sin(a)} A ${r} ${r} 0 ${span > Math.PI ? 1 : 0} 1 ${x + r * Math.cos(b)} ${y + r * Math.sin(b)}` });
          }
        } else if (e.type === 'LWPOLYLINE') {
          const points = [];
          for (let i = 0; i < e.pairs.length; i++) {
            if (e.pairs[i][0] === 10) {
              const x = Number(e.pairs[i][1]), y = Number(e.pairs.slice(i + 1).find(p => p[0] === 20)?.[1]);
              point(x, y); points.push(`${x},${y}`);
            }
          }
          if (points.length) shape(get(70) & 1 ? 'polygon' : 'polyline', { points: points.join(' ') });
        }
      };

      if (currentBg) {
        try {
          const bgEntities = window.AwmCad.parseDxf(currentBg);
          for (const ent of bgEntities) addEntity(ent, groupBg);
        } catch (_) {}
      }

      if (currentMain) {
        try {
          const fgEntities = window.AwmCad.parseDxf(currentMain);
          for (const ent of fgEntities) addEntity(ent, groupFg);
        } catch (_) {}
      }

      if (!fgCount && !bgCount) {
        throw Error('Không tìm thấy hình học 2D để hiển thị. Hãy mở trên Google Drive CAD Viewer.');
      }

      let box = [xmin, -ymax, Math.max(xmax - xmin, 1), Math.max(ymax - ymin, 1)];
      box = [box[0] - box[2] * 0.05, box[1] - box[3] * 0.05, box[2] * 1.1, box[3] * 1.1];
      const initial = box.slice();
      const update = () => svg.setAttribute('viewBox', box.join(' '));
      update();

      controls.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;width:100%;">
          <button id="cad-in" title="Phóng to">+</button>
          <button id="cad-out" title="Thu nhỏ">−</button>
          <button id="cad-fit">Vừa màn hình</button>
          <button id="cad-toggle-bg" style="${currentBg ? '' : 'display:none;'}">${showBg ? 'Ẩn file nền' : 'Hiện file nền'}</button>
          <label class="button" style="display:inline-flex;align-items:center;padding:4px 8px;font-size:12px;background:#244438;color:#fff;border-radius:6px;cursor:pointer;">
            + Nạp file nền (Xref)
            <input id="cad-load-bg-input" type="file" accept=".dxf,.dwg,.txt" hidden>
          </label>
          <span class="sheet-note" style="margin-left:auto;">${fgCount} nét chính${currentBg ? ' · ' + bgCount + ' nét nền' : ''}</span>
        </div>
      `;

      const zoom = f => {
        const w = box[2] * f, h = box[3] * f;
        box = [box[0] + (box[2] - w) / 2, box[1] + (box[3] - h) / 2, w, h];
        update();
      };

      document.getElementById('cad-in').onclick = () => zoom(0.8);
      document.getElementById('cad-out').onclick = () => zoom(1.25);
      document.getElementById('cad-fit').onclick = () => { box = initial.slice(); update(); };

      const toggleBgBtn = document.getElementById('cad-toggle-bg');
      if (toggleBgBtn) {
        toggleBgBtn.onclick = () => {
          showBg = !showBg;
          groupBg.style.display = showBg ? '' : 'none';
          toggleBgBtn.textContent = showBg ? 'Ẩn file nền' : 'Hiện file nền';
        };
      }

      const bgInput = document.getElementById('cad-load-bg-input');
      if (bgInput) {
        bgInput.onchange = async e => {
          const file = e.target.files[0];
          if (!file) return;
          try {
            const text = await file.text();
            currentBg = text;
            showBg = true;
            build();
          } catch (err) {
            alert('Không thể đọc file nền: ' + err.message);
          }
        };
      }

      let drag = null;
      svg.onpointerdown = e => { drag = [e.clientX, e.clientY, ...box]; svg.setPointerCapture(e.pointerId); };
      svg.onpointermove = e => {
        if (!drag) return;
        const scale = Math.max(drag[4] / svg.clientWidth, drag[5] / svg.clientHeight);
        box = [drag[2] - (e.clientX - drag[0]) * scale, drag[3] - (e.clientY - drag[1]) * scale, drag[4], drag[5]];
        update();
      };
      svg.onpointerup = svg.onpointercancel = () => drag = null;

      body.replaceChildren(svg);
    }

    build();
  }
};
