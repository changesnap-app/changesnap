// Apply the signed brand assets after Render copies the numbered source files.
const fs=require('fs'),brandify=require('./37-brand.js');
for(const file of ['index.html','account.html','approve.html','pricing.html','privacy.html','terms.html','refunds.html']){
 const html=fs.readFileSync(file,'utf8');
 fs.writeFileSync(file,brandify(html));
}
for(const [source,target] of [['4-34-logo-192.png','2-31-icon-192.png'],['5-35-logo-512.png','3-31-icon-512.png'],['6-36-logo-favicon.png','favicon.png']])fs.copyFileSync(source,target);
