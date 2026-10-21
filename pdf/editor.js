/* Shared AwD/AwM PDF annotations. Source bytes never leave the browser. */
'use strict';
 window.PdfEditor = (() => {
  const scriptSrc = (typeof document !== 'undefined' && (document.currentScript?.src || document.querySelector?.('script[src*="pdf/editor.js"]')?.src)) || (typeof location !== 'undefined' ? new URL('pdf/', location.href).href : '/pdf/');
  const root = new URL('./', scriptSrc);
  let active = null;
 const loadLib = () => window.PDFLib ? Promise.resolve() : new Promise((resolve,reject) => {
  const s=document.createElement('script');s.src=new URL('pdf-lib.min.js',root);s.onload=resolve;s.onerror=()=>reject(Error('Không tải được bộ xuất PDF.'));document.head.append(s);
 });
 function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 async function mount(blob,name,body,controls){
  active?.destroy();
  const state={dead:false,dirty:false};active=state;
  let task,renderTask,doc,page=1,zoom=1,tool='hand',drawing=null,canvas,overlay,viewport,revision=0,editVersion=0;
  const marks=new Map(),redo=[];
  state.destroy=()=>{state.dead=true;renderTask?.cancel();task?.destroy().catch(()=>{});if(active===state)active=null;};
  body.replaceChildren();controls.replaceChildren();
  const status=document.createElement('span');status.setAttribute('role','status');
  const bar=document.createElement('div');bar.className='pdf-toolbar';controls.append(bar,status);
  function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>Promise.resolve(fn()).catch(e=>status.textContent=e.message);bar.append(b);return b;}
  const prev=button('‹',()=>navigate(-1)),counter=document.createElement('span');bar.append(counter);const next=button('›',()=>navigate(1));
  button('−',()=>{zoom=Math.max(.5,zoom-.25);return draw()});button('+',()=>{zoom=Math.min(4,zoom+.25);return draw()});
  const select=document.createElement('select');select.setAttribute('aria-label','Công cụ ghi chú');
  for(const [value,label] of [['hand','Xem / cuộn'],['text','Chèn chữ'],['line','Đường thẳng'],['pen','Vẽ đường cong'],['rect','Hình chữ nhật']]){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o)}
  bar.append(select);select.onchange=()=>{tool=select.value;if(overlay)overlay.style.touchAction=tool==='hand'?'auto':'none';};
  const color=document.createElement('input');color.type='color';color.value='#e11d48';color.setAttribute('aria-label','Màu ghi chú');bar.append(color);
  const size=document.createElement('select');size.setAttribute('aria-label','Cỡ chữ và nét');for(const n of [12,18,24,32]){const o=document.createElement('option');o.value=n;o.textContent=n+' px';size.append(o)}size.value='18';bar.append(size);
  button('Hoàn tác',()=>{const list=marks.get(page)||[];if(list.length){redo.push([page,list.pop()]);changed();paint()}});
  button('Làm lại',()=>{const item=redo.pop();if(item){(marks.get(item[0])||marks.set(item[0],[]).get(item[0])).push(item[1]);changed();paint()}});
  let prepared=null;
  function changed(){editVersion++;state.dirty=true;prepared=null;status.textContent='Có ghi chú chưa xuất · Không ghi đè bản gốc';}
  async function exportFile(){
   if(prepared)return prepared;
   const version=editVersion;await loadLib();if(state.dead)throw Error('Tài liệu đã đóng.');
   const out=await PDFLib.PDFDocument.load(await blob.arrayBuffer());
   for(const [number,list] of marks){if(!list.length)continue;const p=await doc.getPage(number),v=p.getViewport({scale:2}),c=document.createElement('canvas');c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);paintTo(c,list);const png=await out.embedPng(c.toDataURL('image/png'));const target=out.getPage(number-1);const [x0,y0,x1,y1]=p.view;const rotation=((p.rotate%360)+360)%360;const anchor=rotation===90?[x1,y0]:rotation===180?[x1,y1]:rotation===270?[x0,y1]:[x0,y0];target.drawImage(png,{x:anchor[0],y:anchor[1],width:rotation%180?y1-y0:x1-x0,height:rotation%180?x1-x0:y1-y0,rotate:PDFLib.degrees(rotation)});}
   if(state.dead)throw Error('Tài liệu đã đóng.');
   const bytes=await out.save();if(version!==editVersion)throw Error('Ghi chú vừa thay đổi. Hãy xuất lại bản mới nhất.');
   prepared=new File([bytes],name.replace(/\.pdf$/i,'')+'-ghi-chu.pdf',{type:'application/pdf'});return prepared;
  }
  button('Lưu bản sao',async()=>{status.textContent='Đang tạo PDF…';const f=await exportFile();download(f,f.name);state.dirty=false;status.textContent='Đã tạo bản sao để tải về.'});
  button('Chuẩn bị chia sẻ',async()=>{status.textContent='Đang tạo PDF…';await exportFile();status.textContent='Bản sao sẵn sàng. Nhấn Chia sẻ / Mail.'});
  button('Chia sẻ / Mail',async()=>{if(!prepared){await exportFile();status.textContent='Bản sao sẵn sàng. Nhấn lại Chia sẻ / Mail.';return}if(navigator.canShare?.({files:[prepared]})&&navigator.share){await navigator.share({files:[prepared],title:prepared.name});state.dirty=false;}else{download(prepared,prepared.name);status.textContent='Đã tải bản sao. Đính kèm file vào mail hoặc ứng dụng cần gửi.'}});
  function paintTo(c,list){const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.lineCap='round';ctx.lineJoin='round';for(const m of list){ctx.strokeStyle=ctx.fillStyle=m.color;ctx.lineWidth=c.width*m.size/600/7;const pts=m.points.map(p=>[p[0]*c.width,p[1]*c.height]);if(m.tool==='text'){ctx.font=`${c.width*m.size/600}px Arial`;m.text.split('\n').forEach((s,i)=>ctx.fillText(s,pts[0][0],pts[0][1]+i*c.width*m.size/500));}else if(m.tool==='rect'){ctx.strokeRect(pts[0][0],pts[0][1],pts.at(-1)[0]-pts[0][0],pts.at(-1)[1]-pts[0][1]);}else{ctx.beginPath();ctx.moveTo(...pts[0]);for(const p of (m.tool==='line'?[pts.at(-1)]:pts.slice(1)))ctx.lineTo(...p);ctx.stroke();}}}
  function paint(){if(overlay)paintTo(overlay,[...(marks.get(page)||[]),...(drawing?[drawing]:[])]);}
  function point(e){const r=overlay.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];}
  async function navigate(delta){page=Math.min(doc.numPages,Math.max(1,page+delta));return draw()}
  async function draw(){const run=++revision;drawing=null;renderTask?.cancel();const p=await doc.getPage(page);if(state.dead||run!==revision)return;const base=p.getViewport({scale:1});viewport=p.getViewport({scale:Math.min(Math.max(280,body.clientWidth-24)/base.width,1.6)*zoom});const wrap=document.createElement('div');wrap.className='pdf-page';wrap.style.cssText=`position:relative;width:${viewport.width}px;height:${viewport.height}px;margin:12px auto;background:white;flex-shrink:0`;canvas=document.createElement('canvas');overlay=document.createElement('canvas');for(const c of [canvas,overlay]){c.width=Math.ceil(viewport.width*devicePixelRatio);c.height=Math.ceil(viewport.height*devicePixelRatio);c.style.cssText='position:absolute;inset:0;width:100%;height:100%;max-width:none';wrap.append(c)}overlay.style.touchAction=tool==='hand'?'auto':'none';body.replaceChildren(wrap);counter.textContent=page+' / '+doc.numPages;prev.disabled=page===1;next.disabled=page===doc.numPages;
   overlay.onpointerdown=e=>{if(tool==='hand'||e.button>0)return;const pt=point(e);if(tool==='text'){const text=prompt('Nhập nội dung ghi chú:');if(!text)return;drawing={tool,text,color:color.value,size:Number(size.value),points:[pt]};commit();return}overlay.setPointerCapture(e.pointerId);drawing={tool,color:color.value,size:Number(size.value),points:[pt]};};overlay.onpointermove=e=>{if(!drawing)return;const pt=point(e);if(drawing.tool==='pen')drawing.points.push(pt);else drawing.points[1]=pt;paint()};overlay.onpointerup=()=>{if(drawing){if(drawing.points.length>1)commit();else{drawing=null;paint()}}};overlay.onpointercancel=()=>{drawing=null;paint()};paint();renderTask=p.render({canvasContext:canvas.getContext('2d'),viewport,transform:[devicePixelRatio,0,0,devicePixelRatio,0,0]});try{await renderTask.promise}catch(e){if(e.name!=='RenderingCancelledException')throw e;}
  }
  function commit(){if(!marks.has(page))marks.set(page,[]);marks.get(page).push(drawing);drawing=null;redo.length=0;changed();paint();}
  try{status.textContent='Đang đọc PDF…';const lib=await import(new URL('../mobile/vendor/pdf.mjs',root));if(state.dead)return;lib.GlobalWorkerOptions.workerSrc=new URL('../mobile/vendor/pdf.worker.mjs',root).href;task=lib.getDocument({data:await blob.arrayBuffer(),isEvalSupported:false});doc=await task.promise;if(state.dead)return;status.textContent='Ghi chú trên bản sao · Không ghi đè tài liệu gốc';await draw();}catch(e){if(!state.dead)status.textContent='Không mở được PDF: '+e.message;}
  return state;
 }
 window.addEventListener('beforeunload',e=>{if(active?.dirty){e.preventDefault();e.returnValue='';}});
 return {mount,close:()=>active?.destroy(),hasChanges:()=>!!active?.dirty};
})();
