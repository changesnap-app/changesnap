'use strict';
// Private owner work records. Separate persistence from approvals/payment snapshots.
const crypto=require('crypto'),fs=require('fs'),path=require('path');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
const empty=()=>({revision:0,entries:[],operations:[]});
function fail(message,status=400){const e=Error(message);e.status=status;throw e}
function canonical(x){if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';return JSON.stringify(x)}
function store({getPool=()=>null,dataDir}){
 let ready=null;
 async function poolReady(){const p=getPool();if(!p)return null;if(!ready)ready=p.query('CREATE TABLE IF NOT EXISTS jobneatly_time_records (owner_id text PRIMARY KEY, revision bigint NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())').catch(e=>{ready=null;throw e});await ready;return p}
 const file=owner=>path.join(dataDir,'work-time',sha(owner)+'.json');
 return {
  async read(owner){const p=await poolReady();if(p){const r=await p.query('SELECT revision,data FROM jobneatly_time_records WHERE owner_id=$1',[owner]);return r.rows.length?{...r.rows[0].data,revision:Number(r.rows[0].revision)}:empty()}try{return JSON.parse(fs.readFileSync(file(owner),'utf8'))}catch(e){if(e.code==='ENOENT')return empty();throw e}},
  async cas(owner,revision,next){const p=await poolReady();if(p){const data=JSON.stringify(next);const r=revision===0?await p.query('INSERT INTO jobneatly_time_records(owner_id,revision,data) VALUES($1,1,$2::jsonb) ON CONFLICT(owner_id) DO NOTHING RETURNING revision',[owner,data]):await p.query('UPDATE jobneatly_time_records SET revision=revision+1,data=$3::jsonb,updated_at=now() WHERE owner_id=$1 AND revision=$2 RETURNING revision',[owner,revision,data]);return !!r.rows.length}
   const f=file(owner);let current=empty();try{current=JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}if(current.revision!==revision)return false;fs.mkdirSync(path.dirname(f),{recursive:true});const t=f+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';try{fs.writeFileSync(t,JSON.stringify(next));fs.renameSync(t,f)}finally{if(fs.existsSync(t))fs.unlinkSync(t)}return true}
 }
}
function text(value,label,max,required=false){if(typeof value!=='string')fail('Enter '+label);const s=value.trim();if(s.length>max||(required&&!s))fail(label+' must be '+(required?'1-':'at most ')+max+' characters');return s}
function instant(value,now){if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value))fail('Use a valid timestamp');const n=Date.parse(value);if(!Number.isFinite(n)||new Date(n).toISOString()!==value||n<Date.UTC(2000,0,1)||n>now+300000)fail('Time must be valid, from 2000 through five minutes ahead');return n}
function fields(b,now){const start=instant(b.startedAt,now),end=instant(b.endedAt,now);if(end<=start||end-start>36*3600000)fail('End must follow start, within 36 hours');if(!Number.isInteger(b.breakMinutes)||b.breakMinutes<0||b.breakMinutes*60000>=end-start)fail('Unpaid break must be whole minutes, shorter than the session');return {startedAt:new Date(start).toISOString(),endedAt:new Date(end).toISOString(),breakMinutes:b.breakMinutes,note:text(b.note,'work note',1000)}}
function overlap(entries,entry,ignore){if(entries.some(e=>e.id!==ignore&&!e.voidedAt&&Date.parse(e.startedAt)<(entry.endedAt?Date.parse(entry.endedAt):Infinity)&&(!e.endedAt||Date.parse(e.endedAt)>Date.parse(entry.startedAt))))fail('This overlaps another work session. Review the existing record first.',409)}
function csvCell(x){let s=String(x??'');if(/^[\s\x00-\x1f]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
function csv(entries){const header=['Record ID','Project','Customer','Started UTC','Ended UTC','Break minutes','Net minutes','Work note','Entry kind','Version','Voided UTC'];const rows=entries.map(e=>[e.id,e.project,e.customer,e.startedAt,e.endedAt,e.breakMinutes,e.endedAt?((Date.parse(e.endedAt)-Date.parse(e.startedAt))/60000-e.breakMinutes).toFixed(3):'',e.note,e.kind,e.version,e.voidedAt||'']);return '\uFEFF'+[header,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n'}
function apply(state,b,jobs,now){
 if(!b||typeof b!=='object'||Array.isArray(b))fail('Invalid request');
 if(typeof b.requestId!=='string'||! /^[a-zA-Z0-9_-]{16,80}$/.test(b.requestId))fail('Invalid request identifier');
 const fingerprint=sha(canonical(b)),prior=state.operations.find(o=>o.requestId===b.requestId);
 if(prior){if(prior.fingerprint!==fingerprint)fail('This request identifier was already used for different data.',409);return {next:null,entry:state.entries.find(e=>e.id===prior.entryId),replayed:true}}
 if(state.operations.length>=20000)fail('Work-record safety limit reached. Export your records and contact support.',409);
 const next=clone(state),at=new Date(now).toISOString();let entry;
 if(b.action==='start'||b.action==='manual'){
  const job=jobs.find(j=>j.jobId===b.jobId);if(!job)fail('Choose one of your existing jobs');
  if(next.entries.length>=5000)fail('Work-record safety limit reached. Export your records and contact support.',409);
  const data=b.action==='manual'?fields(b,now):{startedAt:at,endedAt:null,breakMinutes:0,note:text(b.note,'work note',1000)};
  entry={id:'time_'+crypto.randomBytes(12).toString('hex'),jobId:job.jobId,project:job.project,customer:job.customer,...data,kind:b.action==='start'?'timer':'manual',version:1,createdAt:at,updatedAt:at,voidedAt:null,history:[]};overlap(next.entries,entry);entry.history.push({action:b.action,at,version:1});next.entries.push(entry);
 }else if(['stop','correct','void'].includes(b.action)){
  entry=next.entries.find(e=>e.id===b.id);if(!entry)fail('Work record not found',404);if(!Number.isInteger(b.version)||entry.version!==b.version)fail('This record changed in another tab. Refresh records before saving.',409);if(entry.voidedAt)fail('This record is already voided.',409);
  const before={startedAt:entry.startedAt,endedAt:entry.endedAt,breakMinutes:entry.breakMinutes,note:entry.note,voidedAt:entry.voidedAt};
  let reason='';if(b.action==='stop'){if(entry.endedAt)fail('This timer has already stopped.',409);const data=fields({startedAt:entry.startedAt,endedAt:at,breakMinutes:b.breakMinutes,note:b.note},now);Object.assign(entry,data);overlap(next.entries,entry,entry.id)}
  if(b.action==='correct'){reason=text(b.reason,'correction reason',300,true);Object.assign(entry,fields(b,now));overlap(next.entries,entry,entry.id)}
  if(b.action==='void'){reason=text(b.reason,'void reason',300,true);entry.voidedAt=at}
  entry.version++;entry.updatedAt=at;entry.history.push({action:b.action,at,version:entry.version,before,reason});
 }else fail('Unknown work-record action');
 next.revision=state.revision+1;next.operations.push({requestId:b.requestId,fingerprint,entryId:entry.id});return {next,entry,replayed:false}
}
module.exports=function setup(options){const db=options.db,storage=options.storage||store(options),clock=options.clock||Date.now;
 const json=(res,n,data)=>{res.writeHead(n,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))};
 function body(req){return new Promise((resolve,reject)=>{const chunks=[];let length=0;req.on('data',x=>{length+=x.length;if(length>8000){reject(Object.assign(Error('Request too large'),{status:413}));req.destroy()}else chunks.push(x)});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{reject(Object.assign(Error('Invalid request'),{status:400}))}});req.on('error',reject)})}
 return async(req,res,url,user)=>{if(!user)return json(res,401,{error:'Sign in to track private work time'});try{
  const jobs=[...new Map((db.estimates||[]).filter(e=>e.ownerId===user.id).map(e=>[e.jobId,{jobId:e.jobId,project:e.project,customer:e.customer}])).values()];
  if(req.method==='GET'&&url.pathname==='/api/job-time'){const s=await storage.read(user.id);return json(res,200,{revision:s.revision,entries:s.entries,jobs,serverTime:new Date(clock()).toISOString()})}
  if(req.method==='GET'&&url.pathname==='/api/job-time/export.csv'){const s=await storage.read(user.id);res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="jobneatly-work-time.csv"','cache-control':'no-store','x-content-type-options':'nosniff'});return res.end(csv(s.entries))}
  if(req.method!=='POST'||url.pathname!=='/api/job-time')return json(res,405,{error:'Method not allowed'});
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return json(res,415,{error:'Use JSON for work records'});
  // Browser-origin check complements authenticated SameSite session cookies.
  if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin)}catch{fail('Invalid origin',403)}if(origin.host!==req.headers.host)fail('Cross-site request refused',403)}
  const b=await body(req),s=await storage.read(user.id),result=apply(s,b,jobs,clock());if(!result.next)return json(res,200,{entry:result.entry,revision:s.revision,replayed:true});
  if(!await storage.cas(user.id,s.revision,result.next))return json(res,409,{error:'Your work records changed in another tab. Refresh records and review before saving.'});
  return json(res,200,{entry:result.entry,revision:result.next.revision,replayed:false});
 }catch(e){return json(res,e.status||503,{error:e.status?e.message:'Could not save or load work records. Your edits are still on this page. Try again with the same request.'})}}
};
module.exports.apply=apply;module.exports.csv=csv;module.exports.store=store;
