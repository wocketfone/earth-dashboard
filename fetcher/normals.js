// Works out "normal" for every tube from the 2001-2020 record and saves it to data/normals-0.json.
// Run once at commissioning, and again only if a source or a rule changes. The daily job reads the saved file,
// so the instrument keeps its normals even if a source's history later disappears.
const fs = require('fs'), path = require('path');
const { load, usgsUrl, sleep } = require('./load.js');
const { steadyRule } = require('./mapping.js');
const S = require('./series.js');

const FILE = path.join(__dirname, '..', 'data', 'normals-0.json');
const PALIN_STEP = 6;   // percentage points. Chosen at commissioning so the Year button read 7.

(async () => {
  const old = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { tubes: {} };
  const out = { era: 0, period: '2001-2020', made: new Date().toISOString(), tubes: {} };
  const tube = async (name, fn) => {
    try { out.tubes[name] = await fn(); console.log('OK  ', name, JSON.stringify(out.tubes[name]).slice(0, 150)); }
    catch (e) {
      console.log('FAIL', name, e.message);
      if (old.tubes[name] && !old.tubes[name].error) out.tubes[name] = old.tubes[name];   // keep the last good normal
      else out.tubes[name] = { error: String(e.message) };
    }
  };
  const need = (rows, n, what) => { if (rows.length < n) throw new Error(`only ${rows.length} baseline ${what}, expected at least ${n}`); return rows; };
  const meanOf = rows => +S.mean(rows.map(r => r.value)).toFixed(4);

  await tube('OCEAN', async () => { const b = need(S.baseline(await load('ocean-ncei')), 230, 'months');
    return { source: 'ocean-ncei', transform: 'linear', normal: meanOf(b), step: 0.3, recentStep: 0.15, recentYears: 10, cadence: 30, unit: 'degrees C', months: b.length }; });
  await tube('ATMOS', async () => { const b = need(S.baseline(await load('atmos-gistemp')), 230, 'months');
    return { source: 'atmos-gistemp', transform: 'linear', normal: meanOf(b), step: 0.3, recentStep: 0.15, recentYears: 10, cadence: 30, unit: 'degrees C', months: b.length }; });
  await tube('CHEMO', async () => { const b = need(S.baseline(await load('chemo-monthly')), 230, 'months');
    return { source: 'chemo-daily', transform: 'linear', normal: meanOf(b), step: 20, cadence: 1, unit: 'ppm', months: b.length }; });
  await tube('CRYO', async () => {
    const north = S.iceClimatology(await load('cryo-north')), south = S.iceClimatology(await load('cryo-south'));
    if (Object.keys(north).length < 365 || Object.keys(south).length < 365) throw new Error('the ice record does not cover every calendar day');
    return { source: 'cryo-north + cryo-south', transform: 'linear', normal: 0, step: 0.75, cadence: 1, unit: 'standard deviations', clim: { north, south } }; });
  await tube('SOLAR', async () => { const b = need(S.baseline(await load('solar-silso')), 7000, 'days');
    return { source: 'solar-silso + solar-eisn', transform: 'sqrt', normal: meanOf(b), step: 1.5, cadence: 1, unit: 'sunspot number', days: b.length }; });
  await tube('ANTH', async () => { const b = need(S.baseline(await load('anth-owid')), 20, 'years'); const normal = Math.round(S.mean(b.map(r => r.value)));
    return { source: 'anth-owid', transform: 'linear', normal, step: Math.round(normal * 0.15), cadence: 365, unit: 'TWh a year', years: b.length }; });
  await tube('LITHO', async () => {
    let events = [];
    for (let y = 2001; y <= 2020; y++) { events = events.concat(await load('litho-usgs', usgsUrl(`${y}-01-01`, `${y + 1}-01-01`))); await sleep(400); }
    events = events.filter(e => e.date >= '2001-01-01' && e.date <= '2020-12-31');
    if (events.length < 20000) throw new Error(`only ${events.length} baseline earthquakes, expected at least 20000`);
    const daily = S.dailySums(events, '2001-01-01', '2020-12-31'), windows = {};
    for (const w of [1, 90, 365]) {
      const sums = S.rollingSums(daily, w).filter(v => v > 0), r = steadyRule(sums, 'log10');
      windows[w] = { normal: +r.normal.toPrecision(5), step: +r.step.toFixed(4), samples: sums.length };
    }
    return { source: 'litho-usgs', transform: 'log10', windows, cadence: 0, unit: 'joules', earthquakes: events.length }; });
  // The Pacific cycle is published as a departure from its own normal, so 0 is neutral. Half a degree is the official step between strengths.
  out.tubes.CYCLO = { source: 'cyclo-nino34', transform: 'linear', normal: 0, step: 0.5, wholeSteps: true, cadence: 30, unit: 'degrees C' };
  await tube('PALIN', async () => { const rows = await load('palin-owid'), b = need(S.baseline(rows), 20, 'years'); const normal = +S.mean(b.map(r => r.value)).toFixed(2);
    return { source: 'palin-owid', transform: 'linear', normal, step: PALIN_STEP, cadence: 365, unit: 'percent of electricity', years: b.length, latest: rows[rows.length - 1].value }; });

  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(out, null, 1) + '\n');
})();
