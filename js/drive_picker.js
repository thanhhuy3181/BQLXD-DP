'use strict';
const DrivePicker = (() => {
  let target=null, selected=null, generation=0;
  function status(text){document.getElementById('drive-picker-status').textContent=text;}
  async function open(tab){
    target={id:tab.id,name:tab.name,project:tab.project||''};selected=null;generation++;
    document.getElementById('drive-picker-title').textContent='Chọn nguồn online — '+tab.name;
    document.getElementById('drive-picker-add').disabled=true;
    const tree=document.getElementById('drive-picker-tree');tree.replaceChildren();
    document.getElementById('drive-picker-modal').showModal();status('Đang tải tài khoản…');
    const res=await API.call('get_drive_accounts');
    if(!res.ok){status(res.error);return;}
    if(!res.data.length){status('Chưa đăng nhập Drive. Vào Cài đặt → Quản lý Link để thêm tài khoản.');return;}
    status('Mở tài khoản và thư mục, bấm Chọn thư mục rồi Thêm.');
    for(const a of res.data){
      const group=document.createElement('details'),title=document.createElement('summary');
      group.className='p-2 border border-base-300 rounded-lg';title.className='cursor-pointer font-bold';title.textContent='👤 '+(a.email||a.name);group.append(title);
      group.append(node(a.id,{id:'root',name:'Drive của tôi'},true),node(a.id,{id:'shared',name:'Được chia sẻ với tôi'},false));tree.append(group);
      let sharedLoaded=false;
      group.addEventListener('toggle',async()=>{
        if(!group.open||sharedLoaded)return;sharedLoaded=true;
        const shared=await API.call('get_drive_shared_drives',a.id);
        if(shared.ok && Array.isArray(shared.data))for(const d of shared.data)group.append(node(a.id,{id:d.id,name:'Bộ nhớ dùng chung: '+d.name}));
        else if(!shared.ok){const msg=document.createElement('p');msg.className='text-xs';msg.textContent=shared.error;group.append(msg);}
      });
    }
  }
  function node(account,folder,selectable=true){
    const details=document.createElement('details'),summary=document.createElement('summary'),label=document.createElement('span'),children=document.createElement('div');
    details.className='pl-3';summary.className='cursor-pointer py-1';label.textContent='📁 '+folder.name;summary.append(label);
    if(selectable){
      const b=document.createElement('button');b.className='btn btn-xs btn-outline ml-2';b.textContent='Chọn thư mục';
      b.onclick=e=>{e.preventDefault();e.stopPropagation();selected={account,folder};document.getElementById('drive-picker-add').disabled=false;status('Đã chọn: '+folder.name+' → '+target.name);};summary.append(b);
    }
    details.append(summary,children);let loaded=false,busy=false;const version=generation;
    details.addEventListener('toggle',async()=>{
      if(!details.open||loaded||busy)return;busy=true;children.textContent='Đang tải…';
      try{
        const res=await API.call('get_drive_folder_children',account,folder.id,true);
        if(version!==generation)return;if(!res.ok)throw new Error(res.error);
        children.replaceChildren();for(const f of res.data)children.append(node(account,f));
        if(!res.data.length)children.textContent='Không có thư mục con';loaded=true;
      }catch(e){children.textContent=e.message+' — đóng rồi mở lại để thử.';}finally{busy=false;}
    });return details;
  }
  async function add(){
    if(!selected||!target)return;document.getElementById('drive-picker-add').disabled=true;status('Đang thêm nguồn…');
    const res=await API.call('add_explorer_online_source',target.id,selected.account,selected.folder.id,target.project);
    if(!res.ok){status(res.error);document.getElementById('drive-picker-add').disabled=false;return;}
    document.getElementById('drive-picker-modal').close();await ExplorerModule.applyOnlineSource(target.id,res.data);toast('Đã thêm nguồn Drive: '+res.data.name,'success');
  }
  return {open,add};
})();
