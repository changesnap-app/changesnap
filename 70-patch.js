// Build-time patch: adds the visit counter, robots.txt, sitemap.xml and template page routes to server.js. Skips safely if an anchor changed.
const fs=require('fs');
let s=fs.readFileSync('server.js','utf8');
function once(a,b){const p=s.split(a);if(p.length===2)s=p.join(b);else console.log('70-patch skipped:',a.slice(0,50))}
once("const localizedLanding=require('./30-languages.js');","const localizedLanding=require('./30-languages.js');const visitsHook=require('./70-visits.js');");
once("let url=new URL(req.url,'http://local');","let url=new URL(req.url,'http://local');try{visitsHook(req,url,()=>db,save)}catch(e){}if(url.pathname==='/robots.txt'){res.writeHead(200,{'content-type':'text/plain'});return res.end(fs.readFileSync(path.join(ROOT,'robots.txt')))}if(url.pathname==='/sitemap.xml'){res.writeHead(200,{'content-type':'application/xml'});return res.end(fs.readFileSync(path.join(ROOT,'sitemap.xml')))}if(url.pathname==='/change-order-template'||url.pathname==='/estimate-template')return serve(res,url.pathname.slice(1)+'.html');");
fs.writeFileSync('server.js',s);
