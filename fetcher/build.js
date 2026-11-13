// The regular job. Reads every source, works out the nine digits for each button, and writes public/frame-0.json.
// If a source fails, its tube keeps its last reading and its marker lamp lights. Nothing here can make a tube show a guess.
const fs = require('fs'), path = require('path');
const { load, usgsUrl } = require('./load.js');
const M = require('./mapping.js'), S = require('./series.js');

const ROOT = path.join(__dirname, '..');
const read = f => (fs.existsSync(path.join(ROOT, f)) ? JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')) : null);
const STALE_AFTER = { 0: 3, 1: 10, 30: 100, 365: 1000 };           // days without fresh data before a tube counts as stale
const ageDays = date => (Date.now() - S.toMs(date)) / S.DAY;

(async () => {
  const normals = read('data/normals-0.json');
  if (!normals) throw new Error('data/normals-0.json is missing. Run the normals job first.');
  // FRESH=1 forgets the previous digits for one run. Use it after a rule changes, so the deadband doesn't hold a tube
  // on a digit that was set under the old rule.
  const fresh = process.env.FRESH === '1';
  const prev = read('public/frame-0.json'), prevStatus = read('status/latest.json') || { tubes: {} };
  const now = Date.now(), today = new Date(now).toISOString().slice(0, 10);
  const status = { made: new Date(now).toISOString(), tubes: {} };

  // Each reader returns { values: [today, 90 days, year], latest: 'YYYY-MM-DD', positions: [...] }.
  const three = (rows, rule) => {
    const end = rows[rows.length - 1].date, values = [rows[rows.length - 1].value, S.windowMean(rows, end, 90), S.windowMean(rows, end, 365)];
    return { values, latest: end, positions: values.map(v => M.position(v, rule)) };
  };
  // OCEAN and ATMOS: Today and 90 days compare with the same months of the last ten years. Year compares with 2001-2020.
  const twoQuestions = (rows, n) => {
    const end = rows[rows.length - 1].date, recent = { transform: 'linear', normal: 0, step: n.recentStep };
    const values = [S.vsRecentYears(rows, 1, n.recentYears), S.vsRecentYears(rows, 3, n.recentYears), S.windowMean(rows, end, 365)];
    return { values, latest: end, positions: [M.position(values[0], recent), M.position(values[1], recent), M.position(values[2], n)],
      note: 'Today and 90 days are degrees above the same months of the last ten years. Year is the level; normal is ' + n.normal + '.' };
  };
  const readers = {
    OCEAN: async n => twoQuestions(await load('ocean-ncei'), n),
    ATMOS: async n => twoQuestions(await load('atmos-gistemp'), n),
    CHEMO: async n => { let rows; try { rows = await load('chemo-daily'); } catch (e) { rows = await load('chemo-monthly'); } return three(rows, n); },
    CRYO: async n => three(S.pairMean(S.iceZ(await load('cryo-north'), n.clim.north), S.iceZ(await load('cryo-south'), n.clim.south)), n),
    SOLAR: async n => {
      let rows = await load('solar-silso');
      try { const last = rows[rows.length - 1].date; rows = rows.concat((await load('solar-eisn')).filter(r => r.date > last)); } catch (e) { /* the monthly file alone is fine */ }
      return three(rows, n);
    },
    CYCLO: async n => { let rows; try { rows = await load('cyclo-nino34'); } catch (e) { rows = await load('cyclo-oni'); } return three(rows, n); },
    PALIN: async n => { const rows = await load('palin-owid'), r = rows[rows.length - 1]; return { values: [r.value, r.value, r.value], latest: r.date, positions: [0, 0, 0].map(() => M.position(r.value, n)) }; },
    ANTH: async n => { const rows = await load('anth-owid'), r = rows[rows.length - 1]; return { values: [r.value, r.value, r.value], latest: r.date, positions: [0, 0, 0].map(() => M.position(r.value, n)) }; },
    LITHO: async n => {
      const from = new Date(now - 400 * S.DAY).toISOString().slice(0, 10), ev = await load('litho-usgs', usgsUrl(from));
      const values = [24, 90 * 24, 365 * 24].map(h => S.energySince(ev, now, h));
      const positions = values.map((v, i) => M.position(v, { transform: 'log10', ...n.windows[[1, 90, 365][i]] }));
      return { values, latest: today, positions };
    },
  };

  const stale = [], cadence = { ...M.CADENCE };
  for (const name of M.ORDER) {
    const n = normals.tubes[name], last = prevStatus.tubes[name];
    if (n && !n.error) cadence[name] = n.cadence;
    try {
      if (!n || n.error || !readers[name]) throw new Error(n && n.error ? n.error : 'No reader for this tube.');
      const r = await readers[name](n);
      status.tubes[name] = { ok: true, source: n.source, unit: n.unit, latest: r.latest, ...(r.note ? { about: r.note } : {}), values: r.values, positions: r.positions.map(p => (p === null || !Number.isFinite(p) ? p : +p.toFixed(3))) };
      if (ageDays(r.latest) > STALE_AFTER[n.cadence]) { stale.push(name); status.tubes[name].note = 'The source has not published anything new for a while.'; }
      console.log('OK  ', name, r.latest, r.values.map(v => (v === null ? 'none' : +v.toPrecision(5))).join(', '));
    } catch (e) {
      console.log('FAIL', name, e.message);
      if (last && last.positions) { status.tubes[name] = { ...last, ok: false, note: 'Holding the last reading. ' + e.message }; stale.push(name); }
      else status.tubes[name] = { ok: false, note: 'No reading. ' + e.message };
    }
  }

  const fix = p => (p === undefined || p === null || Number.isNaN(p) ? null : p);     // minus infinity is a real "nothing happened" reading
  const positions = [0, 1, 2].map(b => M.ORDER.map(name => { const t = status.tubes[name]; return t.positions ? fix(t.positions[b]) : null; }));
  const draft = M.buildFrame({ seq: 0, made: status.made, positions, previous: prev && !fresh ? prev.d : null, cadence, stale });
  const changed = !prev || draft.d.join() !== prev.d.join() || draft.slow.join() !== prev.slow.join();
  const file = { ...draft, seq: prev ? prev.seq + (changed ? 1 : 0) : 1 };
  const error = M.validateFrame(file); if (error) throw new Error('Refusing to publish a bad frame: ' + error);
  M.ORDER.forEach((name, i) => { status.tubes[name].digits = file.d.slice(0, 3).map(row => row[i]).join(''); });
  status.frame = file;

  // Write only when something changed, or about once a day so the board can see the data is fresh.
  const hoursOld = prev ? (now - Date.parse(prev.made)) / 3600000 : Infinity;
  if (changed || hoursOld > 20) {
    fs.mkdirSync(path.join(ROOT, 'public'), { recursive: true }); fs.mkdirSync(path.join(ROOT, 'status'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'public/frame-0.json'), JSON.stringify(file) + '\n');
    fs.writeFileSync(path.join(ROOT, 'status/latest.json'), JSON.stringify(status, null, 1) + '\n');
    const hist = path.join(ROOT, 'data/year-history.csv'), lines = fs.existsSync(hist) ? fs.readFileSync(hist, 'utf8').trim().split('\n') : ['date,year_digits'];
    if (!lines[lines.length - 1].startsWith(today)) fs.appendFileSync(hist, (fs.existsSync(hist) ? '' : 'date,year_digits\n') + `${today},${file.d[2]}\n`);
    console.log(changed ? 'Published a new frame:' : 'Refreshed the frame:', JSON.stringify(file));
  } else console.log('Nothing changed. The published frame stands.');
})().catch(e => { console.error(e); process.exit(1); });
