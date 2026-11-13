// End-to-end test of the normals job and the frame job, with no network.
// It writes made-up source files whose right answers can be worked out by hand, runs both jobs, and checks the results.
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const M = require('./mapping.js');
let pass = 0, fail = 0; const ok = (c, msg) => { if (c) pass++; else { fail++; console.log(' x', msg); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const DAY = 86400000, NOW = '2026-11-13T12:00:00Z';
const pad = n => String(n).padStart(2, '0'), iso = t => new Date(t).toISOString().slice(0, 10);
const days = (from, to) => { const out = []; for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += DAY) out.push(iso(t)); return out; };
const months = (y0, y1, lastMonth) => { const out = []; for (let y = y0; y <= y1; y++) for (let m = 1; m <= 12; m++) { if (y === y1 && m > lastMonth) break; out.push([y, m]); } return out; };

function fixtures(dir, opt = {}) {
  fs.mkdirSync(dir, { recursive: true }); const w = (id, text) => fs.writeFileSync(path.join(dir, id + '.txt'), text);
  const hot = opt.hot;                                                                     // a world that jumped in 2018 and stayed there
  const temp = ([y]) => (hot ? (y >= 2018 ? 2.5 : 0.5) : y >= 2026 ? 0.8 : 0.5);             // otherwise: warm 2026, flat before
  w('ocean-ncei', '# Global Ocean\nDate,Anomaly\n' + months(1990, 2026, 10).map(([y, m]) => `${y}${pad(m)},${temp([y])}`).join('\n') + '\n');
  const g = {}; months(1990, 2026, 10).forEach(([y, m]) => { (g[y] = g[y] || Array(12).fill('***'))[m - 1] = temp([y]); });
  w('atmos-gistemp', 'Land-Ocean: Global Means\nYear,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,J-D\n' + Object.keys(g).map(y => `${y},${g[y].join(',')},***`).join('\n') + '\n');
  w('chemo-monthly', 'year,month,decimal,average,average_unc,trend,trend_unc\n' + months(1979, 2026, 10).map(([y, m]) => `${y},${m},${y},0,0,${hot ? (y >= 2018 ? 480 : 390) : y >= 2026 ? 430 : 390},0`).join('\n') + '\n');
  w('chemo-daily', 'year,month,day,smoothed,trend\n' + days('2016-01-01', '2026-11-12').map(d => `${+d.slice(0, 4)},${+d.slice(5, 7)},${+d.slice(8)},0,${hot ? (d >= '2018-01-01' ? 480 : 390) : d >= '2025-11-01' ? 430 : 390}`).join('\n') + '\n');
  const ice = base => 'Year, Month, Day, Extent, Missing, Source\nYYYY, MM, DD, x, x, x\n' + days('1990-01-01', '2026-11-12').map(d => {
    const y = +d.slice(0, 4), doy = (Date.parse(d + 'T00:00:00Z') - Date.UTC(y, 0, 1)) / DAY, season = base + 4 * Math.cos(2 * Math.PI * doy / 365.25);
    return `${y}, ${+d.slice(5, 7)}, ${+d.slice(8)}, ${(y >= 2026 ? season - 1.2 : season + (y % 2 ? 0.5 : -0.5)).toFixed(4)}, 0, x`; }).join('\n') + '\n';
  w('cryo-north', ice(10)); w('cryo-south', ice(12));
  w('solar-silso', days('1990-01-01', '2026-10-31').map(d => `${d.slice(0, 4)};${d.slice(5, 7)};${d.slice(8)};0;${d >= '2025-11-01' ? 100 : 49};1;1;1`).join('\n') + '\n');
  w('solar-eisn', days('2026-11-01', '2026-11-13').map(d => `${d.slice(0, 4)},${d.slice(5, 7)},${d.slice(8)},0,100,1,1,1`).join('\n') + '\n');
  const owid = 'country,year,iso_code,renewables_share_elec,primary_energy_consumption\nFrance,2024,FRA,99,99\n' + Array.from({ length: 41 }, (_, i) => 1985 + i).map(y => `World,${y},OWID_WRL,${y > 2020 ? 32 : 20},${hot ? (y >= 2018 ? 200000 : 100000) : y > 2020 ? 130000 : 100000}`).join('\n') + '\n';
  w('anth-owid', owid); w('palin-owid', owid);
  const nino = { '2026-8': 0.6, '2026-9': 0.6, '2026-10': opt.ninoLatest === undefined ? 1.2 : opt.ninoLatest };
  w('cyclo-nino34', ' YR MON NINO1+2 ANOM NINO3 ANOM NINO4 ANOM NINO3.4 ANOM\n' + months(1982, 2026, 10).map(([y, m]) => `${y} ${m} 20 0 25 0 28 0 26 ${nino[`${y}-${m}`] || 0}`).join('\n') + '\n');
  let seed = 20261113; const quakes = days('2001-01-01', '2026-11-13').flatMap(d => [3, 11, 19].map(h => ({ t: `${d}T${pad(h)}:00:00.000Z`, mag: (5 + ((seed = (seed * 16807) % 2147483647) % 1000) / 1000 * (seed % 97 === 0 ? 2.6 : 1.4)).toFixed(1) })))
    .filter(q => Date.parse(q.t) <= Date.parse(NOW) && !(opt.quietDay && Date.parse(q.t) > Date.parse(NOW) - DAY));
  if (opt.bigQuake) quakes.push({ t: '2026-11-13T10:00:00.000Z', mag: '8.6' });
  w('litho-usgs', 'time,latitude,longitude,depth,mag,magType\n' + quakes.sort((a, b) => (a.t < b.t ? -1 : 1)).map(q => `${q.t},0,0,10,${q.mag},mww`).join('\n') + '\n');
}
function run(script, rootDir, fixDir, env = {}) {
  try { return { code: 0, out: execFileSync('node', [path.join(__dirname, script)], { env: { ...process.env, EARTH_ROOT: rootDir, EARTH_FIXTURES: fixDir, EARTH_NOW: NOW, FRESH: '', ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) }; }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'earth-')), sandbox = name => { const r = path.join(tmp, name), f = path.join(tmp, name + '-fix'); fs.mkdirSync(r); fixtures(f); return [r, f]; };
const J = (r, f) => JSON.parse(fs.readFileSync(path.join(r, f), 'utf8'));
const col = (file, i) => file.d.slice(0, 3).map(row => row[i]).join(''), slowCol = (file, i) => file.slow.slice(0, 3).map(row => row[i]).join('');
const IDX = Object.fromEntries(M.ORDER.map((n, i) => [n, i]));

// A: a clean first run
const [R, F] = sandbox('a');
let r = run('build.js', R, F); ok(r.code !== 0 && /normals-0.json is missing/.test(r.out), 'A build refuses to run without normals');
r = run('normals.js', R, F); ok(r.code === 0, 'A normals job runs: ' + r.out.slice(-200));
const N = J(R, 'data/normals-0.json').tubes;
ok(N.OCEAN.normal === 0.5 && N.ATMOS.normal === 0.5 && N.OCEAN.step === 0.3 && N.OCEAN.recentStep === 0.15, 'A temperature normals: ' + N.OCEAN.normal + ', ' + N.ATMOS.normal);
ok(N.CHEMO.normal === 390 && N.CHEMO.step === 20, 'A CHEMO normal 390'); ok(N.SOLAR.normal === 49 && N.SOLAR.transform === 'sqrt', 'A SOLAR normal 49');
ok(N.ANTH.normal === 100000 && N.ANTH.step === 15000, 'A ANTH normal and 15% step'); ok(N.PALIN.normal === 20 && N.PALIN.step === 6, 'A PALIN normal 20, step 6');
ok(N.CYCLO.normal === 0 && N.CYCLO.step === 0.5 && N.CYCLO.wholeSteps === true, 'A CYCLO rule'); ok(Object.keys(N.CRYO.clim.north).length === 366 && Math.abs(N.CRYO.clim.north['07-01'].sd - 0.5) < 0.05, 'A ice climatology');
ok([1, 90, 365].every(w => N.LITHO.windows[w].step > 0 && N.LITHO.windows[w].normal > 0), 'A LITHO has a normal and a step for each window');
ok(M.ORDER.every(n => !N[n].error), 'A every tube has a normal');
r = run('build.js', R, F); ok(r.code === 0, 'A frame job runs: ' + r.out.slice(-300));
let f = J(R, 'public/frame-0.json'), st = J(R, 'status/latest.json');
ok(M.validateFrame(f) === null, 'A frame passes the board checks');
ok(col(f, IDX.OCEAN) === '776' && col(f, IDX.ATMOS) === '776', 'A OCEAN and ATMOS: 0.3 above the last ten years reads 7, 7; year reads 6. Got ' + col(f, IDX.OCEAN) + ' ' + col(f, IDX.ATMOS));
ok(col(f, IDX.CHEMO) === '777', 'A CHEMO 40 ppm above normal reads 7: ' + col(f, IDX.CHEMO)); ok(col(f, IDX.ANTH) === '777' && col(f, IDX.PALIN) === '777', 'A ANTH and PALIN read 7');
ok(col(f, IDX.CYCLO) === '765', 'A CYCLO: 1.2 moderate, 0.8 weak, 0.2 neutral. Got ' + col(f, IDX.CYCLO)); ok(col(f, IDX.SOLAR) === '777', 'A SOLAR 100 spots against 49 reads 7: ' + col(f, IDX.SOLAR));
ok(col(f, IDX.CRYO) === '222', 'A CRYO well below normal reads 2: ' + col(f, IDX.CRYO)); ok(/^[1-9]{3}$/.test(col(f, IDX.LITHO)), 'A LITHO has three readings: ' + col(f, IDX.LITHO));
ok(f.d[3] === '555555555', 'A baseline is nine 5s'); ok(eq(f.slow, ['011001110', '000000110', '000000000', '000000000']), 'A marker lamps: monthly and yearly sources only. Got ' + f.slow);
ok(f.seq === 1 && f.era === 0 && f.ready === false && f.glow === '' && f.made === '2026-11-13T12:00:00.000Z', 'A first frame header');
ok(M.ORDER.every(n => st.tubes[n].ok === true), 'A status says every tube is healthy'); ok(st.tubes.CHEMO.values[0] === 430 && st.tubes.PALIN.values[0] === 32, 'A status carries the real figures');
ok(fs.readFileSync(path.join(R, 'data/year-history.csv'), 'utf8') === `date,year_digits\n2026-11-13,${f.d[2]}\n`, 'A history has one line for today');

// B: nothing changed, so nothing is written
const before = fs.readFileSync(path.join(R, 'public/frame-0.json'), 'utf8');
r = run('build.js', R, F, { EARTH_NOW: '2026-11-13T13:00:00Z' }); ok(r.code === 0 && /Nothing changed/.test(r.out), 'B an hour later with the same data: nothing written');
ok(fs.readFileSync(path.join(R, 'public/frame-0.json'), 'utf8') === before, 'B the file is byte-for-byte the same');
// B2: a stale history line is corrected even when the frame itself doesn't change, and a new day gets its line without a frame write
fs.writeFileSync(path.join(R, 'data/year-history.csv'), 'date,year_digits\n2026-11-13,111111111\n');
r = run('build.js', R, F, { EARTH_NOW: '2026-11-13T14:00:00Z' }); ok(/Nothing changed/.test(r.out) && fs.readFileSync(path.join(R, 'data/year-history.csv'), 'utf8') === `date,year_digits\n2026-11-13,${f.d[2]}\n`, 'B2 stale history line corrected');
ok(fs.readFileSync(path.join(R, 'public/frame-0.json'), 'utf8') === before, 'B2 the frame is still untouched');
// C: the daily refresh
r = run('build.js', R, F, { EARTH_NOW: '2026-11-14T10:00:00Z' }); f = J(R, 'public/frame-0.json');
ok(r.code === 0 && f.made === '2026-11-14T10:00:00.000Z', 'C after 20 hours the file is refreshed'); ok(M.validateFrame(f) === null, 'C still valid');
ok(fs.readFileSync(path.join(R, 'data/year-history.csv'), 'utf8').trim().split('\n').length === 3, 'C history gains one line for the new day, and only one');

// D, E, F: sources fail in different ways and each tube holds its last reading
for (const [label, tube, breakIt] of [['D a source disappears', 'OCEAN', f2 => fs.unlinkSync(path.join(f2, 'ocean-ncei.txt'))], ['E a source returns a web page instead of data', 'ATMOS', f2 => fs.writeFileSync(path.join(f2, 'atmos-gistemp.txt'), '<html><body>Moved</body></html>')],
  ['F the earthquake feed is down', 'LITHO', f2 => fs.unlinkSync(path.join(f2, 'litho-usgs.txt'))], ['F2 both ice files vanish', 'CRYO', f2 => { fs.unlinkSync(path.join(f2, 'cryo-north.txt')); fs.unlinkSync(path.join(f2, 'cryo-south.txt')); }]]) {
  const [r2, f2] = sandbox(label.slice(0, 2).trim() + tube); run('normals.js', r2, f2); run('build.js', r2, f2); const good = J(r2, 'public/frame-0.json');
  breakIt(f2); const res = run('build.js', r2, f2, { EARTH_NOW: '2026-11-13T13:00:00Z' }), bad = J(r2, 'public/frame-0.json'), s2 = J(r2, 'status/latest.json'), i = IDX[tube];
  ok(res.code === 0, label + ': the job still succeeds'); ok(col(bad, i) === col(good, i), `${label}: ${tube} holds ${col(good, i)}, got ${col(bad, i)}`);
  ok(slowCol(bad, i) === '111', `${label}: ${tube}'s lamp lights on every button: ${slowCol(bad, i)}`); ok(s2.tubes[tube].ok === false && /Holding the last reading/.test(s2.tubes[tube].note), label + ': status explains');
  ok(M.ORDER.every((n, k) => k === i || col(bad, k) === col(good, k)), label + ': the other eight tubes are untouched'); ok(bad.seq === good.seq + 1 && M.validateFrame(bad) === null, label + ': a new valid frame is published');
}
// G: a tube that never had data is dark, and everything else works
{ const r2 = path.join(tmp, 'g'), f2 = path.join(tmp, 'g-fix'); fs.mkdirSync(r2); fixtures(f2); fs.unlinkSync(path.join(f2, 'cryo-north.txt'));
  ok(run('normals.js', r2, f2).code === 0, 'G normals job survives a missing source'); ok(J(r2, 'data/normals-0.json').tubes.CRYO.error !== undefined, 'G CRYO has no normal');
  const res = run('build.js', r2, f2), g = J(r2, 'public/frame-0.json'); ok(res.code === 0 && col(g, IDX.CRYO) === '---' && slowCol(g, IDX.CRYO) === '000', 'G CRYO is dark with no lamp: ' + col(g, IDX.CRYO));
  ok(M.ORDER.every((n, k) => n === 'CRYO' || /^[1-9]{3}$/.test(col(g, k))), 'G the other eight tubes read normally'); ok(M.validateFrame(g) === null, 'G valid'); }
// H: earthquakes
{ const r2 = path.join(tmp, 'h'), f2 = path.join(tmp, 'h-fix'); fs.mkdirSync(r2); fixtures(f2); run('normals.js', r2, f2); run('build.js', r2, f2); const calm = col(J(r2, 'public/frame-0.json'), IDX.LITHO);
  fixtures(f2, { bigQuake: true }); run('build.js', r2, f2, { FRESH: '1' }); const big = col(J(r2, 'public/frame-0.json'), IDX.LITHO);
  ok(big[0] === '9', 'H a magnitude 8.6 today pins Today at 9: ' + big); ok(+big[1] >= +calm[1] && +big[2] >= +calm[2], 'H and can only raise the longer windows: ' + calm + ' to ' + big);
  fixtures(f2, { quietDay: true }); run('build.js', r2, f2, { FRESH: '1' }); const quiet = col(J(r2, 'public/frame-0.json'), IDX.LITHO); ok(quiet[0] === '1', 'H a day with no large earthquakes reads 1, not dark: ' + quiet); }
// I: the deadband across runs, and the fresh-start option
{ const r2 = path.join(tmp, 'i'), f2 = path.join(tmp, 'i-fix'); fs.mkdirSync(r2); fixtures(f2); run('normals.js', r2, f2); run('build.js', r2, f2); ok(col(J(r2, 'public/frame-0.json'), IDX.CYCLO)[0] === '7', 'I CYCLO starts at 7');
  fixtures(f2, { ninoLatest: 0.95 }); run('build.js', r2, f2, { EARTH_NOW: '2026-11-13T13:00:00Z' }); ok(col(J(r2, 'public/frame-0.json'), IDX.CYCLO)[0] === '7', 'I 0.95 is just under the line: the tube holds 7');
  run('build.js', r2, f2, { EARTH_NOW: '2026-11-13T14:00:00Z', FRESH: '1' }); ok(col(J(r2, 'public/frame-0.json'), IDX.CYCLO)[0] === '6', 'I a fresh start drops it to 6');
  fixtures(f2, { ninoLatest: 0.6 }); run('build.js', r2, f2, { EARTH_NOW: '2026-11-13T15:00:00Z' }); ok(col(J(r2, 'public/frame-0.json'), IDX.CYCLO)[0] === '6', 'I 0.6 reads 6');
  const h = fs.readFileSync(path.join(r2, 'data/year-history.csv'), 'utf8').trim().split('\n'); ok(h.length === 2 && h[1] === '2026-11-13,' + J(r2, 'public/frame-0.json').d[2], 'I history keeps one line for the day, holding the latest Year digits: ' + h.slice(1)); }
// J: the data goes stale
{ const r2 = path.join(tmp, 'j'), f2 = path.join(tmp, 'j-fix'); fs.mkdirSync(r2); fixtures(f2); run('normals.js', r2, f2); run('build.js', r2, f2);
  const res = run('build.js', r2, f2, { EARTH_NOW: '2027-06-01T12:00:00Z' }), g = J(r2, 'public/frame-0.json');
  ok(res.code === 0 && M.validateFrame(g) === null, 'J seven months with no new data: the job still publishes');
  for (const n of ['CRYO', 'CHEMO', 'SOLAR', 'OCEAN', 'ATMOS', 'CYCLO']) ok(slowCol(g, IDX[n]) === '111', `J ${n}'s lamp is lit on every button: ${slowCol(g, IDX[n])}`);
  ok(slowCol(g, IDX.ANTH) === '110', 'J ANTH is yearly, so it is not stale yet: ' + slowCol(g, IDX.ANTH)); ok(/^[1-9]{3}$/.test(col(g, IDX.CHEMO)), 'J stale tubes keep a reading; they do not go dark');
  ok(col(g, IDX.LITHO) === '111' || col(g, IDX.LITHO)[0] === '1', 'J no earthquakes on record for the day reads 1: ' + col(g, IDX.LITHO)); }

// K to P: the reset. A world that jumped in 2018 pins OCEAN, ATMOS, CHEMO, and ANTH at 9 on the Year button.
const has = (r2, f2) => fs.existsSync(path.join(r2, f2)), text = (r2, f2) => fs.readFileSync(path.join(r2, f2), 'utf8');
const hotBox = name => { const r2 = path.join(tmp, name), f2 = path.join(tmp, name + '-fix'); fs.mkdirSync(r2); fixtures(f2, { hot: true }); run('normals.js', r2, f2); run('build.js', r2, f2); return [r2, f2, J(r2, 'public/frame-0.json')]; };
const pastDays = (n, row) => 'date,year_digits\n' + Array.from({ length: n }, (_, k) => `${iso(Date.parse('2026-11-13T00:00:00Z') - (n - k) * DAY)},${row}`).join('\n') + '\n';
{ const [r2, f2, f0] = hotBox('k'), year = f0.d[2];
  ok(['OCEAN', 'ATMOS', 'CHEMO', 'ANTH'].every(n => year[IDX[n]] === '9'), 'K four counting tubes are pinned at 9 on Year: ' + year); ok(f0.ready === false && !has(r2, 'public/frame-1.json'), 'K no reset on day one');
  fs.writeFileSync(path.join(r2, 'data/year-history.csv'), pastDays(363, year)); let res = run('build.js', r2, f2, { EARTH_NOW: '2026-11-13T13:00:00Z' });
  ok(res.code === 0 && !has(r2, 'data/normals-1.json') && J(r2, 'public/frame-0.json').ready === false, 'K 364 pinned days is one short: no reset');
  const dip = year.split('').map((c, k) => (k === IDX.OCEAN || k === IDX.ATMOS ? '8' : c)).join('');      // two of the four dip to 8 for a single day
  fs.writeFileSync(path.join(r2, 'data/year-history.csv'), pastDays(364, year).split('\n').map((l, k) => (k === 200 ? l.split(',')[0] + ',' + dip : l)).join('\n')); res = run('build.js', r2, f2, { EARTH_NOW: '2026-11-13T13:30:00Z' });
  ok(res.code === 0 && !has(r2, 'data/normals-1.json'), 'K one day off the pin for two tubes leaves only two pinned all year: no reset');
  fs.writeFileSync(path.join(r2, 'data/year-history.csv'), pastDays(364, year)); res = run('build.js', r2, f2, { EARTH_NOW: '2026-11-13T14:00:00Z' });
  ok(res.code === 0 && /Reset due/.test(res.out) && /Scale 1 is live/.test(res.out), 'K 365 pinned days: the reset runs by itself: ' + res.out.slice(-200));
  const n0 = J(r2, 'data/normals-0.json'), n1 = J(r2, 'data/normals-1.json'), a = J(r2, 'public/frame-0.json'), b = J(r2, 'public/frame-1.json');
  ok(n1.era === 1 && n1.since === '2026-11-13' && n1.glow === '7A5CFF' && n1.period === '2016-11-14 to 2026-11-13' && !n1.carried, 'K the new scale is described: ' + n1.period);
  ok(n1.tubes.OCEAN.normal === 2.2667 && n1.tubes.ATMOS.normal === 2.2667, 'K temperature normal is the ten-year average, 2.2667: ' + n1.tubes.OCEAN.normal);
  ok(n1.tubes.CHEMO.normal === 469.5 && n1.tubes.ANTH.normal === 188889 && n1.tubes.PALIN.normal === 26.67 && n1.tubes.CYCLO.normal === 0, 'K CHEMO 469.5, ANTH 188889, PALIN 26.67, CYCLO 0: ' + [n1.tubes.CHEMO.normal, n1.tubes.ANTH.normal, n1.tubes.PALIN.normal]);
  ok(['OCEAN', 'ATMOS', 'CHEMO', 'CRYO', 'SOLAR', 'ANTH', 'PALIN', 'CYCLO'].every(n => n1.tubes[n].step === n0.tubes[n].step) && n1.tubes.OCEAN.recentStep === 0.15 && [1, 90, 365].every(w => n1.tubes.LITHO.windows[w].step === n0.tubes.LITHO.windows[w].step), 'K every step is unchanged');
  ok(n1.tubes.CRYO.clim.north['07-01'].sd === n0.tubes.CRYO.clim.north['07-01'].sd && n1.tubes.CRYO.clim.north['07-01'].mean !== n0.tubes.CRYO.clim.north['07-01'].mean, 'K ice: the usual extent moves, the spread stays');
  const mem = Object.fromEntries(M.ORDER.map((n, i) => [n, n1.memory[i]]));
  ok(mem.OCEAN === 1 && mem.ATMOS === 1 && mem.CHEMO === 2 && mem.ANTH === 1 && mem.PALIN === 4 && mem.CYCLO === 5 && mem.SOLAR === 5 && mem.CRYO === 5 && mem.LITHO >= 1 && mem.LITHO <= 9, 'K button 4 shows the old normal on the new scale: ' + n1.memory.join(''));
  ok(a.ready === true && a.era === 0 && a.glow === '' && eq(a.d, f0.d) && a.d[3] === '555555555' && a.seq === f0.seq + 1 && M.validateFrame(a) === null, 'K frame-0 keeps its readings and lights the lamp');
  ok(b.era === 1 && b.ready === false && b.glow === '7A5CFF' && b.seq === 1 && M.validateFrame(b) === null && b.d[3] === n1.memory.join(''), 'K frame-1 is a valid file for the new scale: ' + JSON.stringify(b));
  ok(['OCEAN', 'ATMOS', 'CHEMO', 'ANTH', 'PALIN'].every(n => b.d[2][IDX[n]] === '6'), 'K on the new scale the pinned tubes read 6 on Year: ' + b.d[2]);
  ok(b.d[0][IDX.OCEAN] === a.d[0][IDX.OCEAN] && b.d[1][IDX.ATMOS] === a.d[1][IDX.ATMOS] && b.d[0][IDX.CYCLO] === a.d[0][IDX.CYCLO], 'K the last-ten-years question and CYCLO read the same on both scales');
  ok(eq(b.slow, a.slow), 'K marker lamps are the same on both'); ok(text(r2, 'data/year-history-1.csv') === `date,year_digits\n2026-11-13,${b.d[2]}\n` && J(r2, 'status/latest-1.json').era === 1, 'K the new scale has its own history and status');
  ok(text(r2, 'data/year-history.csv').trim().split('\n').length === 366, 'K the old history carries on');
  // frozen: later runs, even with different data, never touch the saved normal
  const frozen = text(r2, 'data/normals-1.json'), b1 = text(r2, 'public/frame-1.json');
  res = run('build.js', r2, f2, { EARTH_NOW: '2026-11-13T15:00:00Z' }); ok(res.code === 0 && text(r2, 'data/normals-1.json') === frozen && text(r2, 'public/frame-1.json') === b1 && !has(r2, 'data/normals-2.json'), 'K an hour later nothing moves and no second reset starts');
  fixtures(f2); res = run('build.js', r2, f2, { EARTH_NOW: '2026-11-14T15:00:00Z' }); ok(res.code === 0 && text(r2, 'data/normals-1.json') === frozen, 'K the new normal is frozen even when the sources change');
  ok(J(r2, 'public/frame-0.json').ready === true && J(r2, 'public/frame-1.json').era === 1 && !has(r2, 'data/normals-2.json'), 'K both files keep publishing, and the lamp stays lit on the old one');
  // N: years later the new scale runs out of room too
  const n1b = J(r2, 'data/normals-1.json'); for (const n of ['OCEAN', 'ATMOS', 'CHEMO']) n1b.tubes[n].normal -= n1b.tubes[n].step * 20; fs.writeFileSync(path.join(r2, 'data/normals-1.json'), JSON.stringify(n1b));
  fixtures(f2, { hot: true }); run('build.js', r2, f2, { EARTH_NOW: '2026-11-14T16:00:00Z', FRESH: '1' }); const y1 = J(r2, 'public/frame-1.json').d[2];
  fs.writeFileSync(path.join(r2, 'data/year-history-1.csv'), 'date,year_digits\n' + Array.from({ length: 364 }, (_, k) => `${iso(Date.parse('2026-11-14T00:00:00Z') - (364 - k) * DAY)},${y1}`).join('\n') + '\n');
  res = run('build.js', r2, f2, { EARTH_NOW: '2026-11-14T17:00:00Z' }); const c = has(r2, 'public/frame-2.json') ? J(r2, 'public/frame-2.json') : {};
  ok(res.code === 0 && c.era === 2 && c.glow === '3D7BFF' && c.ready === false && M.validateFrame(c) === null, 'N a second reset makes frame-2 with the next colour: ' + res.out.slice(-150));
  ok(J(r2, 'public/frame-0.json').ready === true && J(r2, 'public/frame-1.json').ready === true && J(r2, 'public/frame-1.json').glow === '7A5CFF', 'N the lamp is lit on both older scales, so a board on either can step forward'); }
// L: a source that is alive but can't give a normal puts the reset off, then it goes ahead after two days of trying
{ const [r2, f2, f0] = hotBox('l'); fs.writeFileSync(path.join(r2, 'data/year-history.csv'), pastDays(364, f0.d[2])); fs.unlinkSync(path.join(f2, 'chemo-monthly.txt'));
  let res = run('build.js', r2, f2, { EARTH_NOW: '2026-11-13T13:00:00Z' }); ok(res.code === 0 && /Reset put off/.test(res.out) && !has(r2, 'data/normals-1.json') && J(r2, 'public/frame-0.json').ready === false, 'L the reset waits: ' + res.out.slice(-120));
  ok(J(r2, 'data/reset-pending.json').tries === 1 && eq(J(r2, 'data/reset-pending.json').waitingFor, ['CHEMO']), 'L and says what it is waiting for');
  res = run('build.js', r2, f2, { EARTH_NOW: '2026-11-13T14:00:00Z' }); ok(J(r2, 'data/reset-pending.json').tries === 2 && !has(r2, 'data/normals-1.json'), 'L it tries again on the next run');
  fs.writeFileSync(path.join(r2, 'data/reset-pending.json'), JSON.stringify({ since: '2026-11-13', tries: 47 })); res = run('build.js', r2, f2, { EARTH_NOW: '2026-11-13T15:00:00Z' }); const n0 = J(r2, 'data/normals-0.json'), n1 = has(r2, 'data/normals-1.json') ? J(r2, 'data/normals-1.json') : { tubes: { CHEMO: {} }, memory: [] };
  ok(res.code === 0 && eq(n1.carried, ['CHEMO']) && n1.tubes.CHEMO.carried === true && n1.tubes.CHEMO.normal === n0.tubes.CHEMO.normal && n1.memory[IDX.CHEMO] === 5, 'L after 48 tries it goes ahead, and CHEMO keeps its old normal');
  ok(!has(r2, 'data/reset-pending.json') && J(r2, 'public/frame-1.json').d[2][IDX.CHEMO] === '9' && J(r2, 'public/frame-1.json').d[2][IDX.OCEAN] === '6', 'L the waiting note is cleared; CHEMO still reads 9, OCEAN 6'); }
// M: a source that is already dead doesn't hold the reset up at all
{ const [r2, f2, f0] = hotBox('m'); fs.writeFileSync(path.join(r2, 'data/year-history.csv'), pastDays(364, f0.d[2])); fs.unlinkSync(path.join(f2, 'palin-owid.txt'));
  const res = run('build.js', r2, f2, { EARTH_NOW: '2026-11-13T13:00:00Z' }), n1 = has(r2, 'data/normals-1.json') ? J(r2, 'data/normals-1.json') : { tubes: { PALIN: {} } }, b = J(r2, 'public/frame-1.json');
  ok(res.code === 0 && eq(n1.carried, ['PALIN']) && n1.tubes.PALIN.carried === true, 'M the reset goes ahead at once with PALIN carried over'); ok(b.d[2][IDX.PALIN] === f0.d[2][IDX.PALIN] && b.slow[2][IDX.PALIN] === '1', 'M PALIN holds its last reading on the new scale, lamp lit'); }
// P: the pins end before the year is up, so the waiting note is cleared and nothing resets
{ const [r2, f2, f0] = hotBox('p'); fs.writeFileSync(path.join(r2, 'data/reset-pending.json'), '{"since":"2026-11-01","tries":3}'); fs.writeFileSync(path.join(r2, 'data/year-history.csv'), pastDays(364, f0.d[2]));
  fixtures(f2); const res = run('build.js', r2, f2, { EARTH_NOW: '2026-11-13T13:00:00Z', FRESH: '1' }); ok(res.code === 0 && !has(r2, 'data/reset-pending.json') && !has(r2, 'data/normals-1.json'), 'P today is no longer pinned: no reset, note cleared'); }
// Q: gaps. Days the job didn't run don't break a year of pins, but too few readings can't trigger one.
{ const [r2, f2, f0] = hotBox('q'), gap = f0.d[2].split('').map((c, i) => (M.RULES[M.ORDER[i]].counts ? '-' : c)).join('');
  fs.writeFileSync(path.join(r2, 'data/year-history.csv'), pastDays(364, f0.d[2]).split('\n').map((l, k) => (k > 0 && k <= 60 ? l.split(',')[0] + ',' + gap : l)).join('\n'));
  let res = run('build.js', r2, f2, { EARTH_NOW: '2026-11-13T13:00:00Z' }); ok(has(r2, 'data/normals-1.json'), 'Q sixty days with no reading do not break the run');
  const [r3, f3, g0] = hotBox('q2'); fs.writeFileSync(path.join(r3, 'data/year-history.csv'), pastDays(364, g0.d[2]).split('\n').map((l, k) => (k > 0 && k <= 70 ? l.split(',')[0] + ',' + gap : l)).join('\n'));
  res = run('build.js', r3, f3, { EARTH_NOW: '2026-11-13T13:00:00Z' }); ok(!has(r3, 'data/normals-1.json'), 'Q seventy days with no reading leave too few to be sure: no reset'); }
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`build: PASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
