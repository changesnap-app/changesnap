// Build-time patch: adds the visit counter, robots.txt, sitemap.xml and template page routes to server.js. Skips safely if an anchor changed.
const fs=require('fs');
let s=fs.readFileSync('server.js','utf8');
function once(a,b){const p=s.split(a);if(p.length===2)s=p.join(b);else console.log('70-patch skipped:',a.slice(0,50))}
once("const localizedLanding=require('./30-languages.js');","const localizedLanding=require('./30-languages.js');const visitsHook=require('./70-visits.js');");
once("let url=new URL(req.url,'http://local');","let url=new URL(req.url,'http://local');try{visitsHook(req,url,()=>db,save)}catch(e){}if(url.pathname==='/robots.txt'){res.writeHead(200,{'content-type':'text/plain'});return res.end(fs.readFileSync(path.join(ROOT,'robots.txt')))}if(url.pathname==='/sitemap.xml'){res.writeHead(200,{'content-type':'application/xml'});return res.end(fs.readFileSync(path.join(ROOT,'sitemap.xml')))}if(['/change-order-template','/estimate-template','/invoice-template','/markup-calculator','/punch-list-template'].includes(url.pathname))return serve(res,url.pathname.slice(1)+'.html');");
fs.writeFileSync('server.js',s);
// Count the extra tool pages in the visit counter.
try{let v=fs.readFileSync('70-visits.js','utf8');v=v.replace('\\/estimate-template|','\\/estimate-template|\\/invoice-template|\\/markup-calculator|\\/punch-list-template|');fs.writeFileSync('70-visits.js',v)}catch(e){console.log('visits patch skipped')}

// Add the free directory listing badge to the landing page only.
{
 const file='index.html';
 let html=fs.readFileSync(file,'utf8');
 if(!html.includes('https://launchbuff.com/products/jobneatly-gqqt8k')){
  const badge='<div style="text-align:center;padding:16px;background:#f7f8f2"><a href="https://launchbuff.com/products/jobneatly-gqqt8k" target="_blank" rel="noopener noreferrer" title="Featured on LaunchBuff"><img src="https://launchbuff.com/badge-featured-light.svg" alt="Featured on LaunchBuff" width="128" height="40" style="display:inline-block;width:128px;height:40px" /></a></div>';
  if(!html.includes('</body>'))throw Error('Landing page body anchor missing');
  fs.writeFileSync(file,html.replace('</body>',badge+'</body>'));
 }
}
