const s=require('./series.js');let pass=0,fail=0;const ok=(c,msg)=>{if(c)pass++;else{fail++;console.log(' x',msg)}};const near=(a,b,e=1e-9)=>Math.abs(a-b)<e;
const day=(d0,n)=>new Date(Date.parse(d0+'T00:00:00Z')+n*s.DAY).toISOString().slice(0,10);
const rows=Array.from({length:400},(_,i)=>({date:day('2025-10-10',i),value:i}));const end=rows[399].date;
ok(s.windowMean(rows,end,1)===399,'1-day window is the last value');ok(near(s.windowMean(rows,end,90),399-44.5),'90-day mean');ok(near(s.windowMean(rows,end,365),399-182),'365-day mean');ok(s.windowMean(rows,'2020-01-01',90)===null,'no data in window gives null');
const monthly=[{date:'2026-08-15',value:1},{date:'2026-09-15',value:2},{date:'2026-10-15',value:3}];ok(s.windowMean(monthly,'2026-10-15',1)===3&&near(s.windowMean(monthly,'2026-10-15',90),2),'monthly series: 90 days covers three months');
// ice: a perfect seasonal cycle has z = 0; adding one sd gives z = 1
const ice=[];for(let y=2001;y<=2020;y++)for(let t=Date.UTC(y,0,1);t<Date.UTC(y+1,0,1);t+=s.DAY){const d=new Date(t).toISOString().slice(0,10),doy=(t-Date.UTC(y,0,1))/s.DAY;ice.push({date:d,value:10+4*Math.cos(2*Math.PI*doy/365.25)+((y%2)?0.5:-0.5)})}
const clim=s.iceClimatology(ice);ok(Object.keys(clim).length===366,'climatology has every calendar day: '+Object.keys(clim).length);ok(near(clim['07-01'].sd,0.5,0.06),'spread recovered: '+clim['07-01'].sd);
const z=s.iceZ([{date:'2026-07-01',value:clim['07-01'].mean},{date:'2026-07-02',value:clim['07-02'].mean-2*clim['07-02'].sd}],clim);ok(near(z[0].value,0)&&near(z[1].value,-2),'z scores');
ok(JSON.stringify(s.pairMean([{date:'a',value:2},{date:'b',value:4}],[{date:'b',value:-2}]))===JSON.stringify([{date:'b',value:1}]),'pair mean needs both poles');
// quakes
const ev=[{date:'2026-01-01',time:Date.parse('2026-01-01T05:00:00Z'),value:10},{date:'2026-01-01',time:Date.parse('2026-01-01T20:00:00Z'),value:5},{date:'2026-01-03',time:Date.parse('2026-01-03T01:00:00Z'),value:7}];
const d=s.dailySums(ev,'2026-01-01','2026-01-04');ok(JSON.stringify(d.map(x=>x.value))==='[15,0,7,0]','daily sums with quiet days');ok(JSON.stringify(s.rollingSums(d,2))==='[15,7,7]','rolling sums');ok(JSON.stringify(s.rollingSums(d,1))==='[15,0,7,0]','rolling 1');
ok(s.energySince(ev,Date.parse('2026-01-03T02:00:00Z'),24)===7&&s.energySince(ev,Date.parse('2026-01-01T21:00:00Z'),24)===15&&s.energySince(ev,Date.parse('2026-01-10T00:00:00Z'),24)===0,'energy in the last 24 hours');
ok(s.baseline([{date:'2000-12-31',value:1},{date:'2001-01-01',value:2},{date:'2020-12-31',value:3},{date:'2021-01-01',value:4}]).length===2,'baseline is 2001 through 2020');
// compared with the last ten years: a steady climb of 0.02 a year, with this year 0.3 above the line
{const mrows=[];for(let y=2010;y<=2026;y++)for(let mo=1;mo<=12;mo++){if(y===2026&&mo>10)continue;mrows.push({date:`${y}-${String(mo).padStart(2,'0')}-15`,value:0.02*(y-2010)+0.1*Math.sin(mo)+(y===2026?0.3:0)})}
 ok(near(s.vsRecentYears(mrows,1),0.02*5.5+0.3,1e-9),'vs last ten years, one month: '+s.vsRecentYears(mrows,1));ok(near(s.vsRecentYears(mrows,3),0.02*5.5+0.3,1e-9),'vs last ten years, three months');
 ok(s.vsRecentYears(mrows.filter(r=>r.date>='2020'),1)===null,'too little history gives no reading');ok(s.vsRecentYears([],1)===null,'no data gives no reading');
 const gappy=mrows.filter(r=>!(r.date.startsWith('2019')||r.date.startsWith('2021')));ok(s.vsRecentYears(gappy,1)!==null,'two missing years out of ten is still enough');ok(s.vsRecentYears(mrows.filter(r=>!/^201[6-9]/.test(r.date)),1)===null,'four missing years is not')}
console.log(`series: PASS ${pass}  FAIL ${fail}`);process.exit(fail?1:0);
