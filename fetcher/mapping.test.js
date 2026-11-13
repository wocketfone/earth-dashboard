const m=require('./mapping.js');let pass=0,fail=0;const ok=(c,msg)=>{if(c)pass++;else{fail++;console.log(' x',msg)}};const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// rounding and clamps
[[0,5],[0.49,5],[0.5,6],[-0.5,5],[-0.51,4],[1.5,7],[-1.5,4],[3.49,8],[3.5,9],[9,9],[-3.5,2],[-3.51,1],[-40,1],[2.4999,7]].forEach(([p,d])=>ok(m.rawDigit(p)===d,`raw ${p} -> ${m.rawDigit(p)} want ${d}`));
for(let p=-6;p<=6;p+=0.01){const d=m.rawDigit(p);ok(d>=1&&d<=9&&Number.isInteger(d),'raw range '+p)}
ok(m.digit(null,5)===null&&m.digit(NaN,5)===null&&m.digit(undefined,null)===null,'no reading stays no reading');
// deadband
ok(m.digit(0.55,5)===5,'0.55 with prev 5 holds');ok(m.digit(0.64,5)===5,'0.64 holds');ok(m.digit(0.65,5)===6,'0.65 moves');ok(m.digit(0.55,null)===6,'no previous: plain rounding');
ok(m.digit(0.45,6)===6,'falling 0.45 with prev 6 holds');ok(m.digit(0.36,6)===6,'0.36 holds');ok(m.digit(0.34,6)===5,'0.34 drops');
ok(m.digit(2.6,5)===8,'a big move jumps straight to the right digit');ok(m.digit(3.4,9)===9,'prev 9 holds at 3.4');ok(m.digit(3.3,9)===8,'prev 9 releases at 3.3');ok(m.digit(-3.4,1)===1&&m.digit(-3.3,1)===2,'prev 1 mirrors');ok(m.digit(50,9)===9&&m.digit(-50,1)===1,'pins hold');
// a value wobbling on a boundary must not chatter
{let d=null,changes=0;for(let i=0;i<400;i++){const p=-2.5+0.1*Math.sin(i/3);const n=m.digit(p,d);if(d!==null&&n!==d)changes++;d=n}ok(changes===0,'wobble of 0.1 step on the 2/3 line: '+changes+' changes')}
{let d=null,changes=0;for(let i=0;i<400;i++){const p=-2.5+0.3*Math.sin(i/3);const n=m.digit(p,d);if(d!==null&&n!==d)changes++;d=n}ok(changes>0,'a real swing of 0.3 step does move it')}
// a slow ramp visits every digit once, in order
{let d=null,seq=[];for(let p=-5;p<=5;p+=0.001){const n=m.digit(p,d);if(n!==d)seq.push(n);d=n}ok(eq(seq,[1,2,3,4,5,6,7,8,9]),'ramp up '+seq);d=null;seq=[];for(let p=5;p>=-5;p-=0.001){const n=m.digit(p,d);if(n!==d)seq.push(n);d=n}ok(eq(seq,[9,8,7,6,5,4,3,2,1]),'ramp down '+seq)}
// first-pass readings reproduce (NOAA stand-in series: ocean normal 0.54, air 0.71 on their own reference)
const R=m.RULES,lin=(n,s)=>({transform:'linear',normal:n,step:s});
ok(eq([1.10,1.067,0.91].map(v=>m.digit(m.position(v,lin(0.54,0.2)))),[8,8,7]),'OCEAN 8,8,7');
ok(eq([1.33,1.277,1.151].map(v=>m.digit(m.position(v,lin(0.71,0.2)))),[8,8,7]),'ATMOS 8,8,7');
ok(m.digit(m.position(426.1,R.CHEMO))===7,'CHEMO 7');ok(m.digit(m.position(461,R.CHEMO))===9&&m.digit(m.position(460,R.CHEMO))===8,'CHEMO reaches 9 at 461 ppm');
ok(m.digit(m.position(-1.87,R.CRYO))===3,'CRYO 3');ok(m.digit(m.position(-1.87,R.CRYO),2)===2,'CRYO holds 2 if it was 2');ok(m.digit(m.position(-1.87,R.CRYO),3)===3,'CRYO holds 3 if it was 3');
// SOLAR curve uses the whole dial
ok(m.digit(m.position(0,R.SOLAR))===1,'spotless sun reads 1');ok(m.digit(m.position(56.9,R.SOLAR))===5,'average sun reads 5');ok(m.digit(m.position(124,R.SOLAR))===7,'today 124 reads 7');ok(m.digit(m.position(250,R.SOLAR))===9,'250 reads 9');
{const seen=new Set();for(let s=0;s<=300;s++)seen.add(m.digit(m.position(s,R.SOLAR)));ok(seen.size===9,'SOLAR can show all nine digits: '+[...seen].sort())}
{let prev=0,mono=true;for(let s=0;s<=300;s++){const d=m.digit(m.position(s,R.SOLAR));if(d<prev)mono=false;prev=d}ok(mono,'SOLAR never goes down as spots go up')}
// CYCLO: digits follow the official El Nino strengths
{const C=R.CYCLO,g=v=>m.digit(m.position(v,C));ok(g(0)===5&&g(0.3)===5&&g(0.49)===5&&g(0.5)===6&&g(0.99)===6&&g(1.0)===7&&g(1.49)===7&&g(1.5)===8&&g(1.99)===8&&g(2.0)===9&&g(3.2)===9&&g(-0.49)===5,'CYCLO El Nino: neutral 5, weak 6, moderate 7, strong 8, very strong 9');ok(g(-0.5)===4&&g(-1.0)===3&&g(-1.5)===2&&g(-2.1)===1,'CYCLO La Nina mirrors it: '+[g(-0.5),g(-1),g(-1.5),g(-2.1)]);ok(!R.CYCLO.counts&&!R.PALIN.counts&&!R.SOLAR.counts&&!R.LITHO.counts&&R.OCEAN.counts&&R.ATMOS.counts&&R.CRYO.counts&&R.CHEMO.counts&&R.ANTH.counts,'which tubes count toward a reset');ok(m.digit(m.position(0.52,C),5)===5&&m.digit(m.position(0.6,C),5)===6&&m.digit(m.position(0.45,C),6)===6&&m.digit(m.position(0.4,C),6)===5,'CYCLO still has a deadband at each threshold')}
// steady rule: like-with-like windows
{const days=[];let s=7;for(let i=0;i<7300;i++){s=(s*16807)%2147483647;const u=s/2147483647;days.push(10**(12+2*u))}const r=m.steadyRule(days,'log10');
 ok(Math.abs(Math.log10(r.normal)-13)<0.05,'steady normal is the median');ok(Math.abs(r.step-0.3)<0.01,'steady step spans the middle 90% over six steps: '+r.step.toFixed(3));
 const ds=days.map(v=>m.digit(m.position(v,r)));const pin=ds.filter(d=>d===1||d===9).length/ds.length;ok(pin<0.11,'pinned under 11% of ordinary days: '+pin.toFixed(3));ok(m.digit(m.position(r.normal,r))===5,'median day reads 5')}
// encode
ok(m.encode([6,8,8,3,7,null,null,5,7])==='68837--57','encode');
// reset rule
{const day=a=>a,calm=[5,7,7,3,7,5,6,5,7],hot=[5,9,9,1,7,5,6,5,7];
 ok(!m.resetDue(Array(365).fill(calm)),'no reset when nothing is pinned');ok(m.resetDue(Array(365).fill(hot)),'three counting tubes pinned for a year: reset');ok(!m.resetDue(Array(364).fill(hot)),'364 days is not enough');
 const h=Array(365).fill(hot).map(x=>x.slice());h[200][1]=8;ok(!m.resetDue(h),'one day off the pin breaks the run');
 ok(!m.resetDue(Array(365).fill([1,9,9,5,7,1,6,5,1])),'steady tubes at 1 do not count (quiet sun, quiet earth)');ok(!m.resetDue(Array(365).fill([5,9,9,3,7,5,6,5,7])),'two pinned is not enough');
 ok(m.resetDue(Array(400).fill(calm).concat(Array(365).fill(hot))),'only the last 365 days matter')}
// memory digit after a reset: old normal on the new scale
ok(m.memoryDigit(390.6,{...R.CHEMO,normal:455})===2,'CHEMO old normal reads 2 on a 455 ppm normal');ok(m.memoryDigit(0,{...R.OCEAN,normal:1.2})===1,'OCEAN old normal pins at 1');ok(R.OCEAN.step===0.3&&R.ATMOS.step===0.3&&R.OCEAN.recentStep===0.1&&R.ATMOS.recentStep===0.1,'OCEAN and ATMOS steps');ok(m.memoryDigit(0,{...R.CRYO,normal:-2.2})===8,'CRYO old normal leans right');ok(m.memoryDigit(5,{transform:'linear',normal:5,step:1})===5,'unchanged normal reads 5');

// reset rule with gaps in the data
{const hot=[5,9,9,1,7,5,6,5,7],gap=[5,null,9,1,7,5,6,5,7];const h=Array(365).fill(hot).map(x=>x.slice());for(let i=0;i<30;i++)h[i*10]=gap;ok(m.resetDue(h),'30 missing days do not break a run');
 const h2=Array(365).fill(gap);ok(!m.resetDue(h2),'a tube with no readings cannot count as pinned');const h3=Array(365).fill(hot).map(x=>x.slice());for(let i=0;i<100;i++)h3[i]=gap;ok(!m.resetDue(h3),'too few real readings: not pinned')}
// stability: applying the rule twice changes nothing, and the digit never sits more than one from plain rounding
for(let p=-5;p<=5;p+=0.013)for(let prev=1;prev<=9;prev++){const d=m.digit(p,prev);ok(m.digit(p,d)===d,`stable at p=${p.toFixed(3)} prev=${prev}`);ok(Math.abs(d-m.rawDigit(p))<=1,`within one of rounding at p=${p.toFixed(3)} prev=${prev}`)}
// odd inputs
ok(m.digit(m.position(0,{transform:'log10',normal:1e13,step:0.3}))===1,'zero energy pins at 1');ok(m.digit(m.position(-5,{transform:'log10',normal:1e13,step:0.3}))===null,'a negative energy is no reading');ok(m.digit(m.position(-3,m.RULES.SOLAR))===1,'negative spots treated as none');ok(m.position(null,m.RULES.CHEMO)===null&&m.position(undefined,m.RULES.CHEMO)===null,'missing value is no reading');
// frame builder reproduces the first-pass file exactly
{const P=(v,r)=>m.position(v,r),lin=(n,s)=>({transform:'linear',normal:n,step:s}),o=lin(0.54,0.2),a=lin(0.71,0.2),S=m.RULES.SOLAR,C=m.RULES.CHEMO;
 const pos=[[null,P(1.10,o),P(1.33,a),-1.87/0.75,P(426.1,C),null,null,0,P(124,S)],[-0.27,P(1.067,o),P(1.277,a),null,P(426.1,C),null,null,0,null],[-0.87,P(0.91,o),P(1.151,a),null,P(426.1,C),null,null,0,P(123.2,S)]];
 const f=m.buildFrame({seq:2,made:'2026-11-13T06:00:00Z',positions:pos});ok(eq(f.d,['-8837--57','588-7--5-','477-7--57','555555555']),'builder digits match the first-pass file: '+f.d);ok(eq(f.slow,['011000010','000000010','000000000','000000000']),'builder slow flags: monthly and yearly sources light their lamps: '+f.slow);ok(m.validateFrame(f)===null,'built file passes the board checks');
 // deadband carries across files
 const pos2=pos.map(r=>r.slice());pos2[0][3]=-2.55;const f2=m.buildFrame({seq:3,made:'2026-11-14T06:00:00Z',positions:pos2,previous:f.d});ok(f2.d[0][3]==='3','CRYO holds 3 across files at -2.55');pos2[0][3]=-2.70;const f3=m.buildFrame({seq:4,made:'2026-11-15T06:00:00Z',positions:pos2,previous:f2.d});ok(f3.d[0][3]==='2','CRYO moves to 2 at -2.70');
 pos2[0][3]=-2.45;const f4=m.buildFrame({seq:5,made:'2026-11-16T06:00:00Z',positions:pos2,previous:f3.d});ok(f4.d[0][3]==='2','and holds 2 on the way back at -2.45');
 // a reading that disappears then returns
 pos2[0][1]=null;const f5=m.buildFrame({seq:6,made:'2026-11-17T06:00:00Z',positions:pos2,previous:f4.d});ok(f5.d[0][1]==='-'&&f5.slow[0][1]==='0','lost reading is a dash with no slow flag');
 // era 1 with memory baseline
 const f6=m.buildFrame({seq:7,made:'2036-01-01T06:00:00Z',era:1,glow:'7a5cff',positions:pos,baseline:[5,1,1,9,1,5,1,1,5]});ok(f6.d[3]==='511915115'&&f6.era===1&&m.validateFrame(f6)===null,'era 1 file with memory baseline');
 let threw=false;try{m.buildFrame({seq:-1,made:'x',positions:pos})}catch(e){threw=true}ok(threw,'builder refuses to publish a bad file');
 // validator rejects what the board must reject
 const bad=[{...f,v:2},{...f,seq:1.5},{...f,poll:5},{...f,made:'soon'},{...f,era:-1},{...f,ready:1},{...f,glow:'#fff'},{...f,d:f.d.slice(0,3)},{...f,d:['0'.repeat(9),...f.d.slice(1)]},{...f,slow:['2'.repeat(9),...f.slow.slice(1)]},null,[],'text'];bad.forEach((b,i)=>ok(m.validateFrame(b)!==null,'validator rejects bad file '+i));
 // random frames always validate and stay in range
 let s=11;const rnd=()=>{s=(s*16807)%2147483647;return s/2147483647};let prev=null,allok=true;for(let n=0;n<500;n++){const pp=[0,1,2].map(()=>Array.from({length:9},()=>rnd()<0.1?null:(rnd()-0.5)*12));const ff=m.buildFrame({seq:n,made:'2026-11-13T06:00:00Z',positions:pp,previous:prev});if(m.validateFrame(ff)!==null||/0/.test(ff.d.join('')))allok=false;prev=ff.d}ok(allok,'500 random frames all valid, never a 0')}
console.log(`mapping: PASS ${pass}  FAIL ${fail}`);process.exit(fail?1:0);
