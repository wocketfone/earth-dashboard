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
  const temp = ([y]) => (y >= 2026 ? 0.8 : 0.5);                                           // warm 2026, flat before
  w('ocean-ncei', '# Global Ocean\nDate,Anomaly\n' + months(1990, 2026, 10).map(([y, m]) => `${y}${pad(m)},${temp([y])}`).join('\n') + '\n');
  const g = {}; months(1990, 2026, 10).forEach(([y, m]) => { (g[y] = g[y] || Array(12).fill('***'))[m - 1] = temp([y]); });
  w('atmos-gistemp', 'Land-Ocean: Global Means\nYear,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,J-D\n' + Object.keys(g).map(y => `${y},${g[y].join(',')},***`).join('\n') + '\n');
  w('chemo-monthly', 'year,month,decimal,average,average_unc,trend,trend_unc\n' + months(1979, 2026, 10).map(([y, m]) => `${y},${m},${y},0,0,${y >= 2026 ? 430 : 390},0`).join('\n') + '\n');
  w('chemo-daily', 'year,month,day,smoothed,trend\n' + days('2016-01-01', '2026-11-12').map(d => `${+d.slice(0, 4)},${+d.slice(5, 7)},${+d.slice(8)},0,${d >= '2025-11-01' ? 430 : 390}`).join('\n') + '\n');
  const ice = base => 'Year, Month, Day, Extent, Missing, Source\nYYYY, MM, DD, x, x, x\n' + days('1990-01-01', '2026-11-12').map(d => {
    const y = +d.slice(0, 4), doy = (Date.parse(d + 'T00:00:00Z') - Date.UTC(y, 0, 1)) / DAY, season = base + 4 * Math.cos(2 * Math.PI * doy / 365.25);
    return `${y}, ${+d.slice(5, 7)}, ${+d.slice(8)}, ${(y >= 2026 ? season - 1.2 : season + (y % 2 ? 0.5 : -0.5)).toFixed(4)}, 0, x`; }).join('\n') + '\n';
  w('cryo-north', ice(10)); w('cryo-south', ice(12));
  w('solar-silso', days('1990-01-01', '2026-10-31').map(d => `${d.slice(0, 4)};${d.slice(5, 7)};${d.slice(8)};0;${d >= '2025-11-01' ? 100 : 49};1;1;1`).join('\n') + '\n');
  w('solar-eisn', days('2026-11-01', '2026-11-13').map(d => `${d.slice(0, 4)},${d.slice(5, 7)},${d.slice(8)},0,100,1,1,1`).join('\n') + '\n');
  const owid = 'country,year,iso_code,renewables_share_elec,primary_energy_consumption\nFrance,2024,FRA,99,99\n' + Array.from({ length: 41 }, (_, i) => 1985 + i).map(y => `World,${y},OWID_WRL,${y > 2020 ? 32 : 20},${y > 2020 ? 130000 : 100000}`).join('\n') + '\n';
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
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`build: PASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
