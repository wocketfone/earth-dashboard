// Works out "normal" for every tube and saves it. Two uses:
//   1. Commissioning. Run this file by hand: normal is the 2001-2020 record, saved to data/normals-0.json.
//   2. A reset. The frame job calls computeNormals itself: normal is the ten years ending on the reset day,
//      saved to data/normals-1.json (then -2, and so on) and never worked out again. Steps are copied from the scale before.
// The frame job reads the saved files, so the instrument keeps its normals even if a source's history later disappears.
const fs = require('fs'), path = require('path');
const { load, usgsUrl, sleep, clock, root } = require('./load.js');
const M = require('./mapping.js');
const S = require('./series.js');

const PALIN_STEP = 6;   // percentage points. Chosen at commissioning so the Year button read 7.
const iso = t => new Date(t).toISOString().slice(0, 10);

// prev: the scale before this one. On a reset its steps are kept. If a tube can't be worked out, its entry from prev is kept
// too (marked "carried" on a reset), and the tube is named in the returned "failed" list.
async function computeNormals({ era = 0, from = '2001-01-01', to = '2020-12-31', prev = { tubes: {} }, log = console.log }) {
  const first = era === 0, years = Math.round((S.toMs(to) - S.toMs(from)) / (365.25 * S.DAY));
  const out = { era, period: first ? '2001-2020' : `${from} to ${to}`, made: new Date(clock()).toISOString(), tubes: {} }, failed = [];
  const old = name => (prev.tubes[name] && !prev.tubes[name].error ? prev.tubes[name] : null);
  const tube = async (name, fn) => {
    try { out.tubes[name] = await fn(); log('OK  ', name, JSON.stringify(out.tubes[name]).slice(0, 150)); }
    catch (e) {
      log('FAIL', name, e.message); failed.push(name);
      if (old(name)) out.tubes[name] = first ? old(name) : { ...old(name), carried: true };       // keep the last good normal
      else out.tubes[name] = { error: String(e.message) };
    }
  };
  const span = rows => S.between(rows, from, to);
  // How much of the period a source must cover. A reset allows for sources that publish late: yearly ones can run two or three years behind.
  const need = (rows, perYear, what, share = first ? 0.958 : 0.9) => { const n = Math.floor(years * perYear * share);
    if (rows.length < n) throw new Error(`only ${rows.length} ${what} in the period, expected at least ${n}`); return rows; };
  const meanOf = (rows, places = 4) => +S.mean(rows.map(r => r.value)).toFixed(places);
  // Steps never change at a reset. That keeps the old and new scales comparable.
  const kept = (name, key, atStart) => { if (first) return atStart; if (!old(name) || old(name)[key] === undefined) throw new Error('the scale before this one has no step to keep'); return old(name)[key]; };

  await tube('OCEAN', async () => { const b = need(span(await load('ocean-ncei')), 12, 'months');
    return { source: 'ocean-ncei', transform: 'linear', normal: meanOf(b), step: kept('OCEAN', 'step', 0.3), recentStep: kept('OCEAN', 'recentStep', 0.15), recentYears: 10, cadence: 30, unit: 'degrees C', months: b.length }; });
  await tube('ATMOS', async () => { const b = need(span(await load('atmos-gistemp')), 12, 'months');
    return { source: 'atmos-gistemp', transform: 'linear', normal: meanOf(b), step: kept('ATMOS', 'step', 0.3), recentStep: kept('ATMOS', 'recentStep', 0.15), recentYears: 10, cadence: 30, unit: 'degrees C', months: b.length }; });
  await tube('CHEMO', async () => { const b = need(span(await load('chemo-monthly')), 12, 'months');
    return { source: 'chemo-daily', transform: 'linear', normal: meanOf(b), step: kept('CHEMO', 'step', 20), cadence: 1, unit: 'ppm', months: b.length }; });
  await tube('CRYO', async () => {
    const north = S.iceClimatology(await load('cryo-north'), from, to), south = S.iceClimatology(await load('cryo-south'), from, to);
    if (Object.keys(north).length < 365 || Object.keys(south).length < 365) throw new Error('the ice record does not cover every calendar day');
    const clim = { north, south };
    // The spread is this tube's step, so on a reset the usual extent moves and the spread stays.
    if (!first) for (const pole of ['north', 'south']) for (const key in clim[pole]) { const was = (kept('CRYO', 'clim', null)[pole] || {})[key]; if (was) clim[pole][key].sd = was.sd; }
    return { source: 'cryo-north + cryo-south', transform: 'linear', normal: 0, step: kept('CRYO', 'step', 0.75), cadence: 1, unit: 'standard deviations', clim }; });
  await tube('SOLAR', async () => { const b = need(span(await load('solar-silso')), 365.25, 'days');
    return { source: 'solar-silso + solar-eisn', transform: 'sqrt', normal: meanOf(b), step: kept('SOLAR', 'step', 1.5), cadence: 1, unit: 'sunspot number', days: b.length }; });
  await tube('ANTH', async () => { const b = need(span(await load('anth-owid')), 1, 'years', first ? 1 : 0.6); const normal = Math.round(S.mean(b.map(r => r.value)));
    return { source: 'anth-owid', transform: 'linear', normal, step: kept('ANTH', 'step', Math.round(normal * 0.15)), cadence: 365, unit: 'TWh a year', years: b.length }; });
  await tube('LITHO', async () => {
    let events = [];
    const y0 = +from.slice(0, 4), y1 = +to.slice(0, 4), after = iso(S.toMs(to) + S.DAY);
    for (let y = y0; y <= y1; y++) {
      const a = y === y0 ? from : `${y}-01-01`, b = y === y1 ? after : `${y + 1}-01-01`;
      events = events.concat(await load('litho-usgs', usgsUrl(a, b))); await sleep(400);
    }
    events = events.filter(e => e.date >= from && e.date <= to);
    if (events.length < years * 1000) throw new Error(`only ${events.length} earthquakes in the period, expected at least ${years * 1000}`);
    const daily = S.dailySums(events, from, to), windows = {};
    for (const w of [1, 90, 365]) {
      const sums = S.rollingSums(daily, w).filter(v => v > 0), r = M.steadyRule(sums, 'log10');
      const step = first ? +r.step.toFixed(4) : kept('LITHO', 'windows', null)[w].step;
      if (!(step > 0)) throw new Error(`the ${w}-day earthquake totals have no spread, so no step can be set`);
      windows[w] = { normal: +r.normal.toPrecision(5), step, samples: sums.length };
    }
    return { source: 'litho-usgs', transform: 'log10', windows, cadence: 0, unit: 'joules', earthquakes: events.length }; });
  // The Pacific cycle is published as a departure from its own normal, so 0 is neutral on every scale. Half a degree is the official step between strengths.
  out.tubes.CYCLO = { source: 'cyclo-nino34', transform: 'linear', normal: 0, step: 0.5, wholeSteps: true, cadence: 30, unit: 'degrees C' };
  await tube('PALIN', async () => { const rows = await load('palin-owid'), b = need(span(rows), 1, 'years', first ? 1 : 0.6); const normal = +S.mean(b.map(r => r.value)).toFixed(2);
    return { source: 'palin-owid', transform: 'linear', normal, step: kept('PALIN', 'step', PALIN_STEP), cadence: 365, unit: 'percent of electricity', years: b.length, latest: rows[rows.length - 1].value }; });
  return { out, failed };
}

// Button 4 after a reset: where each tube's old normal sits on the new scale. null if either scale has no normal for the tube.
function memory(before, after) {
  return M.ORDER.map(name => {
    const a = before.tubes[name], b = after.tubes[name];
    if (!a || !b || a.error || b.error) return null;
    if (name === 'CYCLO') return 5;
    if (name === 'LITHO') return M.memoryDigit(a.windows[365].normal, { transform: 'log10', ...b.windows[365] });
    if (name === 'CRYO') {                                   // how far the old usual extent sits from the new one, in spreads, averaged over the year and both poles
      const z = [];
      for (const pole of ['north', 'south']) for (const key in b.clim[pole]) { const o = a.clim[pole][key], n = b.clim[pole][key]; if (o && n.sd > 0) z.push((o.mean - n.mean) / n.sd); }
      return z.length ? M.memoryDigit(S.mean(z), b) : null;
    }
    return M.memoryDigit(a.normal, b);
  });
}

module.exports = { computeNormals, memory };

if (require.main === module) (async () => {
  const FILE = path.join(root(), 'data', 'normals-0.json');
  const prev = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { tubes: {} };
  const { out } = await computeNormals({ era: 0, prev });
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(out, null, 1) + '\n');
})();
