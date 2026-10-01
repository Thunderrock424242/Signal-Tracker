import type { Plugin } from "vite";
import { createHash } from "node:crypto";

export function offlineShell(): Plugin {
  let base = "/";
  return {
    name: "signal-tracker-offline-shell",
    enforce: "post",
    configResolved(config) {
      base = config.base;
    },
    generateBundle(_options, bundle) {
      const files = [
        "index.html",
        ...Object.keys(bundle).filter(
          (name) => name !== "index.html" && !name.endsWith(".map"),
        ),
      ];
      const version = createHash("sha256")
          .update(files.join("|"))
          .digest("hex")
          .slice(0, 12),
        prefix = "signal-tracker-shell:" + base + "|";
      const urls = files.map((name) => base + name);
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `const CACHE=${JSON.stringify(prefix + version)},PREFIX=${JSON.stringify(prefix)},ASSETS=${JSON.stringify(urls)},HOME=${JSON.stringify(base + "index.html")};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||(!ASSETS.includes(url.pathname)&&event.request.mode!=='navigate'))return;event.respondWith(fetch(event.request).catch(async()=>{const cache=await caches.open(CACHE);return await cache.match(url.pathname,{ignoreVary:true})||(event.request.mode==='navigate'?await cache.match(HOME,{ignoreVary:true}):undefined)||Response.error();}));});`,
      });
    },
  };
}
