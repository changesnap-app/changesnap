const $=id=>document.getElementById(id),money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);
const token=location.pathname.split('/').pop();
fetch('/api/invoices/view/'+encodeURIComponent(token)).then(async r=>{let d=await r.json();if(!r.ok)throw Error(d.error||'Invoice unavailable');return d}).then(d=>{
 for(let k of ['invoiceNumber','project','business','contact','customer','scope','terms','note'])$(k).textContent=d[k]||'';
 $('issued').textContent=new Date(d.issuedAt).toLocaleDateString();$('due').textContent=d.dueDate||d.terms||'Contact contractor';$('estimate').textContent='Version '+d.estimateVersion+' · signed '+new Date(d.acceptedAt).toLocaleDateString();
 $('labor').textContent=money(d.labor);$('materials').textContent=money(d.materials);$('taxRate').textContent=d.tax||'0';$('tax').textContent=money((+d.labor + +d.materials)*(+d.tax/100));$('total').textContent=money((+d.labor + +d.materials)*(1+(+d.tax/100)));
 $('received').textContent=money((d.paymentSummary?.receivedCents||0)/100);$('balance').textContent=money((d.paymentSummary?.balanceCents??Math.round((+d.labor + +d.materials)*(1+(+d.tax/100))*100))/100);$('receiptBasis').textContent='Contractor recorded: '+(d.paymentSummary?.status||'unpaid')+'. These records are not verified by ChangeSnap.';
 $('noteWrap').hidden=!d.note;let link='';try{let u=new URL(d.paymentUrl);if(u.protocol==='https:'&&u.hostname.includes('.')&&!u.username&&!u.password)link=u.href}catch{}$('paymentWrap').hidden=!link;if(link)$('paymentLink').href=link;$('details').hidden=false;
}).catch(e=>{$('invoiceNumber').textContent='Unavailable';$('error').textContent=e.message});
$('printBtn').onclick=()=>window.print();
