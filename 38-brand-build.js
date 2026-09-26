// Apply the signed brand assets after Render copies the numbered source files.
const fs=require('fs'),brandify=require('./37-brand.js');
for(const file of ['index.html','account.html','approve.html','pricing.html','privacy.html','terms.html','refunds.html','4-cs-privacy.html','6-cs-terms.html','5-cs-refunds.html']){
 const html=fs.readFileSync(file,'utf8');
 fs.writeFileSync(file,brandify(html));
}
for(const [source,target] of [['4-34-logo-192.png','2-31-icon-192.png'],['5-35-logo-512.png','3-31-icon-512.png'],['6-36-logo-favicon.png','favicon.png']])fs.copyFileSync(source,target);
let server=fs.readFileSync('server.js','utf8');
function replaceOnce(oldText,newText){const parts=server.split(oldText);if(parts.length!==2)throw Error('Server branding anchor changed: '+oldText.slice(0,60));server=parts.join(newText)}
replaceOnce("const priceDisplay=require('./2-1-34-local-prices.js');", "const priceDisplay=require('./2-1-34-local-prices.js');\nconst brandify=require('./37-brand.js');");
replaceOnce("if(url.pathname==='/icon-192.png')return serve(res,'2-31-icon-192.png');", "if(url.pathname==='/favicon.png'||url.pathname==='/favicon.ico')return serve(res,'favicon.png');if(url.pathname==='/icon-192.png')return serve(res,'2-31-icon-192.png');");
replaceOnce('return res.end(html)}if(url.pathname.startsWith(\'/approve/\'))', 'return res.end(brandify(html))}if(url.pathname.startsWith(\'/approve/\'))');
fs.writeFileSync('server.js',server);
