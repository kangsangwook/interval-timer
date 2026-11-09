const CACHE='teum-v1';
const ASSETS=['./','./index.html','./style.css','./app.js','./engine.js','./manifest.webmanifest','./icon.svg','./apple-touch-icon.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('teum-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin) return;
  const url=new URL(event.request.url);
  if(!url.href.startsWith(self.registration.scope))return;
  const relative=url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if(!['','index.html','style.css','app.js','engine.js','manifest.webmanifest','icon.svg','apple-touch-icon.png'].includes(relative))return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;}).catch(()=>caches.match(event.request,{ignoreSearch:true})));
});
