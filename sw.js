const CACHE_NAME='cine-mongolia-pwa-v5';
const APP_SHELL=['./','./index.html','./styles.css','./database.js','./auth.js','./api.js','./player.js','./app.js','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL))); self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))); self.clients.claim();});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{const copy=res.clone(); if(new URL(req.url).origin===location.origin)caches.open(CACHE_NAME).then(cache=>cache.put(req,copy)); return res;}).catch(()=>caches.match('./index.html'))));
});
self.addEventListener('push',event=>{const data=event.data?.json?.()||{title:'Cine Mongolia',body:'Шинэ мэдэгдэл ирлээ.'}; event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'./icons/icon-192.svg'}));});
