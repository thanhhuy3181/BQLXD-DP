const http=require('http'),fs=require('fs'),path=require('path');
const root=__dirname,port=Number(process.env.PORT)||8767;
const handlers={'/api/rpc':require('./api/rpc'),'/api/ad_mail':require('./api/ad_mail')};
http.createServer(async(req,res)=>{
 res.status=code=>{res.statusCode=code;return res};res.json=data=>{res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data))};
 if(handlers[req.url?.split('?')[0]]){let body='',tooLarge=false;req.on('data',c=>{body+=c;if(body.length>2500000){tooLarge=true;req.destroy()}});req.on('end',async()=>{if(tooLarge)return;try{req.body=body?JSON.parse(body):{};await handlers[req.url.split('?')[0]](req,res)}catch{res.status(400).json({ok:false,error:'Y├¬u cß║ºu kh├┤ng hß╗úp lß╗ç'})}});return}
 let target;try{target=path.resolve(root,'.'+decodeURIComponent((req.url||'/').split('?')[0]))}catch{res.statusCode=400;res.end();return}
 if(!target.startsWith(root+path.sep)){if(target===root)target=path.join(root,'index.html');else{res.statusCode=403;res.end();return}}
 const relative=path.relative(root,target);if(path.basename(target)==='mail_snapshot.json'||relative.split(path.sep).some(p=>p.startsWith('.'))||relative.startsWith('api'+path.sep)||relative.startsWith('node_modules'+path.sep)||relative.endsWith('.cjs')||relative.endsWith('package.json')||relative.endsWith('pnpm-lock.yaml')){res.statusCode=403;res.end();return}
 if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');if(!fs.existsSync(target)){res.statusCode=404;res.end();return}
 res.setHeader('Content-Type',target.endsWith('.js')||target.endsWith('.mjs')?'text/javascript':target.endsWith('.css')?'text/css':target.endsWith('.html')?'text/html; charset=utf-8':target.endsWith('.png')?'image/png':'application/octet-stream');fs.createReadStream(target).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log(`AwM: http://127.0.0.1:${port}/mobile/ (database env required for authentication)`));
