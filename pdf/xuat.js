'use strict';
/* Xuất tài liệu nhiều định dạng (tab Xuất), gần với nhóm Export của PDF-XChange.
   Mọi định dạng dựng từ "PDF kèm ghi chú" (exportPdfWithAnnotations({download:false})) nên ghi chú luôn có mặt.
   Thư viện nạp khi cần: JSZip (zip/docx), SheetJS (xlsx, có sẵn trong repo), PptxGenJS (pptx). */
(function () {
  const LIBS = {
    jszip: { url: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', ok: () => !!window.JSZip },
    xlsx: { url: '/mobile/vendor/xlsx.full.min.js', ok: () => !!window.XLSX },
    pptx: { url: 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js', ok: () => !!window.PptxGenJS }
  };
  const loadLib = key => new Promise((res, rej) => {
    const L = LIBS[key];
    if (L.ok()) return res();
    const sc = document.createElement('script');
    sc.src = L.url; sc.async = true;
    sc.onload = () => (L.ok() ? res() : rej(new Error('Không nạp được thư viện ' + key)));
    sc.onerror = () => rej(new Error('Không tải được thư viện ' + key + ' (kiểm tra mạng)'));
    document.head.append(sc);
  });

  const FORMATS = {
    dlflat: { label: 'PDF phẳng (ảnh, ghi chú in vào trang)', ext: 'pdf' },
    dlimg: { label: 'Ảnh trang (PNG/JPEG, nhiều trang thì gói ZIP)', ext: 'img' },
    dlword: { label: 'Word (.docx) — ảnh trang + chữ trích ra', ext: 'docx' },
    dlxls: { label: 'Excel (.xlsx) — danh sách ghi chú + chữ theo trang', ext: 'xlsx' },
    dlppt: { label: 'PowerPoint (.pptx) — mỗi trang một slide', ext: 'pptx' },
    dlxfdf: { label: 'Ghi chú XFDF (nhập được vào PDF-XChange/Acrobat)', ext: 'xfdf' },
    dlcmt: { label: 'Danh sách ghi chú (Excel)', ext: 'xlsx' }
  };

  const baseName = () => {
    const ps = getActivePaneState();
    return String((ps && ps.name) || 'Ban-ve').replace(/\.pdf$/i, '');
  };
  const saveBlob = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 3000);
  };
  const xmlEsc = s => String(s == null ? '' : s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

  // Danh sách trang từ chuỗi "1-3,5" (1-based); rỗng = tất cả.
  function parsePages(spec, total) {
    const out = new Set();
    String(spec || '').split(',').map(x => x.trim()).filter(Boolean).forEach(part => {
      const m = /^(\d+)\s*-\s*(\d+)$/.exec(part);
      if (m) { for (let i = Math.max(1, +m[1]); i <= Math.min(total, +m[2]); i++) out.add(i); }
      else if (/^\d+$/.test(part) && +part >= 1 && +part <= total) out.add(+part);
    });
    return out.size ? [...out].sort((a, b) => a - b) : Array.from({ length: total }, (_, i) => i + 1);
  }

  // Mở bản "PDF kèm ghi chú" bằng pdf.js; giữ trạng thái bật/tắt layer CAD hiện tại.
  async function annotatedDoc() {
    const bytes = await exportPdfWithAnnotations({ download: false });
    if (!bytes) throw new Error('Chưa có tài liệu để xuất.');
    const doc = await pdfjsLib.getDocument({ data: bytes.slice ? bytes.slice(0) : bytes }).promise;
    let oc = null;
    const ps = getActivePaneState();
    if (ps && ps.cadLayers && ps.cadLayers.some(L => !L.visible)) {
      try {
        oc = await doc.getOptionalContentConfig();
        const groups = oc.getGroups() || {};
        const hidden = new Set(ps.cadLayers.filter(L => !L.visible).map(L => L.name));
        Object.entries(groups).forEach(([id, g]) => { if (hidden.has(String(g.name || '').trim())) oc.setVisibility(id, false); });
      } catch (_) { oc = null; }
    }
    return { doc, bytes, oc };
  }

  async function renderPage(doc, oc, n, dpi, mime, quality) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: dpi / 72 });
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp, annotationMode: pdfjsLib.AnnotationMode.ENABLE, ...(oc ? { optionalContentConfigPromise: Promise.resolve(oc) } : {}) }).promise;
    const blob = await new Promise(r => cv.toBlob(r, mime, quality));
    const ptW = page.getViewport({ scale: 1 }).width, ptH = page.getViewport({ scale: 1 }).height;
    cv.width = cv.height = 0; // giải phóng bộ nhớ sớm (bản vẽ khổ lớn)
    return { blob, wPx: Math.ceil(vp.width), hPx: Math.ceil(vp.height), ptW, ptH, page };
  }

  async function pageText(page) {
    try {
      const tc = await page.getTextContent();
      const lines = []; let cur = '', lastY = null;
      tc.items.forEach(it => {
        const y = Math.round(it.transform[5]);
        if (lastY !== null && Math.abs(y - lastY) > 2) { if (cur.trim()) lines.push(cur.trim()); cur = ''; }
        cur += (cur && !cur.endsWith(' ') ? ' ' : '') + it.str; lastY = y;
      });
      if (cur.trim()) lines.push(cur.trim());
      return lines;
    } catch (_) { return []; }
  }

  // Danh sách ghi chú của khung đang mở.
  function annoRows() {
    const ps = getActivePaneState();
    const rows = [];
    ANNO_MAP.forEach(a => {
      if (a.pane !== S.focus) return;
      rows.push({
        'Trang': a.page || 1,
        'Loại': (window.annoLabel ? annoLabel(a) : a.type),
        'Tác giả': a.author || '',
        'Nội dung': a.text || '',
        'Chủ đề': a.subject || '',
        'Trạng thái': a.status || '',
        'Layer': a.layerName || '',
        'Màu viền': a.stroke || '',
        'Trả lời': (a.replies || []).map(r => (r.author || '') + ': ' + (r.text || '')).join(' | ')
      });
    });
    rows.sort((x, y) => x['Trang'] - y['Trang']);
    return { ps, rows };
  }

  /* ---------- Từng định dạng ---------- */
  async function doFlatPdf(o) {
    const { doc, oc } = await annotatedDoc();
    const out = await PDFLib.PDFDocument.create();
    for (const n of parsePages(o.pages, doc.numPages)) {
      toast('Đang làm phẳng trang ' + n + '/' + doc.numPages + '...');
      const r = await renderPage(doc, oc, n, o.dpi, 'image/jpeg', 0.9);
      const img = await out.embedJpg(await r.blob.arrayBuffer());
      const p = out.addPage([r.ptW, r.ptH]);
      p.drawImage(img, { x: 0, y: 0, width: r.ptW, height: r.ptH });
    }
    saveBlob(new Blob([await out.save()], { type: 'application/pdf' }), baseName() + '-phang.pdf');
  }

  async function doImages(o) {
    const { doc, oc } = await annotatedDoc();
    const pages = parsePages(o.pages, doc.numPages);
    const mime = o.img === 'jpg' ? 'image/jpeg' : 'image/png';
    const ext = o.img === 'jpg' ? 'jpg' : 'png';
    if (pages.length === 1) {
      const r = await renderPage(doc, oc, pages[0], o.dpi, mime, 0.92);
      return saveBlob(r.blob, `${baseName()}-trang-${pages[0]}.${ext}`);
    }
    await loadLib('jszip');
    const zip = new JSZip();
    for (const n of pages) {
      toast('Đang xuất ảnh trang ' + n + '...');
      const r = await renderPage(doc, oc, n, o.dpi, mime, 0.92);
      zip.file(`${baseName()}-trang-${String(n).padStart(3, '0')}.${ext}`, r.blob);
    }
    saveBlob(await zip.generateAsync({ type: 'blob' }), baseName() + '-anh.zip');
  }

  async function doWord(o) {
    await loadLib('jszip');
    const { doc, oc } = await annotatedDoc();
    const zip = new JSZip();
    const rels = [], body = [];
    const para = (t, bold) => `<w:p><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r></w:p>`;
    let i = 0;
    for (const n of parsePages(o.pages, doc.numPages)) {
      toast('Đang dựng Word, trang ' + n + '...');
      i++;
      const r = await renderPage(doc, oc, n, Math.min(o.dpi, 200), 'image/png');
      zip.file(`word/media/trang${i}.png`, r.blob);
      rels.push(`<Relationship Id="rImg${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/trang${i}.png"/>`);
      const cx = 5943600, cy = Math.round(cx * r.hPx / r.wPx); // rộng 6.5 inch
      body.push(para('Trang ' + n, true));
      body.push(`<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${i}" name="Trang ${n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${i}" name="trang${i}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rImg${i}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
      (await pageText(r.page)).forEach(line => body.push(para(line)));
      body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    }
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.join('') + '</Relationships>');
    zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>' + body.join('') + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>');
    saveBlob(await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), baseName() + '.docx');
  }

  async function doExcel(o, commentsOnly) {
    await loadLib('xlsx');
    const wb = XLSX.utils.book_new();
    const { rows } = annoRows();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Trang': '', 'Loại': 'Chưa có ghi chú' }]), 'Ghi chú');
    if (!commentsOnly) {
      const { doc } = await annotatedDoc();
      const lines = [];
      for (const n of parsePages(o.pages, doc.numPages)) {
        (await pageText(await doc.getPage(n))).forEach(t => lines.push({ 'Trang': n, 'Nội dung': t }));
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lines.length ? lines : [{ 'Trang': '', 'Nội dung': 'Trang không có chữ (bản vẽ dạng hình). Dùng OCR để nhận chữ.' }]), 'Chữ theo trang');
    }
    XLSX.writeFile(wb, baseName() + (commentsOnly ? '-ghi-chu' : '') + '.xlsx');
  }

  async function doPpt(o) {
    await loadLib('pptx');
    const { doc, oc } = await annotatedDoc();
    const pres = new PptxGenJS();
    let first = null;
    for (const n of parsePages(o.pages, doc.numPages)) {
      toast('Đang dựng PowerPoint, trang ' + n + '...');
      const r = await renderPage(doc, oc, n, Math.min(o.dpi, 200), 'image/png');
      if (!first) {
        first = r;
        pres.defineLayout({ name: 'PDF', width: 13.333, height: +(13.333 * r.hPx / r.wPx).toFixed(3) });
        pres.layout = 'PDF';
      }
      const data = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(r.blob); });
      const W = 13.333, H = 13.333 * first.hPx / first.wPx;
      const scale = Math.min(W / r.wPx, H / r.hPx);
      const w = r.wPx * scale, h = r.hPx * scale;
      pres.addSlide().addImage({ data, x: (W - w) / 2, y: (H - h) / 2, w, h });
    }
    await pres.writeFile({ fileName: baseName() + '.pptx' });
  }

  // XFDF: ghi chú theo chuẩn Adobe; toạ độ PDF lấy từ kích thước trang gốc.
  async function doXfdf() {
    const ps = getActivePaneState();
    const doc = PDF_STATE.doc || (ps && ps.doc);
    if (!ps || !ps.isPdfReal) throw new Error('Chưa mở tài liệu.');
    const pdfDoc = await PDFLib.PDFDocument.load(ps.bytes.slice ? ps.bytes.slice(0) : ps.bytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    const hex = c => (/^#[0-9a-f]{6}$/i.test(c || '') ? c.toUpperCase() : '#FF0000');
    const out = [];
    const now = d => { const t = d ? new Date(d) : new Date(); const p = x => String(x).padStart(2, '0'); return `D:${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}`; };
    ANNO_MAP.forEach(a => {
      if (a.pane !== S.focus) return;
      const pn = Math.max(1, Math.min(pages.length, a.page || 1));
      const { width: W, height: H } = pages[pn - 1].getSize();
      const [x1, y1] = pctPtToPdfUser(ps, pn, a.x, a.y, W, H);
      const [x2, y2] = pctPtToPdfUser(ps, pn, a.x + a.w, a.y + a.h, W, H);
      const rect = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)].map(v => v.toFixed(2)).join(',');
      const common = `page="${pn - 1}" rect="${rect}" color="${hex(a.stroke)}" title="${xmlEsc(a.author || '')}" subject="${xmlEsc(window.annoLabel ? annoLabel(a) : a.type)}" date="${now(a.updatedAt)}" name="${xmlEsc(a.id)}" width="${a.borderWidth != null ? a.borderWidth : 1}"`;
      const contents = a.text ? `<contents>${xmlEsc(a.text)}</contents>` : '';
      const fill = !a.noFill && /^#[0-9a-f]{6}$/i.test(a.fill || '') ? ` interior-color="${a.fill.toUpperCase()}"` : '';
      const pts = arr => (arr || []).map(([px, py]) => pctPtToPdfUser(ps, pn, px, py, W, H).map(v => v.toFixed(2)).join(',')).join(';');
      switch (a.type) {
        case 'oval': out.push(`<circle ${common}${fill}>${contents}</circle>`); break;
        case 'text': case 'callout': out.push(`<freetext ${common}${a.textKind === 'typewriter' ? ' intent="FreeTextTypewriter"' : a.type === 'callout' ? ' intent="FreeTextCallout"' : ''}>${contents}<defaultappearance>/Helv ${a.fontSize || 12} Tf</defaultappearance></freetext>`); break;
        case 'note': out.push(`<text ${common}>${contents}</text>`); break;
        case 'line': case 'arrow': {
          const s1 = pctPtToPdfUser(ps, pn, a.x1 != null ? a.x1 : a.x, a.y1 != null ? a.y1 : a.y, W, H), s2 = pctPtToPdfUser(ps, pn, a.x2 != null ? a.x2 : a.x + a.w, a.y2 != null ? a.y2 : a.y + a.h, W, H);
          out.push(`<line ${common} start="${s1[0].toFixed(2)},${s1[1].toFixed(2)}" end="${s2[0].toFixed(2)},${s2[1].toFixed(2)}"${a.type === 'arrow' ? ' tail="OpenArrow"' : ''}>${contents}</line>`); break;
        }
        case 'poly': if (a.points) { out.push(`<polygon ${common}${fill}><vertices>${pts(a.points)}</vertices>${contents}</polygon>`); break; } // nếu không có điểm thì như hình chữ nhật
        // falls through
        case 'polyline': if (a.type === 'polyline' && a.points) { out.push(`<polyline ${common}><vertices>${pts(a.points)}</vertices>${contents}</polyline>`); break; }
        // falls through
        case 'stamp': if (a.type === 'stamp') { out.push(`<stamp ${common} icon="Draft">${contents}</stamp>`); break; }
        // falls through
        default: out.push(`<square ${common}${fill}${a.type === 'cloud' || String(a.borderStyle).startsWith('cloud') ? ' style="cloudy" intensity="1"' : ''}>${contents}</square>`);
      }
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">\n<f href="${xmlEsc((ps.name || 'tai-lieu.pdf'))}"/>\n<annots>\n${out.join('\n')}\n</annots>\n</xfdf>\n`;
    saveBlob(new Blob([xml], { type: 'application/vnd.adobe.xfdf' }), baseName() + '.xfdf');
  }

  /* ---------- Hộp chọn ---------- */
  function openExportDialog(fmtId) {
    const ps = getActivePaneState();
    if (!ps || !ps.isPdfReal) return toast('Vui lòng mở một file PDF trước khi xuất');
    document.getElementById('veilExportX')?.remove();
    const veil = document.createElement('div');
    veil.className = 'veil'; veil.id = 'veilExportX';
    veil.innerHTML = `<div class="dlg" role="dialog" aria-label="Xuất tài liệu" style="width:min(460px,100%)">
      <h2>Xuất tài liệu</h2>
      <label style="display:block;margin-bottom:8px"><b>Định dạng</b><select class="field" id="exFmt" style="width:100%"></select></label>
      <label style="display:block;margin-bottom:8px"><b>Trang</b> <small style="color:var(--muted)">(để trống = tất cả; ví dụ 1-3,5)</small><input class="field" id="exPages" style="width:100%" placeholder="Tất cả ${ps.numPages || ''} trang"></label>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <label style="flex:1"><b>Độ phân giải</b><select class="field" id="exDpi" style="width:100%"><option value="96">96 dpi (nhẹ)</option><option value="150" selected>150 dpi</option><option value="200">200 dpi</option><option value="300">300 dpi (in ấn)</option></select></label>
        <label style="flex:1" id="exImgWrap"><b>Kiểu ảnh</b><select class="field" id="exImg" style="width:100%"><option value="png">PNG (nét)</option><option value="jpg">JPEG (nhẹ)</option></select></label>
      </div>
      <p style="font-size:11.5px;color:var(--muted);margin:0 0 10px">Ghi chú đang có sẽ được in vào kết quả. Layer CAD đang ẩn sẽ không xuất hiện.</p>
      <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn ghost" id="exCancel">Huỷ</button><button class="btn primary" id="exGo">Xuất</button></div>
    </div>`;
    document.querySelector('.app').append(veil);
    const sel = veil.querySelector('#exFmt');
    Object.entries(FORMATS).forEach(([k, f]) => { const op = document.createElement('option'); op.value = k; op.textContent = f.label; if (k === fmtId) op.selected = true; sel.append(op); });
    const sync = () => { veil.querySelector('#exImgWrap').style.visibility = sel.value === 'dlimg' ? 'visible' : 'hidden'; };
    sel.onchange = sync; sync();
    const close = () => veil.remove();
    veil.querySelector('#exCancel').onclick = close;
    veil.addEventListener('click', e => { if (e.target === veil) close(); });
    veil.querySelector('#exGo').onclick = async () => {
      const o = { pages: veil.querySelector('#exPages').value, dpi: +veil.querySelector('#exDpi').value, img: veil.querySelector('#exImg').value };
      const f = sel.value;
      close();
      try {
        toast('Đang chuẩn bị ' + FORMATS[f].label + '...');
        if (f === 'dlflat') await doFlatPdf(o);
        else if (f === 'dlimg') await doImages(o);
        else if (f === 'dlword') await doWord(o);
        else if (f === 'dlxls') await doExcel(o, false);
        else if (f === 'dlcmt') await doExcel(o, true);
        else if (f === 'dlppt') await doPpt(o);
        else if (f === 'dlxfdf') await doXfdf();
        toast('Đã xuất xong: ' + FORMATS[f].label);
      } catch (err) {
        console.error('Xuất lỗi:', err);
        toast('Xuất lỗi: ' + err.message);
      }
    };
    requestAnimationFrame(() => veil.classList.add('show'));
  }
  window.openExportDialog = openExportDialog;
})();
