const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();
const html='<!doctype html><html><head><meta charset=utf-8></head><body>'+fs.readFileSync(process.argv[2]||'earth-dashboard-emulator.html','utf8')+'</body></html>';
let pass=0,fail=0;const fails=[];
const ok=(c,msg)=>{if(c)pass++;else{fail++;if(fails.length<40)fails.push(msg)}};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function fresh(){const p=await b.newPage({viewport:{width:1120,height:1000}});p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));await p.setContent(html);await p.waitForTimeout(150);
 p.adv=s=>p.evaluate(s=>window.__emu.advance(s),s);p.st=()=>p.evaluate(()=>window.__emu.state());p.press=m=>p.evaluate(m=>window.__emu.press(m),m);await p.adv(0);await p.evaluate(()=>window.__emu.useScen('demo'));await p.adv(0.05);return p}
// independent reference for where a tube should be, e seconds after a press
const ref=(e,target,o)=>{const STEP=.22*o.pace,WALK=.7*o.pace,idle=o.cold?5:2*o.pace,rowD=o.ripple?.12*o.row:0,sweepEnd=14*STEP+(o.ripple?.24:0),idleEnd=sweepEnd+idle;
 if(e<idleEnd){const tau=e-rowD;if(tau<0)return -1;if(tau<10*STEP)return Math.floor(tau/STEP);if(tau<14*STEP)return 8-Math.floor((tau-10*STEP)/STEP);return 5}
 if(target===null)return -1;const k=Math.floor((e-idleEnd)/WALK)+1,d=Math.abs(target-5);return 5+Math.sign(target-5)*Math.min(k,d)};
const p0=await fresh();const meta=await p0.evaluate(()=>({SCEN:window.__emu.SCEN,SLOW:window.__emu.SLOW}));const SCEN=meta.SCEN,SLOW=meta.SLOW;
// T1 input validation
for(const k in SCEN){const f=SCEN[k].frame;ok(f.length===4,`T1 ${k} has 4 modes`);f.forEach((row,m)=>{ok(row.length===9,`T1 ${k} mode ${m} has 9 tubes`);row.forEach((v,i)=>ok(v===null||(Number.isInteger(v)&&v>=1&&v<=9),`T1 ${k} m${m} tube${i} value ${v} in 1..9 or null`))});ok(eq(f[3],[5,5,5,5,5,5,5,5,5]),`T1 ${k} baseline all 5`)}
// T2 every scenario x mode: full sequence
for(const k in SCEN)for(let m=0;m<4;m++){const p=await fresh();await p.selectOption('#scen',k);await p.adv(12);await p.press((m+1)%4);await p.adv(12);
 let s=await p.st();ok(eq(s.sel.map(x=>x<0?null:x),SCEN[k].frame[(m+1)%4]),`T2 ${k} pre-rest`);
 await p.press(m);const tgt=SCEN[k].frame[m];let e=0;const go=async to=>{await p.adv(to-e);e=to;return p.st()};
 for(let j=0;j<14;j++){s=await go((j+.5)*.22);const exp=tgt.map(t=>ref(e,t,{pace:1,row:0}));ok(eq(s.sel,exp),`T2 ${k} m${m} sweep step ${j}: got ${s.sel} want ${exp}`);ok(s.phase==='sweep',`T2 phase sweep`);ok(eq(s.lit,exp),`T2 ${k} m${m} sweep step ${j} glow ${s.lit} vs ${exp}`);ok(!s.lamps.some(x=>x),'T2 marker lamps off in sweep')}
 s=await go(14*.22+1);ok(eq(s.sel,[5,5,5,5,5,5,5,5,5])&&s.phase==='idle',`T2 ${k} m${m} idle at 5`);
 const far=Math.max(...tgt.map(t=>t===null?0:Math.abs(t-5)));let prev=s.sel;
 for(let w=0;w<Math.max(far,1);w++){s=await go(14*.22+2+w*.7+.35);const exp=tgt.map(t=>ref(e,t,{pace:1,row:0}));ok(eq(s.sel,exp),`T2 ${k} m${m} walk ${w}: got ${s.sel} want ${exp}`);
   s.sel.forEach((v,i)=>{if(v>=0&&prev[i]>=0)ok(Math.abs(v-prev[i])<=1,`T2 ${k} m${m} tube${i} jumped ${prev[i]}->${v}`)});prev=s.sel}
 s=await go(14*.22+2+far*.7+1.5);ok(s.phase==='rest',`T2 ${k} m${m} rests`);ok(eq(s.sel.map(x=>x<0?null:x),tgt),`T2 ${k} m${m} final ${s.sel} want ${tgt}`);ok(eq(s.lit.map(x=>x<0?null:x),tgt),`T2 ${k} m${m} final glow ${s.lit}`);
 ok(!s.sel.includes(0),`T2 ${k} m${m} no 0 at rest`);
 const expL=tgt.map((t,i)=>t!==null&&SCEN[k].slow[m].includes(i));ok(eq(s.lamps,expL),`T2 ${k} m${m} lamps ${s.lamps} want ${expL}`);ok(s.mode===m,'T2 mode');ok(p.errs.length===0,'T2 js errors '+p.errs);await p.close()}
// T3 cold start (wake) idle is 5 s
{const p=await fresh();await p.click('#sleep');await p.adv(1);let s=await p.st();ok(s.sel.every(x=>x===-1)&&s.lit.every(x=>x===-1)&&!s.lamps.some(x=>x)&&s.phase==='asleep','T3 asleep is dark');
 await p.click('#wake');await p.adv(14*.22+4.8);s=await p.st();ok(s.phase==='idle'&&eq(s.sel,[5,5,5,5,5,5,5,5,5]),'T3 still idling at 4.8 s: '+s.phase);await p.adv(.5);s=await p.st();ok(s.phase==='walk','T3 walking after 5 s idle: '+s.phase);
 await p.adv(5);s=await p.st();ok(eq(s.sel,SCEN.demo.frame[0]),'T3 lands on mode 0');
 await p.click('#sleep');await p.adv(.5);await p.press(2);await p.adv(14*.22+4.8);s=await p.st();ok(s.phase==='idle','T3b button wake uses 5 s idle');await p.adv(6);s=await p.st();ok(s.mode===2&&eq(s.sel,SCEN.demo.frame[2]),'T3b lands on pressed mode');
 await p.click('#sleep');await p.adv(.5);await p.selectOption('#scen','wild');await p.adv(3);s=await p.st();ok(s.phase==='asleep'&&s.sel.every(x=>x===-1),'T3c scenario change while asleep stays asleep: '+s.phase);await p.close()}
// T4-6 presses mid-sequence
{const p=await fresh();await p.press(1);await p.adv(1.0);await p.press(2);let s=await p.st();ok(s.phase==='sweep'&&s.sel[0]===4,'T4 press in sweep does not restart: sel '+s.sel[0]);await p.adv(14*.22+2-1+.05);s=await p.st();ok(s.phase==='walk','T4 timeline unchanged: '+s.phase);await p.adv(5);s=await p.st();ok(s.mode===2&&eq(s.sel,SCEN.demo.frame[2]),'T4 lands on newest');
 await p.press(0);await p.adv(14*.22+1);await p.press(3);await p.press(1);await p.adv(1.2);s=await p.st();ok(s.phase==='walk','T5 press in idle keeps timeline: '+s.phase);await p.adv(5);s=await p.st();ok(s.mode===1&&eq(s.sel,SCEN.demo.frame[1]),'T5 last of several presses wins');
 await p.press(0);await p.adv(14*.22+2+.3);s=await p.st();ok(s.phase==='walk','T6 in walk: '+s.phase);await p.press(2);await p.adv(.05);s=await p.st();ok(s.phase==='sweep'&&s.sel.every(x=>x===0),'T6 press in walk restarts sweep: '+s.phase+' '+s.sel);await p.adv(10);s=await p.st();ok(eq(s.sel,SCEN.demo.frame[2]),'T6 lands');await p.close()}
// T7 lamp test
{const p=await fresh();await p.click('#lamp');for(let d=0;d<10;d++){await p.adv(d===0?.5:1);const s=await p.st();ok(s.phase==='lamp'&&s.sel.every(x=>x===d)&&s.lit.every(x=>x===d),`T7 lamp digit ${d}: ${s.sel} lit ${s.lit}`);ok(!s.lamps.some(x=>x),'T7 marker lamps off')}
 await p.adv(1);let s=await p.st();ok(s.phase==='rest'&&eq(s.sel,SCEN.demo.frame[0]),'T7 returns to readings: '+s.phase);
 await p.click('#lamp');await p.adv(3.5);await p.press(1);await p.adv(.05);s=await p.st();ok(s.phase==='sweep','T7 press cancels lamp test');await p.adv(10);
 await p.click('#lamp');await p.adv(3.5);await p.selectOption('#scen','wild');await p.adv(.3);s=await p.st();ok(s.phase==='lamp','T7b new data during lamp test does not interrupt it, phase '+s.phase);await p.adv(.2);const a=await p.st();await p.adv(12);s=await p.st();ok(eq(s.sel,SCEN.wild.frame[1]),'T7b ends on new scenario');
 await p.click('#lamp');await p.adv(3.5);await p.click('#wake');await p.adv(.3);s=await p.st();ok(s.phase==='sweep','T7c wake during lamp test starts a clean sweep, got '+s.phase+' sel '+s.sel[0]);
 await p.click('#lamp');await p.adv(3.5);await p.click('#sleep');await p.adv(.3);s=await p.st();ok(s.phase==='asleep','T7d sleep cancels lamp');await p.close()}
// T8 ripple
{const p=await fresh();await p.check('#ripple');await p.press(1);await p.adv(.05);let s=await p.st();const ROWOF=[0,1,1,1,2,0,2,2,0];ok(eq(s.sel,ROWOF.map(r=>r===0?0:-1)),'T8 the top cluster starts first: '+s.sel);
 for(const e of [.5,1.3,2.5,3.2]){await p.adv(e-(s.t2||.05));s.t2=e;const x=await p.st();const exp=SCEN.demo.frame[1].map((t,i)=>ref(e,t,{pace:1,ripple:true,row:ROWOF[i]}));ok(eq(x.sel,exp),`T8 ripple at ${e}: ${x.sel} want ${exp}`)}
 await p.adv(8);s=await p.st();ok(eq(s.sel,SCEN.demo.frame[1]),'T8 lands');await p.close()}
// T9 pace
for(const pc of [50,200]){const p=await fresh();await p.fill('#pace',String(pc));await p.dispatchEvent('#pace','input');const pace=pc/100;let s=await p.st();ok(Math.abs(s.STEP-.22*pace)<1e-9&&Math.abs(s.WALK-.7*pace)<1e-9,'T9 pace vars');
 await p.press(2);let e=0;for(const frac of [.1,.35,.6,.8,.95,1.05,1.3]){const total=14*.22*pace+2*pace+2*.7*pace;const to=frac*total;await p.adv(to-e);e=to;s=await p.st();const exp=SCEN.demo.frame[2].map(t=>ref(e,t,{pace,row:0}));ok(eq(s.sel,exp),`T9 pace ${pc} at ${e.toFixed(2)}: ${s.sel} want ${exp}`)}
 ok((await p.textContent('#pacev'))===Math.round(220*pace)+' ms a digit','T9 label');await p.close()}
// T10 dead digit + sensing, every tube and digit
for(let tube=0;tube<9;tube++)for(let dg=0;dg<10;dg++){if((tube*10+dg)%7&&!(tube===0&&dg===7))continue;const p=await fresh();await p.selectOption('#ftube',String(tube));await p.selectOption('#fdigit',String(dg));await p.press(0);
 let sawDark=false,othersOk=true;for(let j=0;j<14;j++){await p.adv(j===0?.11:.22);const s=await p.st();const d=s.sel[tube];if(d===dg){sawDark=sawDark||s.lit[tube]===-1;ok(s.lit[tube]===-1,`T10 tube${tube} digit${dg} dark at step ${j}, lit ${s.lit[tube]}`)}else ok(s.lit[tube]===d,`T10 tube${tube} healthy digit ${d}`);s.lit.forEach((v,i)=>{if(i!==tube&&v!==s.sel[i])othersOk=false})}
 ok(sawDark,`T10 tube${tube} digit${dg} gap seen`);ok(othersOk,'T10 other tubes unaffected');await p.adv(6);const s=await p.st();ok(eq(s.sensed,[tube*10+dg]),`T10 sensed exactly tube${tube} digit${dg}: ${s.sensed}`);
 const txt=await p.textContent('#sensed');ok(txt.includes(['LITHO','OCEAN','ATMOS','CRYO','CHEMO','CYCLO','ANTH','PALIN','SOLAR'][tube]+' digit '+dg),'T10 text: '+txt);
 await p.selectOption('#fdigit','-1');await p.adv(.3);ok((await p.st()).sensed.length===0,'T10 cleared');await p.close()}
{const p=await fresh();await p.uncheck('#sense');await p.selectOption('#fdigit','6');await p.press(0);await p.adv(9);const s=await p.st();ok(s.sensed.length===0,'T10b sensing off records nothing');ok(s.lit[0]===-1&&s.sel[0]===6,'T10b LITHO resting on dead 6 is dark');await p.close()}
// T11 mount + electrical invariant
{const p=await fresh();const a=await p.st();await p.selectOption('#mount','-90');await p.adv(.5);const c=await p.st();ok(eq(a.sel,c.sel),'T11 mount does not change readings');
 await p.press(1);let bad=0,direct=0,prev=(await p.st()).cell;const r=await p.evaluate(()=>{const e=window.__emu;let prev=e.state().cell,direct=0,multi=0;for(let i=0;i<40000;i++){e.advance(1e-4);const c=e.tubes.map(x=>x.cell);c.forEach((v,j)=>{if(v>=0&&prev[j]>=0&&v!==prev[j])direct++});e.tubes.forEach(x=>{let n=0;x.glow.forEach(g=>{});});prev=c}return {direct}});
 ok(r.direct===0,'T11 a glow never jumps digit without extinguishing first: '+r.direct);await p.close()}

// T0 first frame after load already shows the readings
{const p=await fresh();const s=await p.st();ok(eq(s.sel,SCEN.demo.frame[0])&&eq(s.lit,SCEN.demo.frame[0]),'T0 lit on first frame: '+s.sel+' / '+s.lit);await p.close()}
// T0b the page opens on the real readings, not the made-up ones
{const p=await b.newPage({viewport:{width:1120,height:1000}});await p.setContent(html);await p.waitForTimeout(300);const s=await p.evaluate(()=>window.__emu.state());ok(s.scen==='first'&&(await p.inputValue('#scen'))==='first','T0b opens on real readings');ok(eq(s.sel,SCEN.first.frame[0]),'T0b tubes show them: '+s.sel);ok(s.sel[7]===7,'T0b PALIN reads 7 on real data');await p.close()}
// T12 new data at rest: quiet walk, no sweep
{const p=await fresh();await p.adv(1);let prev=(await p.st()).sel;await p.selectOption('#scen','wild');let steps=0,sweeps=0;
 for(let j=0;j<12;j++){await p.adv(.35);const s=await p.st();if(s.phase!=='rest')sweeps++;s.sel.forEach((v,i)=>{ok(Math.abs(v-prev[i])<=1,`T12 tube${i} moved ${prev[i]}->${v}`);ok(v!==0,'T12 no 0')});if(!eq(s.sel,prev))steps++;prev=s.sel}
 ok(sweeps===0,'T12 no sweep on new data');ok(eq(prev,SCEN.wild.frame[0]),'T12 lands on new data: '+prev);ok(steps>=3,'T12 took several beats: '+steps);
 await p.selectOption('#scen','first');await p.adv(6);let s=await p.st();ok(eq(s.sel.map(x=>x<0?null:x),SCEN.first.frame[0]),'T12 to no-reading goes dark: '+s.sel);
 await p.selectOption('#scen','demo');await p.adv(6);s=await p.st();ok(eq(s.sel,SCEN.demo.frame[0]),'T12 back from dark');await p.close()}
// T13 frame file validation
{const p=await fresh();const good={v:1,seq:9,made:'2026-11-13T06:00:00Z',poll:3600,era:0,ready:false,glow:'',d:['123456789','-23456789','555555555','555555555'],slow:['000000000','111111111','000000000','000000000']};
 const bad=[['not json','{'],['array','[1]'],['v2',{...good,v:2}],['no seq',{...good,seq:undefined}],['seq float',{...good,seq:1.5}],['seq neg',{...good,seq:-1}],['poll small',{...good,poll:10}],['made bad',{...good,made:'yesterday'}],
  ['d 3 rows',{...good,d:good.d.slice(0,3)}],['d short',{...good,d:['12345678',...good.d.slice(1)]}],['d long',{...good,d:['1234567891',...good.d.slice(1)]}],['d has 0',{...good,d:['023456789',...good.d.slice(1)]}],['d letter',{...good,d:['a23456789',...good.d.slice(1)]}],['d number',{...good,d:[123456789,...good.d.slice(1)]}],['d null',{...good,d:null}],
  ['slow missing',{...good,slow:undefined}],['era missing',{...good,era:undefined}],['era neg',{...good,era:-1}],['era text',{...good,era:'1'}],['ready text',{...good,ready:'yes'}],['ready missing',{...good,ready:undefined}],['glow word',{...good,glow:'purple'}],['glow hash',{...good,glow:'#7A5CFF'}],['glow short',{...good,glow:'7A5'}],['glow missing',{...good,glow:undefined}],['slow 2',{...good,slow:['000000002',...good.slow.slice(1)]}],['slow short',{...good,slow:['0000',...good.slow.slice(1)]}]];
 const r=await p.evaluate(g=>window.__emu.parseFrame(JSON.stringify(g)),good);ok(!r.error&&eq(r.frame[0],[1,2,3,4,5,6,7,8,9])&&r.frame[1][0]===null&&eq(r.slow[1],[0,1,2,3,4,5,6,7,8])&&eq(r.slow[0],[]),'T13 good file parses: '+JSON.stringify(r).slice(0,80));
 for(const [name,v] of bad){const x=await p.evaluate(t=>window.__emu.parseFrame(t),typeof v==='string'?v:JSON.stringify(v));ok(!!x.error&&!x.frame,`T13 rejects ${name}: ${JSON.stringify(x).slice(0,60)}`)}
 // through the page
 await p.adv(1);const before=(await p.st()).sel;await p.fill('#framebox','{"v":1,"seq":5,"made":"2026-11-13T06:00:00Z","poll":3600,"era":0,"ready":false,"glow":"","d":["023456789"],"slow":[]}');await p.click('#sendframe');await p.adv(3);
 ok((await p.textContent('#framemsg')).startsWith('Rejected'),'T14 bad frame rejected in page');ok(eq((await p.st()).sel,before),'T14 last good frame stays');
 await p.fill('#framebox',JSON.stringify(good));await p.click('#sendframe');await p.adv(8);const s=await p.st();ok(eq(s.sel,[1,2,3,4,5,6,7,8,9]),'T14 custom frame shown: '+s.sel);ok((await p.textContent('#framemsg')).startsWith('Accepted frame 9'),'T14 message');
 await p.press(1);await p.adv(12);const s2=await p.st();ok(eq(s2.sel,[-1,2,3,4,5,6,7,8,9]),'T14 custom frame button 2: '+s2.sel);ok(eq(s2.lamps,[false,true,true,true,true,true,true,true,true]),'T14 slow flags from file, none on the dark tube: '+s2.lamps);
 const box=await p.inputValue('#framebox');await p.selectOption('#scen','calm');const rt=await p.evaluate(()=>window.__emu.parseFrame(document.getElementById('framebox').value));ok(!rt.error&&rt.file.seq===3,'T14 shown file round-trips');ok(p.errs.length===0,'T14 js errors '+p.errs);await p.close()}

// T15 the covered button and the reset
{const p=await fresh();await p.adv(1);let s=await p.st();ok(s.era===0&&!s.ready&&s.glow===''&&s.halo==='','T15 starts on scale 0, no colour');
 await p.click('#reset');await p.adv(.5);ok((await p.textContent('#resetmsg')).startsWith('The cover is down')&&(await p.st()).era===0,'T15 cover down: press does nothing and says why');const r0=await p.evaluate(()=>window.__emu.pressReset());await p.adv(3);s=await p.st();ok(r0===false&&s.era===0&&s.phase==='rest'&&eq(s.sel,SCEN.demo.frame[0]),'T15 press with lamp dark does nothing');
 ok((await p.textContent('#resetmsg')).startsWith('Nothing happens'),'T15 says so');
 await p.click('#jump');await p.adv(8);s=await p.st();ok(s.scen==='late'&&(await p.inputValue('#scen'))==='late','T15 jump ahead picks the reset data');ok(s.ready&&s.era===0&&s.halo==='','T15 lamp lit, still scale 0, no colour');await p.click('#reset');await p.adv(.5);ok((await p.st()).era===0,'T15 lamp lit but cover down: still nothing');ok(await p.evaluate(()=>document.getElementById('readylamp').classList.contains('on')),'T15 ready lamp shown');
 ok(eq(s.sel,SCEN.late.frame[0]),'T15 pinned readings shown: '+s.sel);ok(s.sel.filter(x=>x===1||x===9).length>=3,'T15 at least three pinned');
 await p.check('#cover');await p.click('#reset');await p.adv(.3);s=await p.st();ok(s.era===1&&s.phase==='sweep','T15 press starts the sweep on scale 1: '+s.phase);
 await p.adv(14*.22+4.5);s=await p.st();ok(s.phase==='idle','T15 reset uses the long idle: '+s.phase);await p.adv(8);s=await p.st();const e1=SCEN.late.eras[1].frame;
 ok(eq(s.sel,e1[0])&&eq(s.lit,e1[0]),'T15 lands on new-scale readings: '+s.sel);ok(s.glow==='7A5CFF'&&s.halo.includes('7A5CFF')||s.halo.toLowerCase().includes('122, 92, 255'),'T15 colour on: '+s.halo);ok(!s.ready,'T15 lamp goes dark after reset');
 ok(!s.sel.some(x=>x===1||x===9),'T15 nothing pinned on the new scale');
 await p.press(3);await p.adv(14);s=await p.st();ok(eq(s.sel,[5,1,1,9,1,5,1,1,5]),'T15 button 4 shows the old normal on the new scale: '+s.sel);ok(!eq(s.sel,[5,5,5,5,5,5,5,5,5]),'T15 button 4 is no longer all 5s');
 const r2=await p.evaluate(()=>window.__emu.pressReset());await p.adv(1);s=await p.st();ok(r2===false&&s.era===1,'T15 second press does nothing');
 ok((await p.inputValue('#framebox')).includes('"era": 1'),'T15 file box shows the new file');
 await p.click('#sleep');await p.adv(.5);s=await p.st();ok(s.halo==='','T15 colour off while asleep');await p.press(0);await p.adv(14);s=await p.st();ok(s.era===1&&eq(s.sel,e1[0])&&s.halo!=='','T15 wakes still on scale 1');
 await p.selectOption('#scen','demo');await p.adv(8);s=await p.st();ok(s.era===0&&s.halo===''&&eq(s.sel,SCEN.demo.frame[0]),'T15 back to demo clears it');ok(p.errs.length===0,'T15 js errors '+p.errs);await p.close()}

// T16 new data arriving in the middle of a sequence
for(const when of ['sweep','idle','walk','walk2']){const p=await fresh();await p.adv(1);await p.press(0);const at={sweep:1.0,idle:14*.22+1,walk:14*.22+2+.1,walk2:14*.22+2+.9}[when];await p.adv(at);let prev=(await p.st()).sel;const ph=(await p.st()).phase;ok(ph===when.replace('2',''),`T16 set-up phase ${when}: ${ph}`);
 await p.selectOption('#scen','wild');let jumps=0,zero=0;for(let j=0;j<40;j++){await p.adv(.2);const s=await p.st();if(s.phase!=='sweep')s.sel.forEach((v,i)=>{if(v>=0&&prev[i]>=0&&Math.abs(v-prev[i])>1)jumps++;});if(s.phase!=='sweep'&&s.sel.includes(0))zero++;prev=s.sel}
 ok(jumps===0,`T16 data arriving in ${when}: no tube jumps more than one digit (${jumps} jumps)`);ok(zero===0,'T16 no 0 outside the sweep');const s=await p.st();ok(s.phase==='rest'&&eq(s.sel,SCEN.wild.frame[0]),`T16 ${when}: ends on the new data: ${s.sel}`);await p.close()}
// T17 custom file with an era, a colour and the ready flag
{const p=await fresh();const f={v:1,seq:77,made:'2030-01-01T00:00:00Z',poll:600,era:3,ready:true,glow:'00aaff',d:['123456789','987654321','5-5-5-5-5','511915115'],slow:['100000000','000000000','000000000','000000000']};
 await p.fill('#framebox',JSON.stringify(f));await p.click('#sendframe');await p.adv(8);let s=await p.st();ok(eq(s.sel,[1,2,3,4,5,6,7,8,9]),'T17 custom digits: '+s.sel);ok(s.glow==='00aaff'&&s.halo!=='','T17 colour from the file, lower case accepted');ok(s.ready,'T17 ready lamp from the file');ok(eq(s.lamps,[true,false,false,false,false,false,false,false,false]),'T17 slow flag from the file');
 await p.check('#cover');await p.click('#reset');await p.adv(1);s=await p.st();ok(s.phase==='rest'&&eq(s.sel,[1,2,3,4,5,6,7,8,9]),'T17 ready but no newer file to fetch: nothing happens');
 await p.press(2);await p.adv(14);s=await p.st();ok(eq(s.sel,[5,-1,5,-1,5,-1,5,-1,5]),'T17 dashes are dark: '+s.sel);ok(eq(s.lit,[5,-1,5,-1,5,-1,5,-1,5]),'T17 dark tubes have no glow');await p.close()}
// T18 files made by the fetcher's code are accepted by the emulator, and the emulator's files pass the fetcher's checks
{const m=require('/home/claude/earth/fetcher/mapping.js');const p=await fresh();let s=5;const rnd=()=>{s=(s*16807)%2147483647;return s/2147483647};let bad=0,mism=0,prev=null;
 for(let n=0;n<200;n++){const pos=[0,1,2].map(()=>Array.from({length:9},()=>rnd()<0.1?null:(rnd()-0.5)*12));const f=m.buildFrame({seq:n,made:'2026-11-13T06:00:00Z',positions:pos,previous:prev});prev=f.d;const r=await p.evaluate(t=>{const x=window.__emu.parseFrame(t);return x.error?{error:x.error}:{frame:x.frame}},JSON.stringify(f));if(r.error)bad++;else f.d.forEach((row,b)=>[...row].forEach((c,i)=>{if((c==='-'?null:+c)!==r.frame[b][i])mism++}))}
 ok(bad===0,'T18 200 fetcher-built files accepted by the emulator: '+bad+' rejected');ok(mism===0,'T18 digits read back identically');
 for(const k in SCEN){ok(m.validateFrame(SCEN[k].file)===null,`T18 emulator file ${k} passes the fetcher's checks`);if(SCEN[k].next)ok(m.validateFrame(SCEN[k].next)===null,`T18 emulator file ${k} era 1 passes`)}
 for(const k in SCEN){await p.selectOption('#scen',k);const t=await p.inputValue('#framebox');ok(eq(JSON.parse(t),SCEN[k].file)&&m.validateFrame(JSON.parse(t))===null,`T18 shown file for ${k} is the real file`)}
 // both sides reject the same bad files
 const base=SCEN.demo.file;const bads=[{...base,v:0},{...base,seq:'1'},{...base,poll:59},{...base,era:1.2},{...base,ready:null},{...base,glow:'12345'},{...base,d:[...base.d.slice(0,3),'55555555']},{...base,slow:[...base.slice?[]:base.slow.slice(0,3),'00000000a']}];let agree=0;for(const bf of bads){const e=await p.evaluate(t=>!!window.__emu.parseFrame(t).error,JSON.stringify(bf));if(e&&m.validateFrame(bf)!==null)agree++}ok(agree===bads.length,`T18 both sides reject the same bad files: ${agree}/${bads.length}`);await p.close()}
// T19 reset while asleep and mid-sweep
{const p=await fresh();await p.click('#jump');await p.adv(8);await p.click('#sleep');await p.adv(.5);await p.evaluate(()=>window.__emu.pressReset());await p.adv(.3);let s=await p.st();ok(!s.asleep&&s.era===1&&s.phase==='sweep','T19 reset while asleep wakes on the new scale');await p.adv(16);s=await p.st();ok(eq(s.sel,SCEN.late.eras[1].frame[0]),'T19 lands');await p.close()}
{const p=await fresh();await p.click('#jump');await p.adv(8);await p.press(1);await p.adv(1.2);await p.evaluate(()=>window.__emu.pressReset());await p.adv(.1);let s=await p.st();ok(s.phase==='sweep'&&s.sel.every(x=>x===0)&&s.era===1,'T19 reset mid-sweep restarts the sweep: '+s.sel);await p.adv(16);s=await p.st();ok(eq(s.sel,SCEN.late.eras[1].frame[1]),'T19 lands on the pressed button, new scale: '+s.sel);await p.close()}
// T20 the three-second hold, on the real clock
{const p=await b.newPage({viewport:{width:1120,height:1000}});const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.setContent(html);await p.waitForTimeout(300);const k=await p.$('#keys button:nth-child(2)');const bb=await k.boundingBox();
 await p.mouse.move(bb.x+bb.width/2,bb.y+20);await p.mouse.down();await p.waitForTimeout(1500);let s=await p.evaluate(()=>window.__emu.state());ok(s.phase==='rest','T20 1.5 s hold: nothing yet');await p.waitForTimeout(1900);await p.mouse.up();await p.waitForTimeout(200);s=await p.evaluate(()=>window.__emu.state());ok(s.phase==='lamp'&&s.mode===0,'T20 3 s hold starts the lamp test and is not a press: '+s.phase+' mode '+s.mode);
 await p.click('#keys button:nth-child(2)');await p.waitForTimeout(200);s=await p.evaluate(()=>window.__emu.state());ok(s.phase==='sweep'&&s.mode===1,'T20 a short press afterwards is a normal press');ok(errs.length===0,'T20 js errors');await p.close()}
// T21 loads cleanly in both themes and at phone width
for(const scheme of ['light','dark'])for(const w of [1120,400]){const p=await b.newPage({viewport:{width:w,height:900},colorScheme:scheme});const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.setContent(html);await p.waitForTimeout(250);ok(errs.length===0,`T21 ${scheme} ${w}: no errors`);ok(!(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),`T21 ${scheme} ${w}: no sideways scroll`);await p.close()}
// T22 the panel layout: three clusters, right tubes in each, and every lamp and canvas wired to its own tube
{const p=await fresh();const L=await p.evaluate(()=>[...document.querySelectorAll('.cluster')].map(c=>({name:c.querySelector('.clhead b').textContent,tubes:[...c.querySelectorAll('.cell span')].map(s=>s.textContent)})));
 ok(eq(L,[{name:'Natural rhythms',tubes:['LITHO','SOLAR','CYCLO']},{name:'Climate',tubes:['ATMOS','OCEAN','CRYO']},{name:'Human',tubes:['CHEMO','ANTH','PALIN']}]),'T22 clusters: '+JSON.stringify(L));
 ok(await p.evaluate(()=>document.querySelectorAll('.cell canvas').length===9&&document.querySelectorAll('.lamp:not(.big)').length===9),'T22 nine tubes and nine marker lamps');
 const f={v:1,seq:1,made:'2026-11-13T00:00:00Z',poll:3600,era:0,ready:false,glow:'',d:['555555555','555555555','555555555','555555555'],slow:['000001000','000000000','000000000','000000000']};
 await p.fill('#framebox',JSON.stringify(f));await p.click('#sendframe');await p.adv(6);const lit=await p.evaluate(()=>[...document.querySelectorAll('.cell')].filter(c=>c.querySelector('.lamp').classList.contains('on')).map(c=>c.querySelector('span').textContent));ok(eq(lit,['CYCLO']),'T22 the lamp for file position 6 lights beside CYCLO: '+lit);
 ok(!(await p.textContent('body')).match(/\bBIO\b|\bTECH\b/),'T22 old names are gone from the page');await p.close()}
// T23 the fetch button and its good/bad indicator. The network is replaced by a stand-in so every outcome can be forced.
{const NOW=Date.parse('2026-11-13T18:00:00Z');const mk=(o={})=>({v:1,seq:7,made:'2026-11-13T17:00:00Z',poll:3600,era:0,ready:false,glow:'',d:['123456789','987654321','555555555','555555555'],slow:['000000000','000000000','000000000','000000000'],...o});
 // go(page, table): table maps a frame number to a file, an HTTP status, 'throw', or raw text. Returns the indicator and the addresses asked for.
 const go=(p,table,now=NOW)=>p.evaluate(async([table,now])=>{const asked=[];const fk=async u=>{asked.push(u);const m=/frame-(\d+)\.json/.exec(u),v=table[m?m[1]:'x'];if(v==='throw'||v===undefined)throw new TypeError('Failed to fetch');if(typeof v==='number')return{ok:false,status:v,text:async()=>''};return{ok:true,status:200,text:async()=>typeof v==='string'?v:JSON.stringify(v)}};
   const r=await window.__emu.fetchLive(fk,now);return{r,asked,f:window.__emu.fetched(),lamp:document.getElementById('fetchlamp').className,word:document.getElementById('fetchword').textContent,msg:document.getElementById('fetchmsg').textContent,scen:document.getElementById('scen').value,box:document.getElementById('framebox').value,off:document.getElementById('fetchnow').disabled}},[table,now]);
 let p=await fresh();await p.adv(8);let x=await p.evaluate(()=>({word:document.getElementById('fetchword').textContent,lamp:document.getElementById('fetchlamp').className,url:document.getElementById('fetchurl').value}));
 ok(x.word==='Not tried yet'&&x.lamp==='lamp big'&&x.url==='https://raw.githubusercontent.com/wocketfone/earth-dashboard/main/public/frame-0.json','T23 starts untried, pointing at the live address');
 const rest=(await p.st()).sel;
 // good
 x=await go(p,{0:mk()});ok(x.f.state==='good'&&x.word==='Good'&&/lamp big good/.test(x.lamp),'T23 good fetch lights green and says Good: '+x.word);ok(/^Frame 7, made 60 minutes ago\. It passed every check\. The tubes walk quietly/.test(x.msg),'T23 good message: '+x.msg);
 ok(x.asked.length===1&&/frame-0\.json\?t=\d+$/.test(x.asked[0]),'T23 asks for frame-0 once, past any cache: '+x.asked);ok(x.scen==='live'&&x.f.live&&JSON.parse(x.box).seq===7&&!x.off,'T23 the page shows it is on live data and the button is free again');
 let s=await p.st();ok(s.phase!=='sweep'&&s.phase!=='idle','T23 new data walks quietly, no sweep: '+s.phase);await p.adv(.35);s=await p.st();ok(s.sel.every((v,i)=>Math.abs(v-rest[i])<=1),'T23 first move is one digit at most');await p.adv(8);s=await p.st();ok(eq(s.sel,[1,2,3,4,5,6,7,8,9]),'T23 tubes land on the fetched digits: '+s.sel);
 await p.press(1);await p.adv(12);ok(eq((await p.st()).sel,[9,8,7,6,5,4,3,2,1]),'T23 the buttons read the fetched file');await p.press(0);await p.adv(12);
 x=await go(p,{0:mk()});ok(x.f.state==='good'&&/Nothing has changed since the last fetch/.test(x.msg),'T23 same file again: good, nothing changed');
 // bad in every way; the last good frame stays each time
 for(const [label,table,want] of [['no connection',{0:'throw'},/Couldn't reach the address/],['404',{0:404},/answered 404, which means there's no file/],['500',{0:500},/answered 500\./],['a web page',{0:'<html>Moved</html>'},/failed the board's checks.*valid JSON/],
   ['a digit 0',{0:mk({d:['023456789','987654321','555555555','555555555']})},/Button 1: "d"/],['wrong version',{0:mk({v:2})},/"v" must be 1/],['three rows',{0:mk({d:['123456789','987654321','555555555']})},/four strings/],['empty file',{0:''},/valid JSON/]]){
   x=await go(p,table);ok(x.f.state==='bad'&&x.word==='Bad'&&/lamp big bad/.test(x.lamp),`T23 ${label}: red and Bad`);ok(want.test(x.msg)&&/The tubes keep the last good frame\.$/.test(x.msg),`T23 ${label}: says why: ${x.msg}`);
   await p.adv(4);ok(eq((await p.st()).sel,[1,2,3,4,5,6,7,8,9])&&x.f.seq===7&&!x.off,`T23 ${label}: last good frame stays`)}
 // recovery, and old data
 x=await go(p,{0:mk({seq:8,made:'2026-11-13T17:30:00Z',d:['555555555','987654321','555555555','555555555']})});ok(x.f.state==='good'&&/Frame 8, made 30 minutes ago/.test(x.msg)&&/walk quietly/.test(x.msg),'T23 a good fetch after bad ones turns green again');await p.adv(8);ok(eq((await p.st()).sel,[5,5,5,5,5,5,5,5,5]),'T23 and the tubes follow');
 x=await go(p,{0:mk({seq:9,made:'2026-11-10T06:00:00Z'})});ok(x.f.state==='old'&&x.word==='Old'&&/lamp big old/.test(x.lamp)&&/made 4 days ago/.test(x.msg)&&/fetcher has stopped/.test(x.msg),'T23 a file older than 26 hours is flagged Old: '+x.msg);await p.adv(10);ok(eq((await p.st()).sel,[1,2,3,4,5,6,7,8,9]),'T23 old data is still shown');
 x=await go(p,{0:mk({seq:9,made:'2026-11-12T16:30:00Z'})});ok(x.f.state==='good'&&/made 26 hours ago/.test(x.msg),'T23 25.5 hours old is still good: '+x.msg);
 x=await go(p,{0:mk({made:'2026-11-13T18:00:20Z'})});ok(x.f.state==='good'&&/made just now/.test(x.msg),'T23 a clock a few seconds out reads as just now');
 // a bad address, and a double press
 await p.fill('#fetchurl','frame-0.json');x=await go(p,{0:mk()});ok(x.f.state==='bad'&&/has to start with http/.test(x.msg)&&x.asked.length===0,'T23 an address with no http is refused before any call');
 await p.fill('#fetchurl','https://example.org/x/frame-0.json?v=1');x=await go(p,{0:mk()});ok(x.f.state==='good'&&/frame-0\.json\?v=1&t=\d+$/.test(x.asked[0]),'T23 a custom address is used as typed: '+x.asked[0]);
 const two=await p.evaluate(async([f,now])=>{let release;const gate=new Promise(r=>release=r);let calls=0;const fk=async()=>{calls++;await gate;return{ok:true,status:200,text:async()=>JSON.stringify(f)}};const a=window.__emu.fetchLive(fk,now),mid={word:document.getElementById('fetchword').textContent,lamp:document.getElementById('fetchlamp').className,off:document.getElementById('fetchnow').disabled},b=await window.__emu.fetchLive(fk,now);release();const ra=await a;return{calls,b,ra,mid}},[mk(),NOW]);
 ok(two.calls===1&&two.b===null&&two.ra.state==='good','T23 a second press while fetching is ignored');ok(two.mid.word==='Fetching'&&/busy/.test(two.mid.lamp)&&two.mid.off,'T23 while fetching the lamp pulses and the button is off');await p.close();
 // the real button, with the real network call failing: honest red, nothing breaks
 p=await fresh();await p.adv(8);const b4=(await p.st()).sel;await p.route('**/frame-0.json*',r=>r.abort());await p.click('#fetchnow');await p.waitForFunction(()=>!window.__emu.fetched().busy&&window.__emu.fetched().state!=='none'&&window.__emu.fetched().state!=='busy');
 x=await p.evaluate(()=>({f:window.__emu.fetched(),word:document.getElementById('fetchword').textContent}));ok(x.f.state==='bad'&&x.word==='Bad'&&/Couldn't reach/.test(x.f.msg),'T23 clicking the button with the network blocked: Bad, with the reason');await p.adv(3);ok(eq((await p.st()).sel,b4)&&p.errs.length===0,'T23 and the display is untouched, no script errors');
 await p.unroute('**/frame-0.json*');await p.route('**/frame-0.json*',r=>r.fulfill({status:200,contentType:'text/plain',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(mk({made:new Date(Date.now()-120000).toISOString()}))}));
 await p.click('#fetchnow');await p.waitForFunction(()=>window.__emu.fetched().state==='good');x=await p.evaluate(()=>window.__emu.fetched());ok(/Frame 7, made 2 minutes ago/.test(x.msg),'T23 clicking the button with the network answering: Good: '+x.msg);await p.adv(10);ok(eq((await p.st()).sel,[1,2,3,4,5,6,7,8,9]),'T23 real click drives the tubes');
 await p.selectOption('#scen','calm');await p.adv(8);ok(!(await p.evaluate(()=>window.__emu.fetched().live))&&eq((await p.st()).sel,[5,5,5,5,5,5,5,5,5]),'T23 choosing a made-up set leaves live data');
 await p.selectOption('#scen','live');await p.waitForFunction(()=>window.__emu.fetched().live);await p.adv(10);ok(eq((await p.st()).sel,[1,2,3,4,5,6,7,8,9])&&(await p.inputValue('#scen'))==='live','T23 choosing Live data in the list fetches');await p.close();
 // live data and the covered button
 p=await fresh();await p.adv(8);const e0=mk({ready:true,d:['999999999','999999999','999999999','555555555']}),e1=mk({seq:1,era:1,glow:'7A5CFF',d:['666666666','666666666','666666666','111111111']});
 x=await go(p,{0:e0,1:e1});ok(x.f.state==='good'&&x.asked.length===2&&/frame-1\.json/.test(x.asked[1])&&x.f.next,'T23 a lit lamp makes it fetch the next scale too: '+x.asked.length);await p.adv(10);s=await p.st();ok(s.ready&&s.era===0&&eq(s.sel,[9,9,9,9,9,9,9,9,9]),'T23 lamp lit, still on scale 0');
 ok(await p.evaluate(()=>window.__emu.pressReset()),'T23 the covered button works on live data');await p.adv(14);s=await p.st();ok(s.era===1&&s.glow==='7A5CFF'&&eq(s.sel,[6,6,6,6,6,6,6,6,6]),'T23 the board moves to scale 1 with its colour: '+s.sel);
 x=await go(p,{0:e0,1:{...e1,seq:2,d:['777777777','666666666','666666666','111111111']}});ok(x.asked.length===1&&/frame-1\.json/.test(x.asked[0])&&x.f.era===1&&x.f.state==='good','T23 after the reset it fetches frame-1, not frame-0: '+x.asked);await p.adv(6);ok(eq((await p.st()).sel,[7,7,7,7,7,7,7,7,7]),'T23 and shows it');
 await p.close();p=await fresh();await p.adv(8);x=await go(p,{0:e0,1:404});ok(x.f.state==='good'&&!x.f.next,'T23 lamp lit but the next file missing: still good');ok(!(await p.evaluate(()=>window.__emu.pressReset())),'T23 and the covered button safely does nothing');
 x=await go(p,{0:e0,1:mk({era:3})});ok(!x.f.next,'T23 a next file that is for the wrong scale is not used');await p.close()}
console.log(`PASS ${pass}  FAIL ${fail}`);fails.forEach(f=>console.log(' x',f));await b.close()})()
