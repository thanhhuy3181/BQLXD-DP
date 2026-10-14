'use strict';
window.BrowserMenuRuntime=(()=>{
 const serverMethods=new Set(['get_tracking_workspace','save_tracking_cell','get_settings_categories','save_settings_categories','get_settings_matrix','save_settings_matrix','export_settings_backup','preview_settings_backup','restore_settings_backup','test_ai_connection','get_theme']);
 const ok=data=>({ok:true,data,error:null}),fail=e=>({ok:false,data:null,error:String(e?.message||e)});
 async function rpc(method,args){const headers={'Content-Type':'application/json'},token=localStorage.getItem('bqlda_web_session');if(token)headers.Authorization='Bearer '+token;const response=await fetch('/api/rpc',{method:'POST',headers,body:JSON.stringify({method,args})});return await response.json();}
 function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
 const xml=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
 function workbook(headers,rows){
  const encoder=new TextEncoder();
  const files={
   '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
   '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
   'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Theo dõi" sheetId="1" r:id="rId1"/></sheets></workbook>',
   'xl/_rels/workbook.xml.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
  };
  const col=i=>{let v='';for(i++;i;i=Math.floor((i-1)/26))v=String.fromCharCode(65+(i-1)%26)+v;return v;};
  const content=[headers,...rows].map((row,i)=>`<row r="${i+1}">${row.map((v,j)=>typeof v==='number'&&Number.isFinite(v)?`<c r="${col(j)}${i+1}"><v>${v}</v></c>`:`<c r="${col(j)}${i+1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join('')}</row>`).join('');
  files['xl/worksheets/sheet1.xml']=`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane xSplit="2" ySplit="1" topLeftCell="C2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetData>${content}</sheetData><autoFilter ref="A1:${col(headers.length-1)}${rows.length+1}"/></worksheet>`;
  const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
  const parts=[],central=[];let offset=0;
  for(const[name,text]of Object.entries(files)){const n=encoder.encode(name),bytes=encoder.encode(text),checksum=crc(bytes),local=new Uint8Array(30+n.length),lv=new DataView(local.buffer);lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);lv.setUint32(14,checksum,true);lv.setUint32(18,bytes.length,true);lv.setUint32(22,bytes.length,true);lv.setUint16(26,n.length,true);local.set(n,30);parts.push(local,bytes);const cd=new Uint8Array(46+n.length),cv=new DataView(cd.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint32(16,checksum,true);cv.setUint32(20,bytes.length,true);cv.setUint32(24,bytes.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);cd.set(n,46);central.push(cd);offset+=local.length+bytes.length;}
  const end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,central.length,true);ev.setUint16(10,central.length,true);ev.setUint32(12,central.reduce((n,c)=>n+c.length,0),true);ev.setUint32(16,offset,true);return new Blob([...parts,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 }
 async function call(method,...args){try{
  if(method==='get_tracking_workspace'){let cursor=0,combined=null;do{const r=await rpc(method,[args[0],args[1],cursor]);if(!r.ok)return r;if(!combined)combined={...r.data,items:[]};else if(combined.revision!==r.data.revision)return fail('Bảng vừa thay đổi trong lúc tải; hãy nạp lại.');combined.items.push(...r.data.items);cursor=r.data.next_cursor;}while(cursor!==null);return ok(combined);}
  if(method==='export_tracking_excel'){download(workbook(args[0],args[1]),'Theo-doi.xlsx');return ok({path:'Theo-doi.xlsx',count:args[1].length});}
  if(method==='path_exists'){const p=String(args[0]||'');return ok({exists:/^(https?:|gdrive:|webfolder:|webfile:)/.test(p),path:p});}
  if(method==='preview_settings_backup'){const h=window.__bqldaFileHandles?.get(args[0]);if(!h)return fail('Chọn tệp sao lưu trong trình duyệt');const f=await h.getFile();args=[JSON.parse(await f.text()),f.name];}
  if(method==='test_ai_connection'&&args[0]==='ollama'){const cfg=await window.BrowserRuntime.call('get_app_config_full');if(!cfg.ok)return cfg;const response=await fetch((cfg.data.ollama_url||'http://localhost:11434').replace(/\/$/,'')+'/api/tags',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Ollama từ chối kết nối');const d=await response.json();return ok({provider:'ollama',models:(d.models||[]).map(m=>m.name)});}
  if(serverMethods.has(method)){const result=await rpc(method,args);if(method==='export_settings_backup'&&result.ok){download(new Blob([JSON.stringify(result.data.download,null,2)],{type:'application/json'}),'BoNgua-cai-dat-web.json');return ok({path:'BoNgua-cai-dat-web.json'});}return result;}
  return window.BrowserRuntime.call(method,...args);
 }catch(e){return fail(e);}}
 return {call,workbook};
})();
