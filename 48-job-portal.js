const crypto=require('crypto');
const token=()=>crypto.randomBytes(32).toString('base64url');
const reply=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-robots-tag':'noindex, nofollow'});res.end(JSON.stringify(data))};
const read=req=>new Promise((ok,no)=>{let data='',size=0;req.on('data',chunk=>{size+=chunk.length;if(size>16000){req.destroy();no(Error('Too large'))}else data+=chunk});req.on('end',()=>{try{ok(JSON.parse(data||'{}'))}catch{no(Error('Invalid JSON'))}});req.on('error',no)});
module.exports=function({db,save}){
 db.jobPortals ||= [];
 function docs(ownerId,jobId){return [
 ...db.estimates.filter(x=>x.ownerId===ownerId&&x.jobId===jobId).map(x=>({id:x.id,type:'estimate',label:'Estimate · version '+x.version,status:x.status,createdAt:x.createdAt,url:'/estimate/review/'+x.approvalToken})),
 ...db.changes.filter(x=>x.ownerId===ownerId&&x.jobId===jobId).map(x=>({id:x.id,type:'change',label:'Change order · '+new Date(x.createdAt).toISOString().slice(0,10),status:x.status,createdAt:x.createdAt,url:'/approve/'+x.approvalToken})),
 ...db.invoices.filter(x=>x.ownerId===ownerId&&x.jobId===jobId).map(x=>({id:x.id,type:'invoice',label:'Invoice '+x.invoiceNumber,status:(x.receipts?.length?'contractor recorded '+require('./51-payment-tracking.js').summary(x).status:'issued - no receipts recorded'),createdAt:x.issuedAt,url:'/invoice/view/'+x.publicToken}))
 ]}
 function view(p){let estimate=db.estimates.filter(x=>x.ownerId===p.ownerId&&x.jobId===p.jobId).at(-1);return {project:p.project,customer:p.customer,business:p.business,documents:docs(p.ownerId,p.jobId).filter(x=>p.documentIds.includes(x.id))}}
 return async function(req,res,url,user){
  const publicMatch=url.pathname.match(/^\/api\/estimates\/portal\/([A-Za-z0-9_-]{40,})$/);
  if(publicMatch){if(req.method!=='GET')return reply(res,405,{error:'Method not allowed'});let p=db.jobPortals.find(x=>x.publicToken===publicMatch[1]&&x.enabled);if(!p)return reply(res,404,{error:'This job page is unavailable. Ask your contractor for a current link.'});return reply(res,200,view(p))}
  const ownerMatch=url.pathname.match(/^\/api\/estimates\/jobs\/(job_[a-z0-9]+)\/portal$/);
  if(!ownerMatch)return false;
  if(!user)return reply(res,401,{error:'Sign in'});
  const jobId=ownerMatch[1];let estimate=db.estimates.filter(x=>x.ownerId===user.id&&x.jobId===jobId).at(-1);if(!estimate)return reply(res,404,{error:'Job not found'});
  let p=db.jobPortals.find(x=>x.ownerId===user.id&&x.jobId===jobId);
  if(req.method==='GET')return reply(res,200,{project:estimate.project,customer:estimate.customer,business:estimate.business,documents:docs(user.id,jobId),portal:p?.enabled?{documentIds:p.documentIds,url:'/job/view/'+p.publicToken}:null});
  if(req.method==='DELETE'){if(p){p.enabled=false;p.publicToken=null;await save()}return reply(res,200,{revoked:true})}
  if(req.method!=='PUT')return reply(res,405,{error:'Method not allowed'});
  let b;try{b=await read(req)}catch{return reply(res,400,{error:'Invalid request'})}
  const available=docs(user.id,jobId);if(!Array.isArray(b.documentIds)||!b.documentIds.length||b.documentIds.length>100||b.documentIds.some(id=>typeof id!=='string'||!available.some(d=>d.id===id)))return reply(res,400,{error:'Select valid records from this job'});
  if(!p){p={ownerId:user.id,jobId};db.jobPortals.push(p)}
  Object.assign(p,{project:estimate.project,customer:estimate.customer,business:estimate.business,enabled:true,publicToken:token(),documentIds:[...new Set(b.documentIds)],updatedAt:new Date().toISOString()});await save();return reply(res,200,{url:'/job/view/'+p.publicToken,...view(p)});
 }
};
