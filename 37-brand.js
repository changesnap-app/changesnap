// Render the signed ChangeSnap mark on public pages and use it for browser icons.
function brandify(html){
 const mark='<img class="mark" src="/icon-192.png" width="40" height="40" alt="">';
 const localized='<div class="brand" style="display:flex;align-items:center;gap:10px"><img src="/icon-192.png" width="40" height="40" style="border-radius:12px" alt="">ChangeSnap</div>';
 return html.replace(/<div class="mark">CS<\/div>/g,mark)
  .replace('<div class="brand">ChangeSnap</div>',localized)
  .replace(/<link rel="icon"[^>]*>/g,'')
  .replace('</head>','<link rel="icon" type="image/png" sizes="32x32" href="/favicon.png"><link rel="apple-touch-icon" href="/icon-192.png"></head>');
}
module.exports=brandify;
