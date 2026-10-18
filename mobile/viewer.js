'use strict';
window.AwmViewer=(()=>{
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let generation=0,pdf=null,loadingTask=null,worker=null,renderTask=null,historyStack=[],currentMsg=null;
 function addFileShare(blob,name){const host=$('viewer-controls');if(!host||host.querySelector('[data-file-share]'))return;const b=document.createElement('button');b.dataset.fileShare='1';b.textContent='↗ Chia sẻ';b.title='Mở bằng ứng dụng khác hoặc gửi đi';b.onclick=async()=>{try{const file=new File([blob],name,{type:blob.type||'application/octet-stream'});if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]})))await navigator.share({files:[file],title:name});else{const u=URL.createObjectURL(blob);await navigator.clipboard?.writeText(u);b.textContent='✓ Đã sao chép';setTimeout(()=>b.textContent='↗ Chia sẻ',1600)}}catch(e){if(e?.name!=='AbortError')window.AwmLive?.notice?.('Không thể chia sẻ tệp')}};host.appendChild(b)}
 function close(clearHist=true,fromPopstate=false){
  generation++;if(clearHist)historyStack=[];currentMsg=null;renderTask?.cancel();renderTask=null;loadingTask?.destroy().catch(()=>{});loadingTask=null;pdf=null;worker?.terminate();worker=null;
  $('viewer-body').replaceChildren();$('viewer-controls').replaceChildren();$('viewer').style.transform='';
  if($('viewer').open)$('viewer').close();
  if(!fromPopstate&&history.state?.awm_modal==='viewer')history.back();
 }
 $('viewer-close').onclick=()=>close(true);$('viewer').addEventListener('cancel',e=>{e.preventDefault();close(true)});
 function goBack(fromPopstate=false){
  if(historyStack.length>0){
   const prev=historyStack.pop();
   if(!fromPopstate&&history.state?.awm_modal==='viewer_att')history.back();
   if(prev.type==='msg')openMsg(prev.data,false);else if(prev.type==='online')openOnline(prev.data,false);
  }else{
   close(true,fromPopstate);
  }
 }
 async function open(blob,name,mime=''){
  close();const run=++generation;$('viewer-title').textContent=name;
  if(history.state?.awm_modal!=='viewer'&&history.state?.awm_modal!=='viewer_att')history.pushState({awm_modal:'viewer'},'');
  $('viewer').showModal();$('viewer-body').innerHTML='<div class="loading">Đang đọc tài liệu…</div>';
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
    const redraw=()=>draw().catch(e=>{if(run===generation)$('viewer-body').textContent=e.message});$('prev').onclick=()=>{page=Math.max(1,page-1);redraw()};$('next-page').onclick=()=>{page=Math.min(doc.numPages,page+1);redraw()};$('zoom-in').onclick=()=>{zoom=Math.min(3,zoom+.25);redraw()};$('zoom-out').onclick=()=>{zoom=Math.max(.5,zoom-.25);redraw()};await draw();addFileShare(blob,name);
   }else if(['xlsx','xls','csv'].includes(ext)||mime.includes('spreadsheet')){
    worker=new Worker('excel-worker.js');const data=await blob.arrayBuffer();if(run!==generation)return;worker.postMessage(data,[data]);
    worker.onmessage=e=>{if(run!==generation)return;if(e.data.error){$('viewer-body').textContent=e.data.error;return}const sheets=e.data.sheets;let selected=0,start=0;
     $('viewer-controls').innerHTML='<select id="sheet-select" aria-label="Chọn sheet">'+sheets.map((s,i)=>`<option value="${i}">${esc(s.name)}</option>`).join('')+'</select><button id="rows-prev">‹</button><span id="rows-info"></span><button id="rows-next">›</button>';
     function draw(){const rows=sheets[selected]?.rows||[];const end=Math.min(rows.length,start+100);$('rows-info').textContent=rows.length?`${start+1}–${end} / ${rows.length}`:'Sheet trống';$('rows-prev').disabled=start===0;$('rows-next').disabled=end>=rows.length;$('viewer-body').innerHTML='<div class="workbook"><table><tbody>'+rows.slice(start,end).map((row,i)=>'<tr><td>'+String(start+i+1)+'</td>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><p class="sheet-note">Giá trị lưu trong tệp. Không chạy macro hoặc tính lại công thức. Mỗi trang tối đa 100 dòng.</p>'}
     $('sheet-select').onchange=e=>{selected=Number(e.target.value);start=0;draw()};$('rows-prev').onclick=()=>{start=Math.max(0,start-100);draw()};$('rows-next').onclick=()=>{start+=100;draw()};draw();worker.terminate();worker=null;
    };worker.onerror=()=>{if(run===generation)$('viewer-body').textContent='Không tải được bộ đọc Excel.'};addFileShare(blob,name);
   }else if(mime.startsWith('image/')){const image=document.createElement('img');const url=URL.createObjectURL(blob);image.src=url;image.onload=image.onerror=()=>URL.revokeObjectURL(url);$('viewer-body').replaceChildren(image);addFileShare(blob,name)
   }else if(ext==='dxf'||ext==='dwg'){
    try{
      const text=await blob.text();
      if(text.includes('ENTITIES')||text.includes('SECTION')||text.includes('AutoCAD')){
        if(run===generation)AwmCad.render(text,$('viewer-body'),$('viewer-controls'));
        return;
      }
    }catch(_){}
    if(run===generation){
      if(window.AwmCad && typeof window.AwmCad.renderCadWorkspace === 'function'){
        AwmCad.renderCadWorkspace({name, directUrl:'', mime}, $('viewer-body'), $('viewer-controls'));
      }
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
 function formatInitials(name){
  if(!name)return 'OL';
  const clean=String(name).replace(/<[^>]+>/g,'').replace(/\([^)]*\)/g,'').trim();
  const words=clean.split(/\s+/).filter(Boolean);
  if(words.length>=2) return (words[0][0]+words[words.length-1][0]).toUpperCase();
  return (clean.slice(0,2)||'OL').toUpperCase();
 }
 function formatSize(bytes){
  if(!bytes||isNaN(bytes))return '';
  if(bytes<1024)return bytes+' B';
  if(bytes<1024*1024)return (bytes/1024).toFixed(1)+' KB';
  return (bytes/(1024*1024)).toFixed(1)+' MB';
 }
 function getAttIcon(name){
  const ext=String(name||'').split('.').pop().toLowerCase();
  if(['pdf'].includes(ext))return '📑';
  if(['xlsx','xls','csv'].includes(ext))return '📊';
  if(['docx','doc'].includes(ext))return '📝';
  if(['dwg','dxf'].includes(ext))return '📐';
  if(['msg','eml'].includes(ext))return '✉️';
  if(['zip','rar','7z'].includes(ext))return '📦';
  if(['png','jpg','jpeg','gif'].includes(ext))return '🖼️';
  return '📄';
 }
 function renderMsgView(msg,name,directUrl=''){
  const subject=msg.subject||name.replace(/\.msg$/i,'')||'Thư điện tử';
  const sender=msg.senderName?(msg.senderEmail?`${msg.senderName} <${msg.senderEmail}>`:msg.senderName):(msg.senderEmail||'Cán bộ phát hành / AD');
  const senderInitials=formatInitials(msg.senderName||msg.senderEmail||sender);
  const date=msg.sentDate||'';
  const toRecipients=msg.to||'';
  const ccRecipients=msg.cc||'';
  const bccRecipients=msg.bcc||'';
  const bodyText=msg.body||'';
  const attachments=Array.isArray(msg.attachments)?msg.attachments:[];
  const nestedMessages=Array.isArray(msg.nested_messages)?msg.nested_messages:[];
  const isEncrypted=!!msg.is_encrypted||attachments.some(a=>String(a.name||a||'').toLowerCase().includes('.rpmsg'));

  $('viewer-controls').innerHTML=`
   <div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:6px;padding:4px 0;flex-wrap:wrap;">
     <div style="display:flex;align-items:center;gap:6px;">
       ${historyStack.length>0?`<button id="viewer-msg-back" class="button" style="padding:6px 12px;font-size:12px;background:#0f2c59;color:#fff;border-radius:6px;font-weight:700;display:inline-flex;align-items:center;gap:4px;cursor:pointer;border:none;">← Quay lại</button>`:''}
       <span class="badge online" style="font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:5px;background:#0078d4;color:#fff;padding:4px 8px;border-radius:6px;">
         ✉️ Outlook Classic
       </span>
     </div>
     <div style="display:flex;gap:6px;align-items:center;">
       ${directUrl?`<a class="primary button" style="padding:6px 12px;font-size:12px;font-weight:600;text-decoration:none;border-radius:6px;background:#182b29;color:#fff;display:inline-flex;align-items:center;gap:4px;" href="${esc(directUrl)}" target="_blank" rel="noopener">Mở Drive ↗</a>`:''}
     </div>
   </div>
  `;
  const msgBackBtn = $('viewer-msg-back');
  if(msgBackBtn) msgBackBtn.onclick = goBack;

  $('viewer-body').innerHTML=`
   <div class="outlook-mail-card" style="padding:16px;background:#fff;border-radius:10px;margin:10px 4px;border:1px solid #d0d7de;box-shadow:0 2px 8px rgba(0,0,0,0.06);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
     ${isEncrypted?`
       <div style="background:#fffbeb;border:1px solid #fcd34d;border-left:4px solid #f59e0b;border-radius:8px;padding:12px 14px;margin-bottom:14px;display:flex;align-items:flex-start;gap:10px;">
         <span style="font-size:22px;line-height:1;flex-shrink:0;">🔒</span>
         <div style="font-size:13px;line-height:1.5;color:#92400e;">
           <strong style="display:block;margin-bottom:2px;font-size:13.5px;">Thư được bảo vệ quyền truy cập (Microsoft Purview / RMS)</strong>
           Nội dung thư và tài liệu đính kèm đã được mã hóa theo tài khoản Microsoft cơ quan của người nhận.
           ${directUrl?`<div style="margin-top:6px;"><a href="${esc(directUrl)}" target="_blank" rel="noopener" style="color:#0078d4;font-weight:700;text-decoration:underline;">Mở / Tải tệp .msg trên Drive để xác thực tài khoản trong Outlook ↗</a></div>`:''}
         </div>
       </div>
     `:''}
     <h2 style="margin:0 0 14px 0;font-size:17px;line-height:1.4;color:#0f2c59;font-weight:700;word-break:break-word;border-bottom:2px solid #0078d4;padding-bottom:10px;">
       ${esc(subject)}
     </h2>

     <div style="display:flex;gap:12px;margin-bottom:14px;background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0;">
       <div style="width:42px;height:42px;border-radius:50%;background:#0078d4;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;box-shadow:0 2px 4px rgba(0,120,212,0.3);">
         ${esc(senderInitials)}
       </div>
       <div style="flex:1;min-width:0;display:grid;gap:4px;font-size:12.5px;">
         <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px;">
           <strong style="color:#0f172a;font-size:14px;">${esc(sender)}</strong>
           ${date?`<span style="color:#64748b;font-size:11.5px;font-family:Consolas,monospace;">${esc(date)}</span>`:''}
         </div>
         ${toRecipients?`
           <div style="color:#334155;word-break:break-word;line-height:1.4;">
             <span style="color:#64748b;font-weight:600;">Kính gửi (To):</span> ${esc(toRecipients)}
           </div>
         `:''}
         ${ccRecipients?`
           <div style="color:#334155;word-break:break-word;line-height:1.4;">
             <span style="color:#64748b;font-weight:600;">Đồng kính gửi (Cc):</span> ${esc(ccRecipients)}
           </div>
         `:''}
         ${bccRecipients?`
           <div style="color:#334155;word-break:break-word;line-height:1.4;">
             <span style="color:#64748b;font-weight:600;">Bcc:</span> ${esc(bccRecipients)}
           </div>
         `:''}
       </div>
     </div>

     ${attachments.length>0?`
       <div style="margin-bottom:16px;background:#f1f5f9;border-radius:10px;padding:12px;border:1px solid #cbd5e1;">
         <div style="font-size:12px;font-weight:700;color:#0f2c59;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
           <span>📎</span><span>TỆP ĐÍNH KÈM (${attachments.length}):</span>
         </div>
         <div style="display:flex;flex-direction:column;gap:8px;">
           ${attachments.map((att,idx)=>{
             const attName=typeof att==='string'?att:(att.name||'attachment');
             const attSize=typeof att==='object'&&att.size?formatSize(att.size):'';
             const icon=getAttIcon(attName);
             const ext=attName.split('.').pop().toLowerCase();
             const isMsg=typeof att==='object'?(att.is_msg||ext==='msg'):ext==='msg';
             const actionLabel = isMsg ? 'Đọc thư' : ext==='pdf' ? 'Mở PDF' : (ext==='xlsx'||ext==='xls') ? 'Mở Excel' : (ext==='dwg'||ext==='dxf') ? 'Mở CAD' : 'Mở tệp';
             const badgeColor = isMsg ? '#0078d4' : ext==='pdf' ? '#e11d48' : (ext==='xlsx'||ext==='xls') ? '#0F6E56' : (ext==='dwg'||ext==='dxf') ? '#d97706' : '#334155';
             return `
               <div class="outlook-att-chip"
                    onclick="AwmViewer.openAttachment('${esc(attName)}', ${idx})"
                    style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1.5px solid ${badgeColor};border-radius:8px;padding:10px 12px;box-shadow:0 1px 4px rgba(0,0,0,0.06);cursor:pointer;box-sizing:border-box;">
                 <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">
                   <span style="font-size:24px;flex-shrink:0;">${icon}</span>
                   <div style="min-width:0;display:flex;flex-direction:column;">
                     <span style="font-weight:700;color:#0f2c59;font-size:13px;word-break:break-all;line-height:1.35;">${esc(attName)}</span>
                     ${attSize?`<span style="color:#64748b;font-size:11px;margin-top:2px;">Dung lượng: ${esc(attSize)}</span>`:''}
                   </div>
                 </div>
                 <div style="flex-shrink:0;margin-left:10px;">
                   <span style="background:${badgeColor};color:#fff;font-size:12px;padding:6px 12px;border-radius:6px;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;box-shadow:0 1px 3px rgba(0,0,0,0.15);">
                     ${actionLabel} ↗
                   </span>
                 </div>
               </div>
             `;
           }).join('')}
         </div>
       </div>
     `:''}

     <div style="font-size:12px;font-weight:700;color:#0f2c59;text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;gap:4px;">
       <span>📝</span><span>Nội dung thư:</span>
     </div>
     <div class="msg-body" style="font-size:13.5px;line-height:1.65;color:#1e293b;white-space:pre-wrap;word-break:break-word;background:#fafbfa;border:1px solid #e2e8f0;border-radius:8px;padding:14px;max-height:50vh;overflow-y:auto;user-select:text;">
       ${bodyText ? linkify(bodyText) : (isEncrypted ? '<div style="color:#92400e;line-height:1.5;">🔒 <i>Nội dung thư nằm trong tệp đính kèm mã hóa <b>message.rpmsg</b> (bảo vệ bởi Microsoft Purview). Vui lòng mở bằng ứng dụng Outlook có tài khoản được phân quyền để đọc toàn văn.</i></div>' : '<span class="muted">(Thư không có nội dung văn bản)</span>')}
     </div>

     ${nestedMessages.length>0?`
       <div style="margin-top:20px;border-top:2px dashed #0078d4;padding-top:14px;">
         <div style="font-size:13px;font-weight:700;color:#0078d4;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;gap:6px;">
           <span>📩</span><span>Thư đính kèm trong email (${nestedMessages.length} thư):</span>
         </div>
         ${nestedMessages.map((nmsg,idx)=>`
           <div id="nested-msg-${idx}" style="margin-bottom:14px;background:#f8fafc;border:1px solid #cbd5e1;border-left:4px solid #0078d4;border-radius:8px;padding:12px;">
             <div style="font-size:14px;font-weight:700;color:#0f2c59;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
               <span>✉️ ${esc(nmsg.subject||'(Không có tiêu đề)')}</span>
               <button onclick="AwmViewer.openAttachment('${esc(nmsg.subject||'email.msg')}', ${idx})" class="button" style="padding:4px 8px;font-size:11.5px;background:#0078d4;color:#fff;border-radius:6px;border:none;font-weight:600;cursor:pointer;">Đọc riêng thư này ↗</button>
             </div>
             <div style="font-size:11.5px;color:#64748b;display:grid;gap:3px;margin-bottom:10px;background:#fff;padding:8px;border-radius:6px;border:1px solid #e2e8f0;">
               <div><span style="font-weight:600;">Người gửi:</span> <strong style="color:#1e293b;">${esc(nmsg.sender||'')}</strong></div>
               ${nmsg.date?`<div><span style="font-weight:600;">Thời gian:</span> ${esc(nmsg.date)}</div>`:''}
               ${nmsg.to?`<div><span style="font-weight:600;">Kính gửi:</span> ${esc(nmsg.to)}</div>`:''}
             </div>
             <div style="font-size:13px;line-height:1.6;color:#1e293b;white-space:pre-wrap;word-break:break-word;background:#fff;padding:10px;border-radius:6px;border:1px solid #e2e8f0;max-height:40vh;overflow-y:auto;">
               ${linkify(nmsg.body||'(Không có nội dung)')}
             </div>
           </div>
         `).join('')}
       </div>
     `:''}
   </div>
  `;
 }
 function openMsg(opt, clearHist=true){
  if(clearHist)close(true);else{generation++;renderTask?.cancel();renderTask=null;$('viewer-body').replaceChildren();$('viewer-controls').replaceChildren();}
  const run=++generation;
  const name=opt?.name||'Thư điện tử';
  $('viewer-title').textContent=name;
  if(history.state?.awm_modal!=='viewer'&&history.state?.awm_modal!=='viewer_att')history.pushState({awm_modal:'viewer'},'');
  $('viewer').showModal();
  const msg={
   name: name,
   subject:opt?.subject||name.replace(/\.msg$/i,''),
   senderName:opt?.sender||opt?.senderName||'',
   senderEmail:opt?.senderEmail||'',
   to:opt?.to||'',
   cc:opt?.cc||'',
   bcc:opt?.bcc||'',
   sentDate:opt?.date||opt?.sentDate||'',
   body:opt?.body||'',
   attachments:opt?.attachments||[],
   nested_messages:opt?.nested_messages||[],
   url:opt?.url||''
  };
  currentMsg = msg;
  renderMsgView(msg,name,opt?.url||'');
 }
 async function openAttachment(attName, idx){
  if(!attName)return;
  const ext=String(attName).split('.').pop().toLowerCase();
  if(currentMsg){
    historyStack.push({type:'msg', data:{...currentMsg}, name:$('viewer-title').textContent, url:currentMsg.url||''});
    history.pushState({awm_modal:'viewer_att'},'');
  }
  if(ext==='rpmsg'){
    $('viewer-title').textContent = attName;
    $('viewer-controls').innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;width:100%;padding:4px 0;">
        <button id="viewer-att-back" class="button" style="padding:6px 12px;font-size:12px;background:#0f2c59;color:#fff;border-radius:6px;font-weight:700;display:inline-flex;align-items:center;gap:4px;cursor:pointer;border:none;">← Quay lại thư</button>
        <span class="badge priority-normal" style="font-size:12px;font-weight:600;">🔒 Tệp bảo mật RMS</span>
      </div>
    `;
    const backBtn = $('viewer-att-back');
    if(backBtn) backBtn.onclick = goBack;

    $('viewer-body').innerHTML = `
      <div class="card" style="margin:24px 8px;padding:28px 16px;text-align:center;background:#fff;border-radius:12px;border:1px solid #fcd34d;background:#fffbeb;">
        <div style="font-size:48px;margin-bottom:12px;">🔒</div>
        <h3 style="margin:0 0 10px 0;color:#92400e;font-size:16px;word-break:break-all;">${esc(attName)}</h3>
        <div class="badge priority-normal" style="display:inline-block;margin-bottom:14px;font-size:12px;font-weight:600;">Microsoft Purview / RMS Encryption</div>
        <p style="font-size:13px;color:#78350f;line-height:1.6;margin:0 0 20px 0;text-align:left;">
          Tệp <b>${esc(attName)}</b> chứa toàn bộ nội dung và tệp đính kèm được bảo vệ theo chính sách bảo mật nội bộ Vinhomes.<br>
          Hệ thống web không thể giải mã trực tiếp nếu không có chứng chỉ bảo mật của người nhận.<br>
          <b>Hướng dẫn:</b> Tải thư về máy hoặc mở ứng dụng Microsoft Outlook trên máy tính / điện thoại đã đăng nhập tài khoản Vinhomes để giải mã và đọc toàn văn.
        </p>
        ${currentMsg?.url ? `<a class="primary button" style="display:inline-flex;align-items:center;justify-content:center;padding:12px 20px;font-size:13.5px;font-weight:700;text-decoration:none;border-radius:8px;background:#0f2c59;color:#fff;width:100%;box-sizing:border-box;margin-bottom:12px;" href="${esc(currentMsg.url)}" target="_blank" rel="noopener">Mở tệp .msg gốc trên Google Drive ↗</a>` : ''}
        <button id="viewer-rpmsg-back" class="button" style="padding:8px 16px;font-size:13px;background:#fff;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;">← Quay lại xem thư</button>
      </div>
    `;
    const rpmsgBack = $('viewer-rpmsg-back');
    if(rpmsgBack) rpmsgBack.onclick = goBack;
    return;
  }
  if(ext==='msg'){
    const nested=(currentMsg?.nested_messages||[])[idx] ||
                 (currentMsg?.nested_messages||[]).find(n=>n.subject&&attName.toLowerCase().includes(n.subject.toLowerCase()));
    if(nested){
      openMsg({
        name: attName,
        subject: nested.subject,
        sender: nested.sender,
        to: nested.to,
        cc: nested.cc,
        date: nested.date,
        body: nested.body,
        attachments: (nested.attachments||[]).map(a=>typeof a==='string'?{name:a}:a),
        nested_messages: []
      }, false);
      return;
    }
    if(window.AwmLive?.rpc){
      const project = window.AwmLive.getProject ? window.AwmLive.getProject() : 'Vinhomes Đan Phượng';
      try {
        const cleanNoExt = attName.replace(/\.msg$/i, '').trim();
        const msgRes = await window.AwmLive.rpc('awm_get_msg', [project, attName, cleanNoExt]);
        const msgData = (msgRes?.ok && msgRes?.data) ? msgRes.data : (msgRes?.data || msgRes);
        if(msgData && (msgData.subject || msgData.body || msgData.sender)){
          openMsg({
            name: attName,
            subject: msgData.subject || cleanNoExt,
            sender: msgData.sender || 'Cán bộ phát hành / AD',
            senderEmail: msgData.sender_email || '',
            to: msgData.to || '',
            cc: msgData.cc || '',
            bcc: msgData.bcc || '',
            date: msgData.date || '',
            body: msgData.body || '',
            attachments: msgData.attachments || [],
            nested_messages: msgData.nested_messages || [],
            is_encrypted: !!msgData.is_encrypted,
            url: ''
          }, false);
          return;
        }
      } catch(_) {}
    }
    if(window.AwmLive?.openNamedFile){
      await window.AwmLive.openNamedFile(attName);
      return;
    }
  }

  $('viewer-title').textContent = attName;
  $('viewer-controls').innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;width:100%;padding:4px 0;">
      <button id="viewer-att-back" class="button" style="padding:6px 12px;font-size:12px;background:#0f2c59;color:#fff;border-radius:6px;font-weight:700;display:inline-flex;align-items:center;gap:4px;cursor:pointer;border:none;">← Quay lại thư</button>
      <span class="badge online" style="font-size:12px;font-weight:600;">Đang tải tệp đính kèm...</span>
    </div>
  `;
  const backBtn = $('viewer-att-back');
  if(backBtn) backBtn.onclick = goBack;

  $('viewer-body').innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 16px;gap:12px;color:#0f2c59;">
      <div style="font-size:36px;">⏳</div>
      <strong style="font-size:15px;">Đang tìm và mở tệp đính kèm:</strong>
      <span style="font-size:13px;color:#475569;word-break:break-all;text-align:center;">${esc(attName)}</span>
    </div>
  `;

  try {
    const kind = ext==='pdf' ? 'pdf' : (['xlsx','xls','csv'].includes(ext) ? 'excel' : 'all');
    let file = null;
    if(window.AwmLive?.rpc){
      const project = window.AwmLive.getProject ? window.AwmLive.getProject() : 'Vinhomes Đan Phượng';
      const res = await window.AwmLive.rpc('awm_find_file', [project, attName, kind]);
      file = res?.files?.[0];
      if(!file){
        const cleanNoExt = attName.replace(/\.[^/.]+$/, '').trim();
        const res2 = await window.AwmLive.rpc('awm_find_file', [project, cleanNoExt, kind]);
        file = res2?.files?.[0];
      }
    }

    if(file?.id || file?.webViewLink){
      await openOnline({
        id: file.id,
        url: file.webViewLink,
        name: file.name || attName,
        mime: file.mimeType || (ext==='pdf'?'application/pdf':'')
      }, false);
      return;
    }

    const searchUrl = 'https://drive.google.com/drive/search?q=' + encodeURIComponent(attName);
    await openOnline({
      id: '',
      url: searchUrl,
      name: attName,
      mime: ''
    }, false);
  } catch(e) {
    $('viewer-body').innerHTML = `
      <div class="message error" style="margin:20px 8px;padding:16px;">
        <p><strong>Lỗi mở tệp:</strong> ${esc(e.message)}</p>
        <button id="viewer-err-back" class="button" style="margin-top:10px;padding:8px 14px;background:#0f2c59;color:#fff;border-radius:6px;border:none;cursor:pointer;">← Quay lại thư</button>
      </div>
    `;
    const errBack = $('viewer-err-back');
    if(errBack) errBack.onclick = goBack;
  }
 }
 async function openOnline(opt, clearHist=true){
  if(clearHist)close(true);else{generation++;renderTask?.cancel();renderTask=null;$('viewer-body').replaceChildren();$('viewer-controls').replaceChildren();}
  const run=++generation;
  const name=opt?.name||'Xem tài liệu',id=opt?.id||'',mime=opt?.mime||'';
  const ext=name.split('.').pop().toLowerCase();
  const isSheet=mime.includes('spreadsheet')||['xlsx','xls','csv'].includes(ext);
  const isPdf=mime.includes('pdf')||ext==='pdf';
  const isCad=mime.includes('dwg')||mime.includes('dxf')||['dwg','dxf'].includes(ext);
  const previewUrl=id?`https://drive.google.com/file/d/${id}/preview`:(opt?.url||'');
  const isMsg=mime.includes('outlook')||ext==='msg'||ext==='eml';
  const directUrl=opt?.url||(id?(isSheet?`https://docs.google.com/spreadsheets/d/${id}/edit`:`https://drive.google.com/file/d/${id}/view`):previewUrl);
  $('viewer-title').textContent=name;
  if(history.state?.awm_modal!=='viewer'&&history.state?.awm_modal!=='viewer_att')history.pushState({awm_modal:'viewer'},'');
  $('viewer').showModal();
  if(isMsg){
    let subject = opt.subject || opt.row?.noi_dung || name.replace(/\.msg$/i, '').trim();
    let sender = opt.sender || opt.senderName || opt.row?.field_1 || opt.row?.field_3 || '';
    let senderEmail = opt.senderEmail || '';
    let toRecipients = opt.to || '';
    let ccRecipients = opt.cc || '';
    let bccRecipients = opt.bcc || '';
    let date = opt.date || opt.sentDate || opt.row?.ngay_ph || opt.row?.date || '';
    let bodyText = opt.body || opt.row?.field_6 || '';
    let attachments = Array.isArray(opt.attachments) ? opt.attachments : [];
    let nestedMessages = Array.isArray(opt.nested_messages) ? opt.nested_messages : [];
    let isEncrypted = !!opt.is_encrypted;

    if((!bodyText || !sender || !attachments.length) && (window.AwmLive?.rpc || window.AwmViewer?.rpc)){
      $('viewer-body').innerHTML = '<div class="loading" style="padding:48px 16px;text-align:center;color:#0f2c59;">Đang đọc nội dung thư Outlook…</div>';
      const rpcFn = window.AwmLive?.rpc || window.AwmViewer?.rpc;
      const project = window.AwmLive?.getProject ? window.AwmLive.getProject() : (opt.project || 'Vinhomes Đan Phượng');
      const cleanNoExt = name.replace(/\.msg$/i, '').trim();
      try {
        const msgRes = await rpcFn('awm_get_msg', [project, name, opt.row?.noi_dung || cleanNoExt]);
        const msgData = (msgRes?.ok && msgRes?.data) ? msgRes.data : (msgRes?.data || msgRes);
        if(msgData){
          if(msgData.subject) subject = msgData.subject;
          if(msgData.sender) sender = msgData.sender;
          if(msgData.sender_email) senderEmail = msgData.sender_email;
          if(msgData.to) toRecipients = msgData.to;
          if(msgData.cc) ccRecipients = msgData.cc;
          if(msgData.bcc) bccRecipients = msgData.bcc;
          if(msgData.date) date = msgData.date;
          if(msgData.body) bodyText = msgData.body;
          if(Array.isArray(msgData.attachments) && msgData.attachments.length) attachments = msgData.attachments;
          if(Array.isArray(msgData.nested_messages) && msgData.nested_messages.length) nestedMessages = msgData.nested_messages;
          if(msgData.is_encrypted) isEncrypted = true;
        }
      } catch(_) {}
    }

    if(run !== generation) return;

    currentMsg = {
      name,
      subject: subject || name.replace(/\.msg$/i, '') || 'Thư điện tử',
      senderName: sender || 'Cán bộ phát hành / AD',
      senderEmail,
      to: toRecipients,
      cc: ccRecipients,
      bcc: bccRecipients,
      sentDate: date,
      body: bodyText,
      attachments,
      nested_messages: nestedMessages,
      is_encrypted: isEncrypted,
      url: directUrl
    };

    renderMsgView(currentMsg, name, directUrl);
    return;
  }
  const badgeText=isSheet?'📊 Bảng tính Excel':isPdf?'📑 PDF Hợp đồng':isCad?'📐 Bản vẽ CAD':'📄 Tài liệu';
  const badgeCls=isSheet?'online':isCad?'badge-primary':'priority-low';
  const openLabel=isSheet?'Mở bằng Google Sheets ↗':isPdf?'Mở file PDF ↗':isCad?'Mở bản vẽ CAD ↗':'Mở tài liệu ↗';

  $('viewer-controls').innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:6px;padding:4px 0;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:6px;">
        ${historyStack.length>0?`<button id="viewer-online-back" class="button" style="padding:6px 12px;font-size:12px;background:#0f2c59;color:#fff;border-radius:6px;font-weight:700;display:inline-flex;align-items:center;gap:4px;cursor:pointer;border:none;">← Quay lại thư</button>`:''}
        <span class="badge ${badgeCls}" style="font-size:12px;font-weight:600;">${badgeText}</span>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        ${isCad?`<label class="button" style="display:inline-flex;align-items:center;padding:6px 10px;font-size:12px;background:#244438;color:#fff;border-radius:6px;cursor:pointer;">+ Nạp file nền (Xref)<input id="cad-online-bg" type="file" accept=".dxf,.dwg,.txt" hidden></label>`:''}
        <button id="viewer-share" class="button" style="display:inline-flex;align-items:center;padding:6px 10px;font-size:12px;font-weight:600;border-radius:6px;border:1px solid #b8cdb8;background:#fff;color:#28523f;cursor:pointer;">↗ Chia sẻ</button><a class="primary button" style="display:inline-flex;align-items:center;padding:6px 12px;font-size:12px;font-weight:600;text-decoration:none;border-radius:6px;background:#182b29;color:#fff;" href="${esc(directUrl)}" target="_blank" rel="noopener">${openLabel}</a>
      </div>
    </div>
  `;
  const backBtn = $('viewer-online-back');
  if(backBtn) backBtn.onclick = goBack;
  const shareBtn = $('viewer-share');
  if(shareBtn) shareBtn.onclick = async()=>{try{if(navigator.share)await navigator.share({title:name,text:'Tài liệu từ BQLDA',url:directUrl});else{await navigator.clipboard.writeText(directUrl);shareBtn.textContent='✓ Đã sao chép link';setTimeout(()=>shareBtn.textContent='↗ Chia sẻ',1800)}}catch(e){if(e?.name!=='AbortError')window.AwmLive?.notice?.('Không thể chia sẻ tài liệu')}};

  if(isCad){
    if(window.AwmCad && typeof window.AwmCad.renderCadWorkspace === 'function'){
      window.AwmCad.renderCadWorkspace({name, id, url: opt?.url, directUrl, mime}, $('viewer-body'), $('viewer-controls'));
      return;
    }
  }else if(id){
    $('viewer-body').innerHTML=`
      <div style="width:100%;height:calc(85vh - 55px);background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.1);display:flex;flex-direction:column;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;flex-shrink:0;">
          <span>Nếu Google Drive chặn cookie xem trước:</span>
          <a href="${esc(directUrl)}" target="_blank" rel="noopener" style="color:#0078d4;font-weight:700;text-decoration:underline;white-space:nowrap;margin-left:8px;">Mở trực tiếp trên Drive ↗</a>
        </div>
        <iframe src="https://drive.google.com/file/d/${id}/preview" style="width:100%;height:100%;border:none;flex:1;" allow="autoplay" loading="lazy"></iframe>
      </div>
    `;
  }else{
    $('viewer-body').innerHTML=`<div class="card" style="margin:24px 8px;padding:28px 16px;text-align:center;background:#fff;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.06);border:1px solid #e2ebd8;"><div style="font-size:52px;margin-bottom:12px;">${isSheet?'📊':isPdf?'📑':isMsg?'✉️':'📄'}</div><h3 style="margin:0 0 10px 0;font-size:16px;color:#182b29;word-break:break-word;line-height:1.4;">${esc(name)}</h3><div class="badge ${badgeCls}" style="display:inline-block;margin-bottom:16px;font-size:12px;font-weight:600;">${badgeText}</div><p class="muted" style="font-size:13px;line-height:1.5;margin:0 0 20px 0;">${isSheet?'Tệp bảng tính Excel BOQ lưu trữ trên Google Drive dự án.':isPdf?'Tệp PDF hợp đồng lưu trữ trên Google Drive dự án.':isMsg?'Tệp thư điện tử MSG lưu trữ trên Google Drive dự án.':'Tài liệu lưu trữ trên Google Drive dự án.'}</p><a class="primary button" style="display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 24px;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;background:#182b29;color:#fff;width:100%;box-sizing:border-box;" href="${esc(directUrl)}" target="_blank" rel="noopener">${openLabel}</a></div>`;
  }
 }
 let vTouchX=0,vTouchY=0,vTouchT=0,vSwiping=false;
 $('viewer').addEventListener('touchstart',e=>{
  if(e.touches.length!==1)return;
  vTouchX=e.touches[0].clientX;vTouchY=e.touches[0].clientY;vTouchT=Date.now();vSwiping=false;
  $('viewer').style.transition='none';
 },{passive:true});
 $('viewer').addEventListener('touchmove',e=>{
  if(e.touches.length!==1)return;
  const cx=e.touches[0].clientX,cy=e.touches[0].clientY,dx=cx-vTouchX,dy=cy-vTouchY;
  if(dx>15&&dx>Math.abs(dy)*1.2&&vTouchX<120){
   vSwiping=true;$('viewer').style.transform=`translateX(${Math.max(0,dx)}px)`;
  }
 },{passive:true});
 $('viewer').addEventListener('touchend',e=>{
  if(!vSwiping){$('viewer').style.transform='';return;}
  const cx=e.changedTouches[0].clientX,cy=e.changedTouches[0].clientY,dx=cx-vTouchX,dy=cy-vTouchY,dt=Date.now()-vTouchT;
  if((dx>80&&dx>Math.abs(dy))||(dx>40&&dt<300&&dx>Math.abs(dy))){
   $('viewer').style.transition='transform .2s cubic-bezier(.2,.9,.3,1)';$('viewer').style.transform='translateX(100%)';
   setTimeout(()=>{
    $('viewer').style.transform='';$('viewer').style.transition='';
    if(historyStack.length>0)goBack();else close(true);
   },190);
  }else{
   $('viewer').style.transition='transform .2s ease-out';$('viewer').style.transform='';
   setTimeout(()=>{$('viewer').style.transition='';},200);
  }
  vSwiping=false;
 },{passive:true});
 return {open,openOnline,openMsg,openAttachment,goBack,close,hasHistory:()=>historyStack.length>0};
})();


