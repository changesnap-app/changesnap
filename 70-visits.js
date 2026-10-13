// Privacy-light visit counter. Stores per-day view counts, hashed visitor ids (ip+ua+day) and referrer hosts in the existing state record.
const crypto=require('crypto');
const BOT=/bot|crawl|spider|slurp|monitor|uptime|curl|wget|python|node-fetch|axios|go-http|headless|preview|pingdom|scan|github-actions/i;
const COUNT=/^(\/|\/index\.html|\/pricing|\/estimate|\/change-order-template|\/estimate-template|\/lang\/[a-z-]+|\/account|\/approve\/.*)$/;
let timer=null;
module.exports=function(req,url,getDb,save){
 if(req.method!=='GET')return;
 const p=url.pathname;if(!COUNT.test(p))return;
 const ua=String(req.headers['user-agent']||'');if(!ua||BOT.test(ua))return;
 const db=getDb();if(!db)return;
 const v=db.visits||(db.visits={});
 const day=new Date().toISOString().slice(0,10);
 const d=v[day]||(v[day]={views:0,visitors:[],pages:{},refs:{}});
 const page=p.startsWith('/approve/')?'/approve/*':p;
 d.views++;d.pages[page]=(d.pages[page]||0)+1;
 const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
 const h=crypto.createHash('sha256').update(ip+'|'+ua+'|'+day).digest('hex').slice(0,12);
 if(d.visitors.length<5000&&!d.visitors.includes(h))d.visitors.push(h);
 let ref='';try{ref=new URL(req.headers.referer||'').hostname}catch{}
 if(ref&&!/onrender\.com$/.test(ref))d.refs[ref]=(d.refs[ref]||0)+1;
 if(!timer)timer=setTimeout(()=>{timer=null;try{save()}catch{}},30000);
};
