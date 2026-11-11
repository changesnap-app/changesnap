'use strict';
// Calendar reporting only. Start-date attribution is explicit; never mixes currencies.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WorkCalendar=factory()})(globalThis,()=>{
 const key=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 const netMs=e=>Math.max(0,Date.parse(e.endedAt)-Date.parse(e.startedAt)-e.breakMinutes*60000);
 function cents(e){if(e.rateCents==null)return null;return Number((BigInt(Math.round(netMs(e)))*BigInt(e.rateCents)+1800000n)/3600000n)}
 function aggregate(entries){let ms=0,unpriced=0;const money={},days=new Set();for(const e of entries){if(!e.endedAt||e.voidedAt)continue;ms+=netMs(e);days.add(key(new Date(e.startedAt)));const n=cents(e);if(n===null)unpriced++;else money[e.currency]=(money[e.currency]||0)+n}return {minutes:ms/60000,days:days.size,money,unpriced}}
 function month(entries,year,month,job){const rows=entries.filter(e=>(job===undefined||e.jobId===job));const started=e=>new Date(e.startedAt);const selected=rows.filter(e=>started(e).getFullYear()===year&&started(e).getMonth()===month),annual=rows.filter(e=>started(e).getFullYear()===year);const byDay={};for(const e of selected){const d=key(started(e));(byDay[d]||=[]).push(e)}return {byDay,summary:aggregate(selected),year:aggregate(annual)}}
 return {key,netMs,cents,aggregate,month};
});
