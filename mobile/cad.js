'use strict';
/**
 * AwmCad: 2D CAD & DXF geometry viewer with multi-layer background (file nền/Xref) support,
 * DWG version detection, and integrated Cloud CAD (ShareCAD/AutoCAD) iframe rendering.
 */
window.AwmCad = {
  detectDwgVersion(header) {
    let str = '';
    if (typeof header === 'string') str = header.slice(0, 6);
    else if (header instanceof ArrayBuffer) str = new TextDecoder().decode(new Uint8Array(header).slice(0, 6));
    else if (header && header.buffer) str = new TextDecoder().decode(new Uint8Array(header.buffer, header.byteOffset, 6));
    const versions = {
      'AC1032': 'AutoCAD 2018–2026',
      'AC1027': 'AutoCAD 2013–2017',
      'AC1024': 'AutoCAD 2010–2012',
      'AC1021': 'AutoCAD 2007–2009',
      'AC1018': 'AutoCAD 2004–2006',
      'AC1015': 'AutoCAD 2000–2002',
      'AC1014': 'AutoCAD Release 14',
      'AC1012': 'AutoCAD Release 13',
      'AC1009': 'AutoCAD Release 11/12'
    };
    return versions[str] || (str.startsWith('AC') ? `AutoCAD (${str})` : 'AutoCAD DWG');
  },

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
      svg.style.cssText = 'width:100%;height:70dvh;background:#182b29;touch-action:none;border-radius:8px;cursor:grab;';
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
        } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
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
        throw Error('Không tìm thấy hình học 2D để hiển thị.');
      }

      let box = [xmin, -ymax, Math.max(xmax - xmin, 1), Math.max(ymax - ymin, 1)];
      box = [box[0] - box[2] * 0.05, box[1] - box[3] * 0.05, box[2] * 1.1, box[3] * 1.1];
      const initial = box.slice();
      const update = () => svg.setAttribute('viewBox', box.join(' '));
      update();

      if (controls) {
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

        const inBtn = document.getElementById('cad-in'), outBtn = document.getElementById('cad-out'), fitBtn = document.getElementById('cad-fit');
        if (inBtn) inBtn.onclick = () => zoom(0.8);
        if (outBtn) outBtn.onclick = () => zoom(1.25);
        if (fitBtn) fitBtn.onclick = () => { box = initial.slice(); update(); };

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
      }

      const zoom = f => {
        const w = box[2] * f, h = box[3] * f;
        box = [box[0] + (box[2] - w) / 2, box[1] + (box[3] - h) / 2, w, h];
        update();
      };

      svg.addEventListener('wheel', e => {
        e.preventDefault();
        zoom(e.deltaY > 0 ? 1.15 : 0.85);
      }, { passive: false });

      let drag = null;
      svg.onpointerdown = e => {
        svg.style.cursor = 'grabbing';
        drag = [e.clientX, e.clientY, ...box];
        svg.setPointerCapture(e.pointerId);
      };
      svg.onpointermove = e => {
        if (!drag) return;
        const scale = Math.max(drag[4] / svg.clientWidth, drag[5] / svg.clientHeight);
        box = [drag[2] - (e.clientX - drag[0]) * scale, drag[3] - (e.clientY - drag[1]) * scale, drag[4], drag[5]];
        update();
      };
      svg.onpointerup = svg.onpointercancel = () => {
        svg.style.cursor = 'grab';
        drag = null;
      };

      let initialDist = 0;
      svg.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
          initialDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        }
      }, { passive: true });
      svg.addEventListener('touchmove', e => {
        if (e.touches.length === 2 && initialDist > 0) {
          const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          if (dist > 10) {
            zoom(initialDist / dist > 1 ? 1.04 : 0.96);
            initialDist = dist;
          }
        }
      }, { passive: true });

      body.replaceChildren(svg);
    }

    build();
  },

  renderCloudViewer(downloadUrl, containerEl) {
    if (!containerEl) return;
    let cleanUrl = String(downloadUrl || '').trim();
    if (!cleanUrl) {
      containerEl.innerHTML = '<div class="message error">Không có URL tệp để hiển thị Cloud CAD.</div>';
      return;
    }
    const gdMatch = cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (gdMatch && !cleanUrl.includes('export=download')) {
      cleanUrl = `https://drive.google.com/uc?export=download&id=${gdMatch[1]}`;
    }
    const shareUrl = `https://iframe.sharecad.org/cadframe/load?url=${encodeURIComponent(cleanUrl)}`;
    const autodeskUrl = 'https://viewer.autodesk.com/';
    containerEl.innerHTML = `
      <div style="width:100%;height:72dvh;min-height:480px;background:#182b29;border-radius:8px;overflow:hidden;position:relative;">
        <div style="position:absolute;top:8px;right:8px;z-index:2;display:flex;gap:6px;flex-wrap:wrap;">
          <a class="button" style="padding:4px 8px;font-size:11px;background:rgba(255,255,255,0.2);color:#fff;border-radius:4px;text-decoration:none;" href="${shareUrl}" target="_blank" rel="noopener">Mở toàn màn hình ↗</a>
          <a class="button" style="padding:4px 8px;font-size:11px;background:rgba(255,255,255,0.2);color:#d5e6b0;border-radius:4px;text-decoration:none;" href="${autodeskUrl}" target="_blank" rel="noopener">Autodesk Viewer ↗</a>
        </div>
        <div id="cad-cloud-status" style="position:absolute;inset:45% 12px auto;text-align:center;color:#d5e6b0;font-size:13px;z-index:1;pointer-events:none;">Đang tải bản vẽ CAD…</div><iframe id="cad-cloud-frame" src="${shareUrl}" style="width:100%;height:100%;border:none;background:#182b29;position:relative;z-index:0;" allowfullscreen loading="eager"></iframe>
      </div>
    `;
    const frame=containerEl.querySelector('#cad-cloud-frame'),status=containerEl.querySelector('#cad-cloud-status');
    frame?.addEventListener('load',()=>{if(status)status.style.display='none'});
    setTimeout(()=>{if(status&&status.style.display!=='none')status.innerHTML='ShareCAD chưa phản hồi. Hãy dùng “Mở toàn màn hình” hoặc tải tệp DWG để mở bằng ứng dụng CAD.'},9000);
  },

  renderCadWorkspace(opt, bodyEl, controlsEl) {
    if (!bodyEl) return;
    const name = opt?.name || 'Bản vẽ CAD';
    const id = opt?.id || '';
    const ext = name.split('.').pop().toLowerCase();
    const isDxf = ext === 'dxf';
    const directUrl = opt?.directUrl || opt?.url || (id ? `https://drive.google.com/uc?export=download&id=${id}` : '');
    const downloadUrl = id ? `https://drive.google.com/uc?export=download&id=${id}` : (opt?.url || '');

    let activeTab = isDxf ? 'vector' : 'cloud';

    function renderTabs() {
      if (controlsEl) {
        controlsEl.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:6px;padding:4px 0;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:4px;">
              <button id="cad-tab-vector" class="button ${activeTab==='vector'?'active':''}" style="padding:5px 10px;font-size:12px;font-weight:700;border-radius:6px;border:none;cursor:pointer;background:${activeTab==='vector'?'#182b29':'#e2ebd8'};color:${activeTab==='vector'?'#fff':'#214739'};">📐 Vector 2D & File nền</button>
              <button id="cad-tab-cloud" class="button ${activeTab==='cloud'?'active':''}" style="padding:5px 10px;font-size:12px;font-weight:700;border-radius:6px;border:none;cursor:pointer;background:${activeTab==='cloud'?'#182b29':'#e2ebd8'};color:${activeTab==='cloud'?'#fff':'#214739'};">🌐 Cloud CAD (ShareCAD)</button>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:wrap;">
              <a class="button" style="display:inline-flex;align-items:center;padding:5px 10px;font-size:12px;font-weight:600;text-decoration:none;border-radius:6px;background:#182b29;color:#d5e6b0;" href="https://viewer.autodesk.com/" target="_blank" rel="noopener">Autodesk Viewer ↗</a>
              ${downloadUrl ? `<a class="button" style="display:inline-flex;align-items:center;padding:5px 10px;font-size:12px;font-weight:600;text-decoration:none;border-radius:6px;background:#244438;color:#fff;" href="${downloadUrl}" target="_blank" download="${name}">⬇ Tải tệp DWG</a>` : ''}
              <label class="button" style="display:inline-flex;align-items:center;padding:5px 10px;font-size:12px;background:#182b29;color:#fff;border-radius:6px;cursor:pointer;">
                + Nạp file nền (Xref)
                <input id="cad-xref-input" type="file" accept=".dxf,.dwg,.txt" hidden>
              </label>
            </div>
          </div>
        `;
        const vBtn = document.getElementById('cad-tab-vector'), cBtn = document.getElementById('cad-tab-cloud');
        if (vBtn) vBtn.onclick = () => { activeTab = 'vector'; renderTabs(); renderContent(); };
        if (cBtn) cBtn.onclick = () => { activeTab = 'cloud'; renderTabs(); renderContent(); };
        const xrefInput = document.getElementById('cad-xref-input');
        if (xrefInput) {
          xrefInput.onchange = async e => {
            const file = e.target.files[0];
            if (!file) return;
            try {
              const text = await file.text();
              activeTab = 'vector';
              renderTabs();
              window.AwmCad.render(text, bodyEl, null, null);
            } catch (err) {
              alert('Lỗi nạp file nền: ' + err.message);
            }
          };
        }
      }
    }

    function renderContent() {
      if (activeTab === 'cloud') {
        window.AwmCad.renderCloudViewer(downloadUrl || directUrl, bodyEl);
      } else {
        if (opt.dxfText) {
          try {
            window.AwmCad.render(opt.dxfText, bodyEl, null, opt.bgText || null);
            return;
          } catch (_) {}
        }
        bodyEl.innerHTML = `
          <div class="card" style="padding:20px;background:#182b29;color:#fff;border-radius:10px;text-align:center;margin:20px auto;max-width:540px;">
            <div style="font-size:42px;margin-bottom:8px;">📐</div>
            <h3 style="margin:0 0 8px 0;color:#d5e6b0;font-size:16px;">Trình xem CAD 2D & Đối chiếu File nền (Xref)</h3>
            <p style="font-size:13px;color:#cbd5e1;line-height:1.5;margin:0 0 16px 0;">
              Chế độ Vector 2D hỗ trợ dựng hình các lớp kiến trúc, hạ tầng, đối chiếu file nền Xref trực tiếp mà không cần cài AutoCAD.
            </p>
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
              <label class="button" style="display:inline-flex;align-items:center;padding:8px 16px;font-size:13px;font-weight:700;background:#d5e6b0;color:#182b29;border-radius:6px;cursor:pointer;">
                📂 Chọn tệp CAD (DXF/DWG) trên máy
                <input id="cad-direct-file-input" type="file" accept=".dxf,.dwg,.txt" hidden>
              </label>
              ${downloadUrl ? `<a class="button" style="display:inline-flex;align-items:center;padding:8px 16px;font-size:13px;font-weight:600;text-decoration:none;border-radius:6px;background:#244438;color:#fff;" href="${downloadUrl}" target="_blank" download>⬇ Tải về</a>` : ''}
            </div>
            <div id="cad-vector-inner" style="margin-top:16px;"></div>
          </div>
        `;
        const fInput = document.getElementById('cad-direct-file-input');
        if (fInput) {
          fInput.onchange = async e => {
            const file = e.target.files[0];
            if (!file) return;
            try {
              const text = await file.text();
              window.AwmCad.render(text, bodyEl, controlsEl, null);
            } catch (err) {
              alert('Lỗi đọc tệp CAD: ' + err.message);
            }
          };
        }
      }
    }

    renderTabs();
    renderContent();
  }
};
