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
{for(const [day,want] of [['2026-11-13','2016-11-14'],['2028-02-29','2018-03-01'],['2028-02-28','2018-03-01'],['2030-03-01','2020-03-02'],['2027-01-01','2017-01-02'],['2030-12-31','2021-01-01'],['2034-02-28','2024-02-29']])ok(s.tenYearsBefore(day)===want,`ten years before ${day} starts ${want}, got ${s.tenYearsBefore(day)}`);
 for(let y=2026;y<2060;y++)for(const md of ['01-01','02-28','03-01','06-30','12-31']){const from=s.tenYearsBefore(`${y}-${md}`),n=Math.round((s.toMs(`${y}-${md}`)-s.toMs(from))/s.DAY)+1;ok(n===3652||n===3653,`ten years ending ${y}-${md} hold ${n} days`)}
 const h=s.parseHistory('date,year_digits\r\n2026-01-02,123456789\r\njunk\n2026-01-01,5-5-5-5-5\n2026-01-02,999999999\n2026-01-03,12345678\n2026-01-04,1234567890\n2026-01-05,123456780\n\n');
 ok(JSON.stringify(h)===JSON.stringify([{date:'2026-01-01',digits:'5-5-5-5-5'},{date:'2026-01-02',digits:'999999999'}]),'history: keeps good lines, sorts them, later repeat wins, drops short, long and zero lines: '+JSON.stringify(h));
 ok(s.parseHistory('').length===0&&s.parseHistory(undefined).length===0&&s.parseHistory('date,year_digits\n').length===0,'history: empty file is no days')}
{// leap years. Ice: 29 February must have a normal over twenty years and over ten, and read like its neighbours.
 const D=s.DAY,iso=t=>new Date(t).toISOString().slice(0,10),mk=(a,b,fn)=>{const o=[];for(let t=Date.parse(a);t<=Date.parse(b);t+=D)o.push({date:iso(t),value:fn(iso(t))});return o};
 const ice=d=>10+3*Math.cos(2*Math.PI*((Date.parse(d)-Date.UTC(+d.slice(0,4),0,1))/D)/365.25)+((+d.slice(0,4))%2?0.4:-0.4);
 const rows=mk('2001-01-01','2032-12-31',ice);
 for(const [label,from,to] of [['twenty years','2001-01-01','2020-12-31'],['ten years','2018-03-01','2028-02-29'],['ten years with two leap days','2021-01-01','2030-12-31']]){const c=s.iceClimatology(rows,from,to);
  ok(Object.keys(c).length===366,`ice normal over ${label} covers all 366 calendar days: ${Object.keys(c).length}`);ok(c['02-29']&&Math.abs(c['02-29'].mean-(c['02-28'].mean+c['03-01'].mean)/2)<1e-3&&Math.abs(c['02-29'].sd-(c['02-28'].sd+c['03-01'].sd)/2)<1e-3,`ice normal over ${label}: 29 February sits halfway between its neighbours`);
  const z=s.iceZ(mk('2028-02-26','2028-03-03',ice),c);ok(z.length===7&&z.some(r=>r.date==='2028-02-29'),`ice reading over ${label}: 29 February 2028 gets a reading`);const v=z.map(r=>r.value);ok(Math.max(...v)-Math.min(...v)<0.25,`ice reading over ${label}: no jump across the leap day (${v.map(x=>x.toFixed(2)).join(' ')})`)}
 // the three windows on and around a leap day
 const flat=mk('2015-01-01','2028-03-05',d=>(d>='2028-01-01'?2:1));for(const end of ['2028-02-28','2028-02-29','2028-03-01']){const r=flat.filter(x=>x.date<=end);ok(Math.abs(s.windowMean(r,end,1)-2)<1e-9&&Math.abs(s.vsRecentDays(r,1)-1)<1e-9,`daily windows ending ${end} read right`);const y=s.windowMean(r,end,365),inYear=Math.round((Date.parse(end)-Date.parse('2027-12-31'))/D);ok(Math.abs(y-(1+inYear/365))<1e-9,`the 365-day window ending ${end} holds exactly 365 days`)}
 // the year after a leap day: 28 February 2029 looks back to 28 February of earlier years, including leap ones
 const byDate=new Map(mk('2015-01-01','2029-03-05',d=>(d.slice(5)==='02-29'?99:1)).map(r=>[r.date,r.value]));ok(Math.abs(s.vsRecentAt(byDate,'2029-02-28',1,10,0))<1e-9,'with no widening, 28 February compares only with earlier 28 Februaries');
 ok(s.vsRecentAt(byDate,'2028-02-29',1,10,0)!==null,'29 February with no widening still finds earlier years');
 // monthly figures: February is one month whatever its length, and 2100 is not a leap year
 const months=[];for(let y=2010;y<=2028;y++)for(let m=1;m<=12;m++)months.push({date:`${y}-${String(m).padStart(2,'0')}-15`,value:y>=2028?2:1});const feb=months.filter(r=>r.date<='2028-02-15');ok(Math.abs(s.vsRecentYears(feb,1)-1)<1e-9&&Math.abs(s.vsRecentYears(feb,3)-(2/3))<1e-9,'monthly comparison in a leap February: '+s.vsRecentYears(feb,3));
 ok(s.tenYearsBefore('2100-02-28')==='2090-03-01'&&s.tenYearsBefore('2104-02-29')==='2094-03-01'&&s.tenYearsBefore('2110-03-01')==='2100-03-02','ten years back across 2100, which has no leap day');
 const century=new Map(mk('2088-01-01','2104-03-01',()=>1).map(r=>[r.date,r.value]));ok(s.vsRecentAt(century,'2104-02-29',1)===0&&s.vsRecentAt(century,'2100-03-01',90)===0,'daily comparison across 2100 works')}
console.log(`series: PASS ${pass}  FAIL ${fail}`);process.exit(fail?1:0);
