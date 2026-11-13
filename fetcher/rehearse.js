// A dress rehearsal with the real sources. It changes nothing the instrument reads.
//   1. Works out the 2001-2020 normals again and compares them with the saved ones.
//   2. Pretends a reset is due today: works out the ten-year normals, then runs the real frame job in a scratch copy
//      of the repository, so frame-0.json and frame-1.json are built exactly as they would be.
// The only thing it writes is a report, status/rehearsal.json.
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { clock, root } = require('./load.js');
const { computeNormals, memory } = require('./normals.js');
const M = require('./mapping.js'), S = require('./series.js');

(async () => {
  const ROOT = root(), J = f => JSON.parse(fs.readFileSync(f, 'utf8'));
  const saved = J(path.join(ROOT, 'data/normals-0.json')), today = new Date(clock()).toISOString().slice(0, 10);
  const report = { made: new Date(clock()).toISOString(), commissioning: {}, reset: {} };
  const strip = t => { const { latest, months, days, years, earthquakes, ...rest } = t || {}; return JSON.stringify(rest); };

  const again = await computeNormals({ era: 0, prev: { tubes: {} } });
  report.commissioning = { failed: again.failed, differs: M.ORDER.filter(n => strip(again.out.tubes[n]) !== strip(saved.tubes[n])),
    detail: Object.fromEntries(M.ORDER.filter(n => strip(again.out.tubes[n]) !== strip(saved.tubes[n])).map(n => [n, { saved: strip(saved.tubes[n]).slice(0, 300), now: strip(again.out.tubes[n]).slice(0, 300) }])) };

  const from = S.tenYearsBefore(today), next = await computeNormals({ era: 1, from, to: today, prev: saved });
  const n1 = { ...next.out, since: today, glow: '7A5CFF', memory: memory(saved, next.out), ...(next.failed.length ? { carried: next.failed } : {}) };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rehearse-'));
  for (const d of ['data', 'public', 'status']) fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'data/normals-1.json'), JSON.stringify(n1));
  let log = '', code = 0;
  try { log = execFileSync('node', [path.join(__dirname, 'build.js')], { env: { ...process.env, EARTH_ROOT: tmp }, encoding: 'utf8' }); } catch (e) { code = e.status; log = String(e.stdout) + String(e.stderr); }
  const f0 = fs.existsSync(path.join(tmp, 'public/frame-0.json')) ? J(path.join(tmp, 'public/frame-0.json')) : null, f1 = fs.existsSync(path.join(tmp, 'public/frame-1.json')) ? J(path.join(tmp, 'public/frame-1.json')) : null;
  report.reset = { period: n1.period, failed: next.failed, jobExit: code, frame0: f0, frame1: f1,
    frame0Valid: f0 ? M.validateFrame(f0) : 'missing', frame1Valid: f1 ? M.validateFrame(f1) : 'missing',
    tubes: Object.fromEntries(M.ORDER.map((n, i) => [n, { oldNormal: n === 'LITHO' ? saved.tubes[n].windows[365].normal : saved.tubes[n].normal, newNormal: n === 'LITHO' ? n1.tubes[n].windows[365].normal : n1.tubes[n].normal,
      step: n === 'LITHO' ? n1.tubes[n].windows[365].step : n1.tubes[n].step, stepKept: JSON.stringify(n === 'LITHO' ? [1, 90, 365].map(w => n1.tubes[n].windows[w].step) : n1.tubes[n].step) === JSON.stringify(n === 'LITHO' ? [1, 90, 365].map(w => saved.tubes[n].windows[w].step) : saved.tubes[n].step),
      button4: n1.memory[i], onOldScale: f0 ? f0.d.slice(0, 3).map(r => r[i]).join('') : null, onNewScale: f1 ? f1.d.slice(0, 3).map(r => r[i]).join('') : null }])), logTail: log.split('\n').slice(-6) };
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.writeFileSync(path.join(ROOT, 'status/rehearsal.json'), JSON.stringify(report, null, 1) + '\n');
  console.log(JSON.stringify(report, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
