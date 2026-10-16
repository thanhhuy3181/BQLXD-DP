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
   }else if(ext==='dxf'||ext==='dwg'){
    try{
      const text=await blob.text();
      if(text.includes('ENTITIES')||text.includes('SECTION')||text.includes('AutoCAD')){
        if(run===generation)AwmCad.render(text,$('viewer-body'),$('viewer-controls'));
        return;
      }
    }catch(_){}
    if(run===generation){
      $('viewer-controls').innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;width:100%;flex-wrap:wrap;"><span class="badge online">📐 Bản vẽ CAD DWG</span><label class="button" style="display:inline-flex;align-items:center;padding:4px 8px;font-size:12px;background:#244438;color:#fff;border-radius:6px;cursor:pointer;">+ Nạp file nền (Xref/DXF)<input id="dwg-bg-loader" type="file" accept=".dxf,.dwg,.txt" hidden></label><a class="primary" style="display:inline-flex;align-items:center;padding:6px 12px;font-size:12px;font-weight:600;text-decoration:none;border-radius:6px;background:#182b29;color:#fff;margin-left:auto;" href="https://viewer.autodesk.com/" target="_blank" rel="noopener">Mở Autodesk CAD Viewer ↗</a></div>`;
      $('viewer-body').innerHTML=`<div class="card" style="padding:16px;background:#182b29;color:#fff;border-radius:10px;margin-bottom:12px;"><div class="top"><span class="badge online">AutoCAD DWG</span><span class="code">${blob.size?Math.ceil(blob.size/1024)+' KB':''}</span></div><h3 style="margin:8px 0 4px 0;color:#d5e6b0;">${esc(name)}</h3><p style="font-size:12px;color:#a8c4b2;margin:0 0 10px 0;">Bản vẽ CAD DWG có hỗ trợ đối chiếu với file nền kiến trúc/hạ tầng. Bạn có thể bấm "+ Nạp file nền (Xref/DXF)" để đọc file nền hoặc mở bản vẽ trực tiếp trên ứng dụng CAD.</p></div><div id="dwg-bg-canvas"></div>`;
      const bgLoader=$('dwg-bg-loader');if(bgLoader)bgLoader.onchange=async e=>{const bgFile=e.target.files[0];if(!bgFile)return;try{const bgText=await bgFile.text();AwmCad.render(bgText,$('dwg-bg-canvas'),$('viewer-controls'));}catch(err){alert('Không đọc được file nền: '+err.message)}};
    }
   }else if(ext==='msg'){
     try{
       const buf=await blob.arrayBuffer();if(run!==generation)return;
       const parsed=parseMsg(buf);
       renderMsgView(parsed, name);
       return;
     }catch(err){
       throw Error('Lỗi giải mã MSG: '+err.message);
     }
    }else if(['txt','eml'].includes(ext)){const pre=document.createElement('pre');pre.textContent=await blob.text();if(run===generation)$('viewer-body').replaceChildren(pre)
    }else throw Error('Chưa hỗ trợ định dạng này. Hãy cung cấp bản PDF để xem trong AwM.');
  }catch(e){if(run===generation)$('viewer-body').innerHTML='<div class="message error">'+esc(e.message)+'</div>'}
 }
 function linkify(text){
   return esc(text||'').replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener" style="color:#1a73e8;text-decoration:underline;word-break:break-all;">$1</a>');
 }
 function parseMsg(arrayBuffer){
   const view=new DataView(arrayBuffer),u8=new Uint8Array(arrayBuffer);
   if(arrayBuffer.byteLength<512)throw Error('Tệp MSG quá ngắn.');
   const magic=[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1];
   for(let i=0;i<8;i++)if(u8[i]!==magic[i])throw Error('Không phải định dạng Outlook MSG (OLE CFBF).');
   const sectorShift=view.getUint16(30,true),miniSectorShift=view.getUint16(32,true);
   const sectorSize=1<<sectorShift,miniSectorSize=1<<miniSectorShift;
   const numFatSectors=view.getUint32(44,true),firstDirSector=view.getUint32(48,true),firstMiniFatSector=view.getUint32(60,true);
   const getOffset=s=>512+s*sectorSize;
   const fat=[],fatSectors=[];
   for(let i=0;i<Math.min(numFatSectors,109);i++){const s=view.getUint32(76+i*4,true);if(s<0xfffffffa)fatSectors.push(s);}
   for(const fs of fatSectors){const off=getOffset(fs);for(let i=0;i<sectorSize/4;i++)fat.push(view.getUint32(off+i*4,true));}
   function readStream(s,size){
     const out=new Uint8Array(size);let cur=s,w=0;
     while(cur<0xfffffffa&&w<size){const off=getOffset(cur),len=Math.min(size-w,sectorSize);out.set(u8.subarray(off,off+len),w);w+=len;cur=fat[cur];}
     return out;
   }
   const dirChunks=[];let ds=firstDirSector,totalDir=0;
   while(ds<0xfffffffa){const off=getOffset(ds);dirChunks.push(u8.subarray(off,off+sectorSize));totalDir+=sectorSize;ds=fat[ds];}
   const dirBuf=new Uint8Array(totalDir);let dPos=0;
   for(const c of dirChunks){dirBuf.set(c,dPos);dPos+=c.byteLength;}
   const dirView=new DataView(dirBuf.buffer,dirBuf.byteOffset,dirBuf.byteLength),numDir=Math.floor(dirBuf.byteLength/128);
   const dirEntries=[],u16=new TextDecoder('utf-16le'),u8dec=new TextDecoder('utf-8');
   for(let i=0;i<numDir;i++){
     const off=i*128,nLen=dirView.getUint16(off+64,true);if(!nLen)continue;
     const name=u16.decode(dirBuf.subarray(off,off+Math.max(0,nLen-2))),sSect=dirView.getUint32(off+116,true),size=Number(dirView.getBigUint64(off+120,true));
     dirEntries.push({id:i,name,startSect:sSect,size});
   }
   const rootEntry=dirEntries[0],miniStream=rootEntry?readStream(rootEntry.startSect,rootEntry.size):new Uint8Array(0);
   const miniFat=[];let mfs=firstMiniFatSector;
   while(mfs<0xfffffffa){const off=getOffset(mfs);for(let i=0;i<sectorSize/4;i++)miniFat.push(view.getUint32(off+i*4,true));mfs=fat[mfs];}
   function readMini(s,size){
     const out=new Uint8Array(size);let cur=s,w=0;
     while(cur<0xfffffffa&&w<size){const off=cur*miniSectorSize,len=Math.min(size-w,miniSectorSize);out.set(miniStream.subarray(off,off+len),w);w+=len;cur=miniFat[cur];}
     return out;
   }
   const getData=e=>e.size<4096?readMini(e.startSect,e.size):readStream(e.startSect,e.size);
   const res={subject:'',senderName:'',senderEmail:'',sentDate:'',body:''};
   for(const e of dirEntries){
     const n=e.name;
     if(n==='__substg1.0_0037001F')res.subject=u16.decode(getData(e)).replace(/\0+$/,'');
     else if(n==='__substg1.0_0037001E')res.subject=res.subject||u8dec.decode(getData(e)).replace(/\0+$/,'');
     else if(n==='__substg1.0_0C1F001F'||n==='__substg1.0_0042001F')res.senderName=u16.decode(getData(e)).replace(/\0+$/,'');
     else if(n==='__substg1.0_5D01001F'||n==='__substg1.0_0065001F'||n==='__substg1.0_39FE001F')res.senderEmail=u16.decode(getData(e)).replace(/\0+$/,'');
     else if(n==='__substg1.0_1000001F')res.body=u16.decode(getData(e)).replace(/\0+$/,'');
     else if(n==='__substg1.0_1000001E')res.body=res.body||u8dec.decode(getData(e)).replace(/\0+$/,'');
   }
   return res;
 }
 function renderMsgView(msg,name,directUrl=''){
   const subject=msg.subject||name.replace(/\.msg$/i,'')||'Thư điện tử';
   const sender=msg.senderName?(msg.senderEmail?`${msg.senderName} <${msg.senderEmail}>`:msg.senderName):(msg.senderEmail||'Cán bộ phát hành / AD');
   const date=msg.sentDate||'';
   const bodyText=msg.body||'';
   $('viewer-controls').innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:8px;padding:4px 0;"><span class="badge online" style="font-size:12px;font-weight:600;">✉️ Thư Outlook MSG</span>${directUrl?`<a class="primary button" style="padding:6px 12px;font-size:12px;font-weight:600;text-decoration:none;border-radius:6px;background:#182b29;color:#fff;" href="${esc(directUrl)}" target="_blank" rel="noopener">Mở Drive ↗</a>`:''}</div>`;
   $('viewer-body').innerHTML=`<div class="card" style="padding:16px;background:#fff;border-radius:10px;margin:10px 4px;border:1px solid #d8e3d5;box-shadow:0 1px 4px rgba(0,0,0,0.05);"><h3 style="margin:0 0 10px 0;font-size:16px;line-height:1.4;color:#182b29;font-weight:700;">${esc(subject)}</h3><div style="background:#f6f8f5;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:13px;display:grid;gap:6px;"><div><span style="color:#666;">Người gửi:</span> <strong style="color:#182b29;">${esc(sender)}</strong></div>${date?`<div><span style="color:#666;">Thời gian:</span> <span style="color:#333;">${esc(date)}</span></div>`:''}</div><div style="font-size:12px;font-weight:700;color:#2c5b3e;text-transform:uppercase;margin-bottom:6px;">Nội dung thư:</div><div class="msg-body" style="font-size:14px;line-height:1.6;color:#1e293b;white-space:pre-wrap;word-break:break-word;background:#fafbfa;border:1px solid #eef2ec;border-radius:8px;padding:12px;max-height:55vh;overflow-y:auto;">${linkify(bodyText)||'<span class="muted">(Thư không có nội dung văn bản)</span>'}</div></div>`;
 }
 function openMsg(opt){
   close();const run=++generation;
   const name=opt?.name||'Thư điện tử';
   $('viewer-title').textContent=name;
   $('viewer').showModal();
   const msg={
     subject:opt?.subject||name.replace(/\.msg$/i,''),
     senderName:opt?.sender||'',
     sentDate:opt?.date||'',
     body:opt?.body||''
   };
   renderMsgView(msg,name,opt?.url||'');
 }
 async function openOnline(opt){
  close();const run=++generation;
  const name=opt?.name||'Xem tài liệu',id=opt?.id||'',mime=opt?.mime||'';
  const ext=name.split('.').pop().toLowerCase();
  const isSheet=mime.includes('spreadsheet')||['xlsx','xls','csv'].includes(ext);
  const isPdf=mime.includes('pdf')||ext==='pdf';
  const isCad=mime.includes('dwg')||mime.includes('dxf')||['dwg','dxf'].includes(ext);
  const previewUrl=id?`https://drive.google.com/file/d/${id}/preview`:(opt?.url||'');
  const isMsg=mime.includes('outlook')||ext==='msg'||ext==='eml';
  const directUrl=opt?.url||(id?(isSheet?`https://docs.google.com/spreadsheets/d/${id}/edit`:`https://drive.google.com/file/d/${id}/view`):previewUrl);
  $('viewer-title').textContent=name;
  $('viewer').showModal();
  if(isMsg&&(opt.body||opt.row||opt.subject)){
    const subject=opt.subject||opt.row?.noi_dung||name.replace(/\.msg$/i,'');
    const sender=opt.sender||opt.row?.field_1||opt.row?.field_3||'Cán bộ phát hành / AD';
    const date=opt.date||opt.row?.ngay_ph||opt.row?.date||'';
    const bodyText=opt.body||opt.row?.field_6||opt.row?.noi_dung||'';
    renderMsgView({subject,senderName:sender,sentDate:date,body:bodyText},name,directUrl);
    return;
  }
  const badgeText=isSheet?'📊 Bảng tính Excel':isPdf?'📑 PDF Hợp đồng':isCad?'📐 Bản vẽ CAD':isMsg?'✉️ Email MSG':'📄 Tài liệu';
  const badgeCls=isSheet?'online':isCad?'badge-primary':isMsg?'priority-normal':'priority-low';
  const openLabel=isSheet?'Mở bằng Google Sheets ↗':isPdf?'Mở file PDF ↗':isCad?'Mở bản vẽ CAD ↗':isMsg?'Mở email MSG ↗':'Mở tài liệu ↗';
  $('viewer-controls').innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:8px;padding:4px 0;flex-wrap:wrap;"><span class="badge ${badgeCls}" style="font-size:12px;font-weight:600;">${badgeText}</span><div style="display:flex;gap:6px;align-items:center;">${isCad?`<label class="button" style="display:inline-flex;align-items:center;padding:6px 10px;font-size:12px;background:#244438;color:#fff;border-radius:6px;cursor:pointer;">+ Nạp file nền (Xref)<input id="cad-online-bg" type="file" accept=".dxf,.dwg,.txt" hidden></label>`:''}<a class="primary button" style="display:inline-flex;align-items:center;padding:8px 14px;font-size:13px;font-weight:600;text-decoration:none;border-radius:6px;background:#182b29;color:#fff;" href="${esc(directUrl)}" target="_blank" rel="noopener">${openLabel}</a></div></div>`;
  if(isCad){
    $('viewer-body').innerHTML=`<div class="card" style="padding:16px;background:#182b29;color:#fff;border-radius:10px;margin-bottom:12px;"><div class="top"><span class="badge online">AutoCAD DWG</span><span class="code">Bản vẽ CAD</span></div><h3 style="margin:8px 0 4px 0;color:#d5e6b0;">${esc(name)}</h3><p style="font-size:12px;color:#a8c4b2;margin:0 0 10px 0;">Bản vẽ CAD hỗ trợ đối chiếu file nền kiến trúc/hạ tầng. Bấm nút "+ Nạp file nền (Xref)" hoặc mở trực tiếp trên Autodesk/Drive.</p><a class="primary button" style="display:inline-flex;align-items:center;padding:8px 14px;font-size:13px;font-weight:600;text-decoration:none;border-radius:6px;background:#244438;color:#fff;" href="${esc(directUrl)}" target="_blank" rel="noopener">${openLabel}</a></div><div id="cad-online-canvas"></div>`;
    const bgInput=$('cad-online-bg');
    if(bgInput){
      bgInput.onchange=async e=>{
        const bgFile=e.target.files[0];
        if(!bgFile)return;
        try{
          const bgText=await bgFile.text();
          AwmCad.render(bgText,$('cad-online-canvas'),$('viewer-controls'));
        }catch(err){alert('Lỗi nạp file nền: '+err.message)}
      };
    }
  }else{
    $('viewer-body').innerHTML=`<div class="card" style="margin:24px 8px;padding:28px 16px;text-align:center;background:#fff;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.06);border:1px solid #e2ebd8;"><div style="font-size:52px;margin-bottom:12px;">${isSheet?'📊':isPdf?'📑':isMsg?'✉️':'📄'}</div><h3 style="margin:0 0 10px 0;font-size:16px;color:#182b29;word-break:break-word;line-height:1.4;">${esc(name)}</h3><div class="badge ${badgeCls}" style="display:inline-block;margin-bottom:16px;font-size:12px;font-weight:600;">${badgeText}</div><p class="muted" style="font-size:13px;line-height:1.5;margin:0 0 20px 0;">${isSheet?'Tệp bảng tính Excel BOQ lưu trữ trên Google Drive dự án.':isPdf?'Tệp PDF hợp đồng lưu trữ trên Google Drive dự án.':isMsg?'Tệp thư điện tử MSG lưu trữ trên Google Drive dự án.':'Tài liệu lưu trữ trên Google Drive dự án.'}</p><a class="primary button" style="display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 24px;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;background:#182b29;color:#fff;width:100%;box-sizing:border-box;" href="${esc(directUrl)}" target="_blank" rel="noopener">${openLabel}</a></div>`;
  }
 }
 return {open,openOnline,openMsg,close};
})();
