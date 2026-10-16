/* Select AwM/AwD before either application's authentication UI is loaded.
 * Width is deliberately not a device identity: a narrow PC window stays AwD.
 * ?view=mobile and ?view=desktop are explicit, per-link overrides.
 */
(function(root){
 'use strict';
 function detectPhone(nav){
  const ua=nav.userAgent||'';
  if(/iPad|Tablet|PlayBook|Kindle|Silk/i.test(ua))return false;
  if(/iPhone|iPod|Windows Phone|Android.*Mobile|Mobile.*Android/i.test(ua))return true;
  if(/Windows NT|Macintosh|CrOS|X11/i.test(ua))return false;
  return nav.userAgentData?.mobile===true;
 }
 function targetUrl(href,scriptUrl,nav,storage){
  const current=new URL(href);if(!['http:','https:'].includes(current.protocol))return null;
  const base=new URL('../',scriptUrl),desktop=new URL('index.html',base),mobile=new URL('mobile/',base);
  const isDesktop=[base.pathname,desktop.pathname].includes(current.pathname);
  const isMobile=[mobile.pathname,mobile.pathname+'index.html'].includes(current.pathname);
  if(!isDesktop&&!isMobile)return null;
  let override=current.searchParams.get('view');
  const store=storage||(typeof localStorage!=='undefined'?localStorage:null);
  if(override){
   try{store?.setItem('bqlda_view_mode',override)}catch(_){}
  }else{
   try{override=store?.getItem('bqlda_view_mode')}catch(_){}
  }
  const phone=override==='mobile'?true:override==='desktop'?false:detectPhone(nav);
  if(phone&&isMobile||!phone&&isDesktop)return null;
  const target=phone?mobile:desktop;target.search=current.search;target.hash=current.hash;return target.href;
 }
 if(typeof module==='object'&&module.exports){module.exports={detectPhone,targetUrl};return}
 if(root.pywebview)return;
 const script=document.currentScript;if(!script?.src)return;
 const target=targetUrl(location.href,script.src,navigator,typeof localStorage!=='undefined'?localStorage:null);if(target)location.replace(target);
})(typeof window==='undefined'?{}:window);
