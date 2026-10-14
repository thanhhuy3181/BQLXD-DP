importScripts('vendor/xlsx.full.min.js');
self.onmessage=e=>{
 try{const book=XLSX.read(e.data,{type:'array',cellDates:true});const sheets=book.SheetNames.map(name=>({name,rows:XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:'',raw:false})}));self.postMessage({sheets});}
 catch(e){self.postMessage({error:'Không thể đọc workbook: '+e.message});}
};
