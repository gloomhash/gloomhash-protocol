import fs from 'node:fs';
import { JSDOM } from 'jsdom';
const dir=process.argv[2];
const html=fs.readFileSync(dir+'/index.html','utf8').replace(/<script[^>]*><\/script>/g,'');
const js=fs.readFileSync(dir+'/assets/app.js','utf8');
const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window; const calls=[];
w.matchMedia=(q)=>({matches:/reduce/.test(q)});
w.fetch=(u)=>{calls.push(u); const ok=(b)=>Promise.resolve({ok:true,json:()=>Promise.resolve(b)});
 if(u.includes('boosts')) return ok([{chainId:'solana',tokenAddress:'AAA',totalAmount:5}]);
 return ok([{baseToken:{address:'AAA',symbol:'S0'},priceUsd:'1',volume:{h24:1}}])};
try{w.eval(js);}catch(e){console.log('EVAL ERR',e)}
await new Promise(r=>setTimeout(r,400));
console.log(calls); console.log([...w.document.querySelectorAll('#ticker-track b')].map(b=>b.textContent));
console.log([...w.document.querySelectorAll('#board-rows .row')].slice(0,3).map(r=>r.className+'|'+(r._addr)+'|'+r.querySelector('.sym').textContent));
