'use strict';
window.AwmViewer=(()=>{
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let generation=0,pdf=null,loadingTask=null,worker=null,renderTask=null;
 function close(){generation++;renderTask?.cancel();renderTask=null;loadingTask?.destroy().catch(()=>{});loadingTask=null;pdf=null;worker?.terminate();worker=null;$('viewer-body').replaceChildren();$('viewer-controls').replaceChildren();$('viewer').close()}
 $('viewer-close').onclick=close;$('viewer').addEventListener('cancel',e=>{e.preventDefault();close()});
 async function open(blob,name,mime=''){
  close();const run=++generation;$('viewer-title').textContent=name;$('viewer').showModal();$('viewer-body').innerHTML='<div class="loading">Đang đọc tài liệu…</div>';
  try{
   if(blob.size>30*1024*1024)throw Error('Giới hạn đọc trực tiếp là 30 MB.');
   const ext=name.split('.').pop().toLowerCase();
   const signature=new Uint8Array(await blob.slice(0,8).arrayBuffer());if(run!==generation)return;
   if(String.fromCharCode(...signature.slice(0,4))==='%PDF'||mime==='application/pdf'){
    const lib=await import('./vendor/pdf.mjs');lib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',location.href).href;
    const data=await blob.arrayBuffer();if(run!==generation)return;
    const task=lib.getDocument({data,isEvalSupported:false});loadingTask=task;const doc=await task.promise;if(run!==generation){task.destroy().catch(()=>{});return}pdf=doc;let page=1,zoom=1;
    $('viewer-controls').innerHTML='<button id="prev">‹</button><span id="page-num"></span><button id="next-page">›</button><button id="zoom-out">−</button><button id="zoom-in">+</button>';
    async function draw(){renderTask?.cancel();const current=page;const p=await doc.getPage(current);if(run!==generation)return;const base=p.getViewport({scale:1});const viewport=p.getViewport({scale:Math.min((innerWidth-24)/base.width,1.5)*zoom});const canvas=document.createElement('canvas');canvas.width=viewport.width*devicePixelRatio;canvas.height=viewport.height*devicePixelRatio;canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';$('viewer-body').replaceChildren(canvas);$('page-num').textContent=current+' / '+doc.numPages;$('prev').disabled=current===1;$('next-page').disabled=current===doc.numPages;renderTask=p.render({canvasContext:canvas.getContext('2d'),viewport,transform:[devicePixelRatio,0,0,devicePixelRatio,0,0]});try{await renderTask.promise}catch(e){if(e.name!=='RenderingCancelledException')throw e}}
    const redraw=()=>draw().catch(e=>{if(run===generation)$('viewer-body').textContent=e.message});$('prev').onclick=()=>{page=Math.max(1,page-1);redraw()};$('next-page').onclick=()=>{page=Math.min(doc.numPages,page+1);redraw()};$('zoom-in').onclick=()=>{zoom=Math.min(3,zoom+.25);redraw()};$('zoom-out').onclick=()=>{zoom=Math.max(.5,zoom-.25);redraw()};await draw();
   }else if(['xlsx','xls','csv'].includes(ext)||mime.includes('spreadsheet')){
    worker=new Worker('excel-worker.js');const data=await blob.arrayBuffer();if(run!==generation)return;worker.postMessage(data,[data]);
    worker.onmessage=e=>{if(run!==generation)return;if(e.data.error){$('viewer-body').textContent=e.data.error;return}const sheets=e.data.sheets;let selected=0,start=0;
     $('viewer-controls').innerHTML='<select id="sheet-select" aria-label="Chọn sheet">'+sheets.map((s,i)=>`<option value="${i}">${esc(s.name)}</option>`).join('')+'</select><button id="rows-prev">‹</button><span id="rows-info"></span><button id="rows-next">›</button>';
     function draw(){const rows=sheets[selected]?.rows||[];const end=Math.min(rows.length,start+100);$('rows-info').textContent=rows.length?`${start+1}–${end} / ${rows.length}`:'Sheet trống';$('rows-prev').disabled=start===0;$('rows-next').disabled=end>=rows.length;$('viewer-body').innerHTML='<div class="workbook"><table><tbody>'+rows.slice(start,end).map((row,i)=>'<tr><td>'+String(start+i+1)+'</td>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><p class="sheet-note">Giá trị lưu trong tệp. Không chạy macro hoặc tính lại công thức. Mỗi trang tối đa 100 dòng.</p>'}
     $('sheet-select').onchange=e=>{selected=Number(e.target.value);start=0;draw()};$('rows-prev').onclick=()=>{start=Math.max(0,start-100);draw()};$('rows-next').onclick=()=>{start+=100;draw()};draw();worker.terminate();worker=null;
    };worker.onerror=()=>{if(run===generation)$('viewer-body').textContent='Không tải được bộ đọc Excel.'};
   }else if(mime.startsWith('image/')){const image=document.createElement('img');const url=URL.createObjectURL(blob);image.src=url;image.onload=image.onerror=()=>URL.revokeObjectURL(url);$('viewer-body').replaceChildren(image)
   }else if(ext==='dxf'){const text=await blob.text();if(run===generation)AwmCad.render(text,$('viewer-body'),$('viewer-controls'));
   }else if(ext==='dwg'){throw Error('DWG cần bản chuyển đổi PDF hoặc dịch vụ CAD viewer. Nguồn hiện tại chưa có bản chuyển đổi.');
   }else if(ext==='msg'){throw Error('Tệp MSG cần được AD chuyển thành nội dung email. Chưa có bộ chuyển đổi MSG trong nguồn này.');
   }else if(['txt','eml'].includes(ext)){const pre=document.createElement('pre');pre.textContent=await blob.text();if(run===generation)$('viewer-body').replaceChildren(pre)
   }else throw Error('Chưa hỗ trợ định dạng này. Hãy cung cấp bản PDF để xem trong AwM.');
  }catch(e){if(run===generation)$('viewer-body').innerHTML='<div class="message error">'+esc(e.message)+'</div>'}
 }
 async function openOnline(opt){
  close();const run=++generation;
  const name=opt?.name||'Xem tài liệu',id=opt?.id||'',mime=opt?.mime||'';
  const ext=name.split('.').pop().toLowerCase();
  const isSheet=mime.includes('spreadsheet')||['xlsx','xls','csv'].includes(ext);
  const previewUrl=id
    ?(isSheet?`https://docs.google.com/spreadsheets/d/${id}/preview`:`https://drive.google.com/file/d/${id}/preview`)
    :(opt?.url||'');
  const directUrl=opt?.url||(id?(isSheet?`https://docs.google.com/spreadsheets/d/${id}/edit`:`https://drive.google.com/file/d/${id}/view`):previewUrl);
  $('viewer-title').textContent=name;
  $('viewer').showModal();
  $('viewer-controls').innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:8px;"><span class="badge ${isSheet?'online':'priority-low'}" style="font-size:12px;font-weight:600;">${isSheet?'📊 Bảng tính Excel Online':'📑 PDF Hợp đồng Online'}</span><a class="primary" style="display:inline-flex;align-items:center;padding:6px 12px;font-size:12px;font-weight:600;text-decoration:none;border-radius:6px;background:#182b29;color:#fff;" href="${esc(directUrl)}" target="_blank" rel="noopener">Mở ngoài tab mới ↗</a></div>`;
  $('viewer-body').innerHTML=`<div style="position:relative;width:100%;height:calc(100dvh - 120px);background:#fff;border-radius:8px;overflow:hidden;"><iframe src="${esc(previewUrl)}" style="width:100%;height:100%;border:0;display:block;" allow="autoplay" loading="lazy"></iframe></div>`;
 }
 return {open,openOnline,close};
})();
