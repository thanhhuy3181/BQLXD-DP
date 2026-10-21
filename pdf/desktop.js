'use strict';
window.openDesktopPdf=async(name,path,url)=>{
 let dialog=document.getElementById('pdf-dialog');
 if(!dialog){dialog=document.createElement('dialog');dialog.id='pdf-dialog';dialog.className='pdf-dialog';dialog.innerHTML='<header><strong></strong><label>Mở PDF trên máy <input type="file" accept="application/pdf,.pdf"></label><button type="button">Đóng</button></header><div class="pdf-controls"></div><div class="pdf-content"></div>';document.body.append(dialog);dialog.querySelector('header button').onclick=()=>{if(PdfEditor.hasChanges()&&!confirm('Đóng và bỏ ghi chú chưa xuất?'))return;PdfEditor.close();dialog.close()};dialog.addEventListener('cancel',e=>{e.preventDefault();dialog.querySelector('header button').click()});dialog.querySelector('input').onchange=async e=>{const f=e.target.files[0];if(f)await PdfEditor.mount(f,f.name,dialog.querySelector('.pdf-content'),dialog.querySelector('.pdf-controls'))};}
 if(!dialog.open)dialog.showModal();dialog.querySelector('strong').textContent=name;const body=dialog.querySelector('.pdf-content');body.textContent='Đang tải PDF…';
 try{
  const raw=String(url||path||'');const id=raw.startsWith('gdrive://')?raw.split('/').pop():raw.match(/\/file\/d\/([^/]+)/)?.[1];let response;
  if(id){const accounts=DriveEngine.getOAuthAccounts();const sourceAccount=String(path||'').startsWith('gdrive://')?String(path).slice(9).split('/')[0]:null;const account=sourceAccount?accounts.find(a=>a.id===sourceAccount&&DriveEngine.getToken(a.id)):accounts.find(a=>DriveEngine.getToken(a.id));if(!account)throw Error('Hãy kết nối Google Drive trong cài đặt, sau đó mở lại PDF. Bạn cũng có thể chọn PDF đã tải trên máy.');response=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?alt=media',{headers:{Authorization:'Bearer '+DriveEngine.getToken(account.id)}});}
  else{const target=new URL(raw,location.href);if(!['http:','https:'].includes(target.protocol))throw Error('Chọn file PDF trên máy để mở tài liệu này.');response=await fetch(target);}
  if(!response.ok)throw Error('Không tải được PDF hoặc chưa có quyền đọc ('+response.status+').');const blob=await response.blob();if(blob.size>30*1024*1024)throw Error('PDF vượt giới hạn 30 MB.');if(!dialog.open)return;await PdfEditor.mount(blob,name,body,dialog.querySelector('.pdf-controls'));
 }catch(e){body.textContent=e.message;}
};
