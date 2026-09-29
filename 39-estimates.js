const crypto=require('crypto');
const id=p=>p+crypto.randomBytes(12).toString('hex'), token=()=>crypto.randomBytes(32).toString('base64url'), hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const json=(res,n,data)=>{res.writeHead(n,{'content-type':'application/json'});res.end(JSON.stringify(data))};
const body=req=>new Promise((ok,no)=>{let chunks=[],length=0;req.on('data',x=>{length+=x.length;if(length>1e6){req.destroy();no(Error('too large'))}else chunks.push(x)});req.on('end',()=>{try{ok(JSON.parse(Buffer.concat(chunks).toString()||'{}'))}catch(e){no(e)}});req.on('error',no)});
function clean(raw){if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid estimate');let o={};for(const k of ['customer','project','scope','labor','materials','tax','days','terms','business','contact']){let v=raw[k]??'';if(typeof v!=='string'&&typeof v!=='number')throw Error('Invalid '+k);o[k]=String(v).trim();if(o[k].length>(k==='scope'?2000:200))throw Error(k+' is too long')};if(!o.customer||!o.project||!o.scope||!o.business)throw Error('Customer, project, scope and business are required');for(const k of ['labor','materials','tax'])if(o[k]!==''&&(!/^\d+(?:\.\d{1,2})?$/.test(o[k])||+o[k]>1e8))throw Error('Invalid '+k);if(+o.tax>100)throw Error('Tax rate must be at most 100%');return o}
function publicRecord(r){let {ownerId,approvalToken,signature,...data}=r;return data}
function ownerRecord(r){return {...publicRecord(r),reviewUrl:'/estimate/review/'+r.approvalToken}}
function paymentUrl(raw){if(raw==null||raw==='')return ''; if(typeof raw!=='string'||raw.length>500||/[\x00-\x20\x7f]/.test(raw))throw Error('Enter a valid HTTPS payment link (max 500 characters)');let u;try{u=new URL(raw)}catch{throw Error('Enter a valid HTTPS payment link')}if(u.protocol!=='https:'||!u.hostname.includes('.')||u.username||u.password||u.port||/^(localhost|.*\.localhost|.*\.local)$/i.test(u.hostname)||/^\d+(?:\.\d+){3}$/.test(u.hostname))throw Error('Use a public HTTPS payment link with no embedded login');return u.href}
function setup({db,save,ledgerFile,isPostgres}){
 db.estimates ||= []; db.invoices ||= []; db.ledger ||= [];
 async function handle(req,res,url,user){
  const path=url.pathname,method=req.method;
  const invoiceView=path.match(/^\/api\/invoices\/view\/([A-Za-z0-9_-]{30,})$/);
  if(invoiceView){
   if(method!=='GET')return json(res,405,{error:'Method not allowed'});
   let invoice=db.invoices.find(x=>x.publicToken===invoiceView[1]);
   if(!invoice)return json(res,404,{error:'Invalid invoice link'});
   res.setHeader('cache-control','no-store');
   let {ownerId,publicToken,...display}=invoice;
   return json(res,200,display);
  }
  if(path.startsWith('/api/invoices')){
   if(!user)return json(res,401,{error:'Sign in'});
   if(path==='/api/invoices'&&method==='GET')return json(res,200,db.invoices.filter(x=>x.ownerId===user.id).map(x=>{let {ownerId,publicToken,...record}=x;return {...record,viewUrl:'/invoice/view/'+publicToken}}));
   const invoiceUpdate=path.match(/^\/api\/invoices\/(inv_[A-Za-z0-9]+)\/payment-link$/);
   if(invoiceUpdate&&method==='PUT'){let invoice=db.invoices.find(x=>x.id===invoiceUpdate[1]&&x.ownerId===user.id);if(!invoice)return json(res,404,{error:'Invoice not found'});let input=await body(req);try{invoice.paymentUrl=paymentUrl(input.paymentUrl)}catch(e){return json(res,400,{error:e.message})}await save();return json(res,200,{id:invoice.id,paymentUrl:invoice.paymentUrl})}
   if(path==='/api/invoices'&&method==='POST'){
    let b=await body(req),estimate=db.estimates.find(x=>x.id===b.estimateId&&x.ownerId===user.id);
    if(!estimate)return json(res,404,{error:'Estimate not found'});
    if(estimate.status!=='accepted')return json(res,409,{error:'Invoice requires an accepted estimate'});
    if(db.invoices.some(x=>x.estimateId===estimate.id))return json(res,409,{error:'This estimate already has an invoice'});
    let dueDate=String(b.dueDate||'').trim();
    if(dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))return json(res,400,{error:'Invalid due date'});
    if(dueDate&&(!Number.isFinite(Date.parse(dueDate))||new Date(dueDate).toISOString().slice(0,10)!==dueDate))return json(res,400,{error:'Invalid due date'});
    let note=String(b.note||'').trim();if(note.length>500)return json(res,400,{error:'Note is too long'});
    let link;try{link=paymentUrl(b.paymentUrl===undefined?user.paymentUrl:b.paymentUrl)}catch(e){return json(res,400,{error:e.message})}
    let issuedAt=new Date().toISOString(),r={id:id('inv_'),publicToken:token(),ownerId:user.id,invoiceNumber:'CS-'+issuedAt.slice(0,10).replace(/-/g,'')+'-'+crypto.randomBytes(4).toString('hex').toUpperCase(),jobId:estimate.jobId,estimateId:estimate.id,estimateVersion:estimate.version,estimateRecordHash:estimate.recordHash,acceptedAt:estimate.acceptedAt,customer:estimate.customer,project:estimate.project,scope:estimate.scope,labor:estimate.labor,materials:estimate.materials,tax:estimate.tax,terms:estimate.terms,business:estimate.business,contact:estimate.contact,dueDate,note,paymentUrl:link,issuedAt,status:'issued'};
    db.invoices.push(r);await save();return json(res,201,{id:r.id,invoiceNumber:r.invoiceNumber,viewUrl:'/invoice/view/'+r.publicToken});
   }
   return json(res,404,{error:'Not found'});
  }
  const publicMatch=path.match(/^\/api\/estimates\/review\/([A-Za-z0-9_-]{30,})$/);
  if(publicMatch){let r=db.estimates.find(x=>x.approvalToken===publicMatch[1]);if(!r)return json(res,404,{error:'Invalid estimate link'});
   if(method==='GET')return json(res,200,{...publicRecord(r),...(r.status==='accepted'?{signature:r.signature}:{})});
   if(method!=='POST')return json(res,405,{error:'Method not allowed'});
   if(r.status!=='pending')return json(res,409,{error:'This estimate is '+r.status});let b=await body(req);
   let signerName=String(b.signerName||'').trim().replace(/\s+/g,' '),signerEmail=String(b.signerEmail||'').trim().toLowerCase(),signerPhone=String(b.signerPhone||'').trim();
   if(signerName.length<2||signerName.length>120)return json(res,400,{error:'Full signer name required'});
   if(signerEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail)||signerEmail.length>200)return json(res,400,{error:'Valid email required'});
   if(signerPhone&&(!/^[+()\d\s.-]+$/.test(signerPhone)||signerPhone.replace(/\D/g,'').length<7||signerPhone.replace(/\D/g,'').length>15))return json(res,400,{error:'Valid phone required'});
   if(!signerEmail&&!signerPhone)return json(res,400,{error:'Email or phone required'});
   if(typeof b.signature!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(b.signature)||b.signature.length<100||b.signature.length>200000||!Buffer.from(b.signature.split(',')[1],'base64').subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return json(res,400,{error:'Draw your signature'});
   if(r.status!=='pending')return json(res,409,{error:'This estimate is '+r.status});const acceptedAt=new Date().toISOString(),snapshot={type:'estimate',estimateId:r.id,jobId:r.jobId,version:r.version,acceptedAt,signerName,signerEmail,signerPhone,customer:r.customer,project:r.project,scope:r.scope,labor:r.labor,materials:r.materials,tax:r.tax,days:r.days,terms:r.terms,business:r.business,signature:b.signature};
   const previousHash=db.ledger.at(-1)?.hash||'GENESIS',recordHash=hash(previousHash+JSON.stringify(snapshot)),record={...snapshot,previousHash,hash:recordHash};db.ledger.push(record);Object.assign(r,{status:'accepted',acceptedAt,recordHash,signerName,signerEmail,signerPhone,signature:b.signature});await save();if(!isPostgres())require('fs').appendFileSync(ledgerFile,JSON.stringify(record)+'\n');return json(res,201,{status:r.status,acceptedAt,recordHash});
  }
  if(!path.startsWith('/api/estimates'))return false;
  if(!user)return json(res,401,{error:'Sign in'});
  if(path==='/api/estimates'&&method==='GET')return json(res,200,db.estimates.filter(x=>x.ownerId===user.id).map(ownerRecord));
  if(path==='/api/estimates'&&method==='POST'){
   let b=await body(req),fields;try{fields=clean(b)}catch(e){return json(res,400,{error:e.message})}
   const jobId=id('job_'),r={id:id('est_'),approvalToken:token(),ownerId:user.id,jobId,version:1,revisionOf:null,status:'pending',...fields,createdAt:new Date().toISOString()};db.estimates.push(r);await save();return json(res,201,{id:r.id,jobId,version:1,reviewUrl:'/estimate/review/'+r.approvalToken});
  }
  const revise=path.match(/^\/api\/estimates\/([a-z0-9_]+)\/revise$/);
  if(revise&&method==='POST'){
   let old=db.estimates.find(x=>x.id===revise[1]&&x.ownerId===user.id);if(!old)return json(res,404,{error:'Estimate not found'});if(old.status!=='pending')return json(res,409,{error:'Only a pending estimate can be revised'});
   let fields;try{fields=clean(await body(req))}catch(e){return json(res,400,{error:e.message})}
   if(old.status!=='pending')return json(res,409,{error:'Only a pending estimate can be revised'});let next={id:id('est_'),approvalToken:token(),ownerId:user.id,jobId:old.jobId,version:old.version+1,revisionOf:old.id,status:'pending',...fields,createdAt:new Date().toISOString()};old.status='superseded';old.supersededAt=next.createdAt;db.estimates.push(next);await save();return json(res,201,{id:next.id,jobId:next.jobId,version:next.version,reviewUrl:'/estimate/review/'+next.approvalToken});
  }
  if(path==='/api/estimates/jobs'&&method==='GET'){let jobs=[...new Set(db.estimates.filter(x=>x.ownerId===user.id).map(x=>x.jobId))];return json(res,200,jobs.map(jobId=>{let versions=db.estimates.filter(x=>x.ownerId===user.id&&x.jobId===jobId).sort((a,b)=>a.version-b.version),latest=versions.at(-1);return {jobId,customer:latest.customer,project:latest.project,status:latest.status,versions:versions.map(ownerRecord),changes:db.changes.filter(c=>c.ownerId===user.id&&c.jobId===jobId).map(c=>({id:c.id,status:c.status,createdAt:c.createdAt,approvalUrl:'/approve/'+c.approvalToken}))}}))}
  return json(res,404,{error:'Not found'});
 }
 return handle;
}
setup.paymentUrl=paymentUrl;
module.exports=setup;
