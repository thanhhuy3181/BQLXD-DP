'use strict';
window.AwmDrive=(()=>{
 let token='',expires=0,identity='',generation=0;
 function clear(){generation++;token='';expires=0;identity=''}
 async function request(path,opts={}){
  if(!token||Date.now()>expires){clear();throw Error('Kết nối Drive đã hết hạn. Hãy kết nối lại.')}
  const r=await fetch('https://www.googleapis.com/drive/v3/'+path,{...opts,headers:{Authorization:'Bearer '+token,...opts.headers}});
  if(!r.ok){if(r.status===401)clear();throw Error(r.status===403?'Google Drive từ chối quyền truy cập.':r.status===404?'Tệp/thư mục đã bị xóa hoặc không có quyền.':'Drive không phản hồi ('+r.status+').')}
  return r;
 }
 function connect(email){const run=++generation;return new Promise((resolve,reject)=>{
  if(!window.google?.accounts?.oauth2)return reject(Error('Google chưa tải xong. Thử lại khi có mạng.'));
  const client=google.accounts.oauth2.initTokenClient({client_id:window.BQLDA_WEB_CLIENT_ID,scope:'https://www.googleapis.com/auth/drive.readonly',login_hint:email,callback:async r=>{
   if(run!==generation)return reject(Error('Phiên kết nối đã thay đổi.'));
   if(r.error)return reject(Error(r.error));token=r.access_token;expires=Date.now()+(Number(r.expires_in)-60)*1000;
   try{const info=await(await request('about?fields=user(emailAddress,displayName)')).json();if(run!==generation)throw Error('Phiên kết nối đã thay đổi.');identity=info.user.emailAddress.toLowerCase();if(identity!==email.toLowerCase()){clear();throw Error('Hãy chọn cùng tài khoản Google đang đăng nhập AwM.')}resolve(info.user)}catch(e){if(run===generation)clear();reject(e)}
  },error_callback:e=>reject(Error(e.type==='popup_closed'?'Bạn đã đóng cửa sổ kết nối Drive.':'Không thể mở kết nối Drive.'))});client.requestAccessToken({prompt:'consent'});
 })}
 async function list(folder,pageToken=''){
  const q=`'${folder}' in parents and trashed = false`;
  const params=new URLSearchParams({q,fields:'nextPageToken,files(id,name,mimeType,size,modifiedTime)',pageSize:'50',orderBy:'folder,name',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});if(pageToken)params.set('pageToken',pageToken);
  return (await request('files?'+params)).json();
 }
 async function metadata(id){return(await request('files/'+encodeURIComponent(id)+'?fields=id,name,mimeType,size')).json()}
 async function blob(file){
  if(Number(file.size)>30*1024*1024)throw Error('Tệp lớn hơn 30 MB. Chưa hỗ trợ đọc trực tiếp trên điện thoại.');
  let path='files/'+encodeURIComponent(file.id)+'?alt=media';
  if(file.mimeType==='application/vnd.google-apps.spreadsheet')path='files/'+encodeURIComponent(file.id)+'/export?mimeType='+encodeURIComponent('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  else if(file.mimeType.startsWith('application/vnd.google-apps.'))path='files/'+encodeURIComponent(file.id)+'/export?mimeType=application/pdf';
  const r=await request(path),size=Number(r.headers.get('content-length'));if(size>30*1024*1024)throw Error('Tệp quá lớn để đọc trên điện thoại.');const b=await r.blob();if(b.size>30*1024*1024)throw Error('Tệp quá lớn để đọc trên điện thoại.');return b;
 }
 return {connect,clear,list,metadata,blob,connected:()=>!!token&&Date.now()<expires,identity:()=>identity};
})();
