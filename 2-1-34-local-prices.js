// Landing-page price display. Actual checkout pricing is resolved by billing country in Dodo.
const markets={
 es:[['ES','EUR','€7.99','€17.99'],['MX','MXN','MX$79','MX$169']],
 pt:[['PT','EUR','€7.99','€17.99'],['BR','BRL','R$19','R$49']],
 fr:'FR',de:'DE',nl:'NL',it:'IT',el:'GR',fi:'FI',hr:'HR',bg:'BG',
 'zh-CN':[['CN','CNY','CN¥29','CN¥79']],ja:[['JP','JPY','¥990','¥2,490']],
 ko:[['KR','KRW','₩6,900','₩19,000']],hi:'IN',mr:'IN',gu:'IN',ta:'IN',te:'IN',
 th:[['TH','THB','฿149','฿349']],id:[['ID','IDR','Rp59,000','Rp129,000']]
};
const india=[['IN','INR','₹299','₹699']];
const euro=c=>[[c,'EUR','€7.99','€17.99']];
const labels={
 es:['Una aprobación','Mensual','País de facturación','Precios'],pt:['Uma aprovação','Mensal','País de faturação','Preços'],
 fr:['Une approbation','Mensuel','Pays de facturation','Tarifs'],de:['Eine Genehmigung','Monatlich','Rechnungsland','Preise'],
 nl:['Eén goedkeuring','Maandelijks','Factureringsland','Prijzen'],it:['Una approvazione','Mensile','Paese di fatturazione','Prezzi'],
 el:['Μία έγκριση','Μηνιαία','Χώρα χρέωσης','Τιμές'],fi:['Yksi hyväksyntä','Kuukausittain','Laskutusmaa','Hinnat'],
 hr:['Jedno odobrenje','Mjesečno','Zemlja naplate','Cijene'],bg:['Едно одобрение','Месечно','Държава на плащане','Цени'],
 'zh-CN':['单次审批','每月','账单国家/地区','价格'],ja:['1件の承認','月額','請求先の国','料金'],
 ko:['승인 1건','월간','청구 국가','가격'],hi:['एक मंज़ूरी','मासिक','बिलिंग देश','मूल्य'],
 mr:['एक मंजुरी','मासिक','बिलिंग देश','किंमत'],gu:['એક મંજૂરી','માસિક','બિલિંગ દેશ','કિંમત'],
 ta:['ஒரு ஒப்புதல்','மாதாந்திரம்','பில்லிங் நாடு','விலை'],te:['ఒక ఆమోదం','నెలవారీ','బిల్లింగ్ దేశం','ధర'],
 th:['อนุมัติหนึ่งรายการ','รายเดือน','ประเทศที่เรียกเก็บเงิน','ราคา'],
 id:['Satu persetujuan','Bulanan','Negara penagihan','Harga']
};
const flags={ES:'🇪🇸',MX:'🇲🇽',PT:'🇵🇹',BR:'🇧🇷',FR:'🇫🇷',DE:'🇩🇪',NL:'🇳🇱',IT:'🇮🇹',GR:'🇬🇷',FI:'🇫🇮',HR:'🇭🇷',BG:'🇧🇬',CN:'🇨🇳',JP:'🇯🇵',KR:'🇰🇷',IN:'🇮🇳',TH:'🇹🇭',ID:'🇮🇩',US:'🇺🇸'};
const css='.price-panel{background:white;border:1px solid #dbe7db;border-radius:16px;max-width:770px;padding:20px 24px;margin:20px 0 0;box-shadow:0 7px 28px #173f3209}.price-panel h2{margin:0 0 12px}.price-head,.price-row{display:grid;grid-template-columns:minmax(100px,1.25fr) repeat(2,minmax(110px,1fr));gap:10px;align-items:center}.price-head{color:#52695c;font-size:13px}.price-row{padding:12px 0;border-top:1px solid #e6ece4}.price-row strong{font-size:18px;white-space:nowrap}.price-row small{font-size:11px;color:#647669;font-weight:500}.price-country{white-space:nowrap}@media(max-width:640px){.price-panel{padding:16px}.price-head,.price-row{grid-template-columns:minmax(75px,1fr) repeat(2,minmax(85px,1fr));gap:6px}.price-head{font-size:11px}.price-row strong{font-size:15px}.price-row small{display:block;font-size:10px}}';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function priceDisplay(html,code){
 if(!html)return html;
 let rows=markets[code]; rows=typeof rows==='string'?(rows==='IN'?india:euro(rows)):(rows||[['US','USD','$9','$19']]);
 const [one,month,country,title]=labels[code]||['One approval','Monthly','Billing country','Prices'];
 const panel=`<section class="price-panel" aria-label="${esc(title)}"><h2>${esc(title)}</h2><div class="price-head"><span>${esc(country)}</span><span>${esc(one)}</span><span>${esc(month)}</span></div>${rows.map(([c,cur,single,monthly])=>`<div class="price-row"><span class="price-country" dir="ltr">${flags[c]} ${c}</span><strong dir="ltr">${esc(single)} <small>${cur}</small></strong><strong dir="ltr">${esc(monthly)} <small>${cur}</small></strong></div>`).join('')}</section>`;
 if(!html.includes('<p class="free">')||!html.includes('</style>'))throw new Error('unexpected localized landing template');
 return html.replace('</style>',css+'</style>').replace(/(<p class="free">.*?<\/p>)/,'$1'+panel);
}
module.exports=priceDisplay;
