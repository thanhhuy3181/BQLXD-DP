'use strict';
module.exports=(_req,res)=>{
 res.setHeader('Cache-Control','no-store');
 return res.status(410).json({ok:false,data:null,error:'Mail chỉ được truy cập qua API có xác thực và thiết bị AD đang kết nối.'});
};
