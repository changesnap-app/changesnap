// Private job contracts: contractor uploads their own PDF, gets a manual revocable review link,
// customer acknowledges/signs in the browser like estimates. No auto-sends, no legal-sufficiency
// claims, nothing joins the customer portal, photos stay separate. Originals stay authenticated
// at the storage provider; customers only ever see page previews proxied by this server.
const crypto=require('crypto');
const id=p=>p+crypto.randomBytes(12).toString('hex'), token=()=>crypto.randomBytes(32).toString('base64url'), sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const MAX_BYTES=8*1024*1024, MAX_CONTRACTS=25, SHARED_CONTRACT_BYTES=200*1024*1024, PAGE_RESERVE=1048576;
module.exports=({db,save,ledgerFile,isPostgres,storage=require('./64-contract-storage.js')()})=>{
 db.jobContracts ||= [];let pendingBytes=0;const inflight=new Set();
 const reply=(res,n,d)=>{res.writeHead(n,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(d))};
 const readBody=req=>new Promise((ok,no)=>{let s='',length=0;req.on('data',c=>{length+=c.length;if(length>12000000){req.destroy();no(Error('too large'))}else s+=c});req.on('end',()=>{try{ok(JSON.parse(s))}catch{no(Error('invalid'))}});req.on('error',no)});
 const hasJob=(u,jobId)=>db.estimates.some(e=>e.ownerId===u.id&&e.jobId===jobId);
 const jobInfo=(u,jobId)=>{let versions=db.estimates.filter(e=>e.ownerId===u.id&&e.jobId===jobId).sort((a,b)=>a.version-b.version);let latest=versions.at(-1)||{};return {project:latest.project||'',customer:latest.customer||'',business:latest.business||''}};
 const ownerView=c=>{let {ownerId,publicId,assetId,reviewToken,signature,...rest}=c;return {...rest,reviewUrl:c.status==='pending'?'/contract/review/'+c.reviewToken:null}};
 const publicView=c=>{let v={fileName:c.fileName,version:c.version,pages:c.pages,status:c.status,createdAt:c.createdAt,fingerprint:c.sha256.slice(0,16),business:c.business,project:c.project,customer:c.customer};if(c.status==='accepted'){v.acceptedAt=c.acceptedAt;v.signerName=c.signerName;v.signerEmail=c.signerEmail;v.signerPhone=c.signerPhone;v.signature=c.signature;v.recordHash=c.recordHash}return v};
 function scanPdf(bytes){
  if(bytes.length<100||bytes.subarray(0,5).toString('latin1')!=='%PDF-')return 'This file is not a readable PDF';
  const text=bytes.toString('latin1');
  const checks=[[/\/JavaScript[\s\/<>()\[\]]/,'scripting'],[/\/JS[\s\/<>()\[\]]/,'scripting'],[/\/Launch[\s\/<>()\[\]]/,'a launch action'],[/\/OpenAction[\s\/<>()\[\]]/,'an automatic open action'],[/\/AA[\s\/<>()\[\]]/,'automatic actions'],[/\/EmbeddedFile/,'an embedded file'],[/\/RichMedia/,'embedded rich media'],[/\/XFA[\s\/<>()\[\]]/,'an XFA form'],[/\/Encrypt[\s\/<>()\[\]]/,'password protection or encryption']];
  for(const [re,label] of checks)if(re.test(text))return 'This PDF contains '+label+'. For everyone’s safety, upload a flattened PDF (print to PDF or export without scripts, actions and attachments).';
  return null;
 }
 async function gatedDelivery(res,reserveBytes){const today=new Date().toISOString().slice(0,10);db.photoDelivery ||= {day:today,bytes:0};if(db.photoDelivery.day!==today)db.photoDelivery={day:today,bytes:0};if(db.photoDelivery.bytes+reserveBytes>100000000){reply(res,429,{error:'Shared free viewing limit reached today. Try tomorrow; no paid upgrade.'});return false}db.photoDelivery.bytes+=reserveBytes;await save();return true}
 async function sendPage(res,c,page){if(!Number.isSafeInteger(page)||page<1||page>c.pages)return reply(res,404,{error:'Page not found'});if(!(await gatedDelivery(res,PAGE_RESERVE)))return;let jpg;try{jpg=await storage.renderPage(c.publicId,page)}catch{return reply(res,503,{error:'Preview unavailable; try later'})}res.writeHead(200,{'content-type':'image/jpeg','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(jpg)}
 return async(req,res,url,user)=>{
  const path=url.pathname,method=req.method;
  // Public customer review by token
  const pub=path.match(/^\/api\/contracts\/review\/([A-Za-z0-9_-]{30,})(\/page\/(\d+))?$/);
  if(pub){
   const c=db.jobContracts.find(x=>x.reviewToken===pub[1]);
   if(!c)return reply(res,404,{error:'Invalid contract link'});
   if(c.status==='revoked')return reply(res,410,{error:'This review link was revoked by the contractor.'});
   if(method!=='GET'&&!pub[2]&&method!=='POST')return reply(res,405,{error:'Method not allowed'});
   if(pub[2]){if(method!=='GET')return reply(res,405,{error:'Method not allowed'});return sendPage(res,c,Number(pub[3]))}
   if(method==='GET')return reply(res,200,publicView(c));
   // POST: customer accepts/signs
   if(c.status!=='pending')return reply(res,409,{error:'This contract is '+c.status});
   let b;try{b=await readBody(req)}catch{return reply(res,400,{error:'Invalid signing request'})}
   let signerName=String(b.signerName||'').trim().replace(/\s+/g,' '),signerEmail=String(b.signerEmail||'').trim().toLowerCase(),signerPhone=String(b.signerPhone||'').trim();
   if(signerName.length<2||signerName.length>120)return reply(res,400,{error:'Full signer name required'});
   if(signerEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail)||signerEmail.length>200)return reply(res,400,{error:'Valid email required'});
   if(signerPhone&&(!/^[+()\d\s.-]+$/.test(signerPhone)||signerPhone.replace(/\D/g,'').length<7||signerPhone.replace(/\D/g,'').length>15))return reply(res,400,{error:'Valid phone required'});
   if(!signerEmail&&!signerPhone)return reply(res,400,{error:'Email or phone required'});
   if(typeof b.signature!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(b.signature)||b.signature.length<100||b.signature.length>200000||!Buffer.from(b.signature.split(',')[1],'base64').subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return reply(res,400,{error:'Draw your signature'});
   if(c.status!=='pending')return reply(res,409,{error:'This contract is '+c.status});
   const acceptedAt=new Date().toISOString(),snapshot={type:'contract',contractId:c.id,jobId:c.jobId,version:c.version,acceptedAt,signerName,signerEmail,signerPhone,fileName:c.fileName,sha256:c.sha256,bytes:c.bytes,pages:c.pages,business:c.business,customer:c.customer,project:c.project,signature:b.signature};
   const previousHash=db.ledger.at(-1)?.hash||'GENESIS',recordHash=sha(previousHash+JSON.stringify(snapshot)),record={...snapshot,previousHash,hash:recordHash};
   db.ledger.push(record);Object.assign(c,{status:'accepted',acceptedAt,recordHash,signerName,signerEmail,signerPhone,signature:b.signature});
   await save();if(!isPostgres())require('fs').appendFileSync(ledgerFile,JSON.stringify(record)+'\n');
   return reply(res,201,{status:'accepted',acceptedAt,recordHash});
  }
  if(!path.startsWith('/api/job-contracts'))return false;
  if(!user)return reply(res,401,{error:'Sign in'});
  // List contracts for a job
  if(path==='/api/job-contracts'&&method==='GET'){const jobId=url.searchParams.get('jobId');if(!hasJob(user,jobId))return reply(res,404,{error:'Job not found'});return reply(res,200,{configured:storage.ready,contracts:db.jobContracts.filter(c=>c.ownerId===user.id&&c.jobId===jobId).map(ownerView),notice:'Your own PDF, shared by a link you copy yourself. Nothing is sent automatically, and contracts never join the client portal or photos. Signed records keep the document fingerprint and version.'})}
  // Upload a new contract (or revision via /revise)
  const revise=path.match(/^\/api\/job-contracts\/(ctr_[a-z0-9]+)\/revise$/);
  if((path==='/api/job-contracts'&&method==='POST')||(revise&&method==='POST')){
   let prior=null;
   if(revise){prior=db.jobContracts.find(c=>c.id===revise[1]&&c.ownerId===user.id);if(!prior)return reply(res,404,{error:'Contract not found'});if(prior.status!=='pending')return reply(res,409,{error:'Only a pending contract can be replaced'})}
   if(!storage.ready)return reply(res,503,{error:'Contract storage is not connected'});
   let b;try{b=await readBody(req)}catch{return reply(res,400,{error:'Contract upload is too large or invalid'})}
   try{const capacity=await storage.checkCapacity();if(!capacity.allowed)return reply(res,409,{error:'Free storage usage is near its safety limit. Uploads paused; no paid upgrade will happen.'})}catch{return reply(res,503,{error:'Free storage capacity cannot be verified. Try later.'})}
   const jobId=String(b.jobId||'');if(!hasJob(user,jobId))return reply(res,404,{error:'Job not found'});
   const key=b.key;if(typeof key!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(key))return reply(res,400,{error:'Invalid contract details'});
   let dup=db.jobContracts.find(c=>c.ownerId===user.id&&c.key===key);if(dup)return reply(res,200,{contract:ownerView(dup)});
   const lock=user.id+':'+key;if(inflight.has(lock))return reply(res,409,{error:'This upload is already saving. Check the contract list before retrying.'});
   let fileName=String(b.fileName||'contract.pdf').split(/[\\/]/).pop().trim().slice(0,120)||'contract.pdf';if(!/\.pdf$/i.test(fileName))fileName+='.pdf';
   if(typeof b.pdf!=='string'||!/^data:application\/pdf;base64,[a-zA-Z0-9+/=]+$/.test(b.pdf))return reply(res,400,{error:'Choose a PDF file'});
   const bytes=Buffer.from(b.pdf.split(',')[1],'base64');
   if(bytes.length<100||bytes.length>MAX_BYTES)return reply(res,400,{error:'PDF must be no larger than 8 MB'});
   const scanError=scanPdf(bytes);if(scanError)return reply(res,400,{error:scanError});
   const active=db.jobContracts.filter(c=>c.ownerId===user.id&&['pending','accepted'].includes(c.status)).length;
   if(active+Array.from(inflight).filter(k=>k.startsWith(user.id+':')).length>=MAX_CONTRACTS)return reply(res,409,{error:'Your free contract capacity is '+MAX_CONTRACTS+' active contracts. Remove unshared pending contracts before adding more.'});
   const sharedStored=db.jobContracts.reduce((n,c)=>n+c.bytes,0);if(sharedStored+pendingBytes+bytes.length>SHARED_CONTRACT_BYTES)return reply(res,409,{error:'Shared free contract capacity reached. Existing contracts remain available; no paid upgrade will happen automatically.'});
   pendingBytes+=bytes.length;inflight.add(lock);
   const publicId='changesnap-contracts/'+user.id+'/'+crypto.randomBytes(20).toString('hex');let uploadAttempted=false;
   try{
    uploadAttempted=true;const asset=await storage.upload(publicId,bytes);
    const info=jobInfo(user,jobId);
    const c={id:id('ctr_'),ownerId:user.id,jobId,key,fileName,sha256:sha(bytes),reviewToken:token(),version:prior?prior.version+1:1,revisionOf:prior?prior.id:null,status:'pending',createdAt:new Date().toISOString(),business:info.business,customer:info.customer,project:info.project,...asset};
    db.jobContracts.push(c);
    if(prior){prior.status='superseded';prior.supersededAt=c.createdAt}
    try{await save()}catch(e){db.jobContracts=db.jobContracts.filter(x=>x.id!==c.id);if(prior){prior.status='pending';delete prior.supersededAt}throw e}
    return reply(res,201,{contract:ownerView(c)});
   }catch(e){if(uploadAttempted)try{await storage.remove(publicId)}catch{}return reply(res,503,{error:'Contract could not be saved. Refresh the list before retrying. No paid upgrade was made.'})}
   finally{pendingBytes-=bytes.length;inflight.delete(lock)}
  }
  const own=path.match(/^\/api\/job-contracts\/(ctr_[a-z0-9]+)(\/download|\/page\/(\d+)|\/rotate-link|\/revoke)?$/);
  if(!own)return reply(res,404,{error:'Not found'});
  const c=db.jobContracts.find(x=>x.id===own[1]&&x.ownerId===user.id);if(!c)return reply(res,404,{error:'Contract not found'});
  const sub=own[2]||'';
  if(sub===''&&method==='GET')return reply(res,200,{contract:ownerView(c)});
  if(sub.startsWith('/page/')&&method==='GET')return sendPage(res,c,Number(own[3]));
  if(sub==='/download'&&method==='GET'){
   if(!(await gatedDelivery(res,Math.max(1,c.bytes))))return;
   let pdf;try{pdf=await storage.readOriginal(c.publicId,c.sha256,c.bytes)}catch(e){return reply(res,503,{error:e.message==='Stored contract bytes no longer match the recorded fingerprint'?'Stored file failed its fingerprint check. Re-upload the original PDF.':'Download unavailable; try later'})}
   res.writeHead(200,{'content-type':'application/pdf','content-disposition':'attachment; filename="'+c.fileName.replace(/[^a-zA-Z0-9._ -]/g,'_')+'"','cache-control':'no-store','x-content-type-options':'nosniff'});return res.end(pdf)}
  if(sub==='/rotate-link'&&method==='POST'){if(c.status!=='pending')return reply(res,409,{error:'Only a pending contract link can be replaced'});c.reviewToken=token();await save();return reply(res,200,{contract:ownerView(c)})}
  if(sub==='/revoke'&&method==='POST'){if(c.status!=='pending')return reply(res,409,{error:'Only a pending contract can be revoked'});c.status='revoked';c.revokedAt=new Date().toISOString();await save();return reply(res,200,{contract:ownerView(c)})}
  if(sub===''&&method==='DELETE'){
   if(!['pending','revoked'].includes(c.status))return reply(res,409,{error:'Signed and superseded contracts stay on record'});
   try{await storage.remove(c.publicId);const old=db.jobContracts;db.jobContracts=db.jobContracts.filter(x=>x.id!==c.id);try{await save()}catch(e){db.jobContracts=old;throw e}return reply(res,200,{deleted:true})}catch{return reply(res,503,{error:'Deletion not confirmed; contract record kept. Try later.'})}}
  return reply(res,405,{error:'Method not allowed'});
 };
};
