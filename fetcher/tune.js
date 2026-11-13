// A one-off study of the daily temperature sources, to choose the step for the Today and 90-day buttons.
// It writes status/tune.json and changes nothing the instrument reads.
const fs = require('fs'), path = require('path');
const { load, root } = require('./load.js');
const S = require('./series.js');
(async () => {
  const out = {};
  for (const [name, id] of [['OCEAN', 'ocean-daily-ecmwf'], ['ATMOS', 'atmos-daily-ecmwf']]) {
    const rows = (await load(id)).filter(r => r.value !== null), byDate = new Map(rows.map(r => [r.date, r.value]));
    const q = (a, p) => { const v = a.slice().sort((x, y) => x - y), i = (v.length - 1) * p, lo = Math.floor(i); return +(v[lo] + (v[Math.ceil(i)] - v[lo]) * (i - lo)).toFixed(3); };
    const qs = a => Object.fromEntries([0.02, 0.05, 0.25, 0.5, 0.75, 0.95, 0.98].map(p => [p, q(a, p)]));
    const d1 = [], d90 = [], jump = [];
    for (const r of rows.filter(r => r.date >= '2005-01-01')) { const a = S.vsRecentAt(byDate, r.date, 1), b = S.vsRecentAt(byDate, r.date, 90); if (a !== null) { if (d1.length) jump.push(Math.abs(a - d1[d1.length - 1])); d1.push(a); } if (b !== null) d90.push(b); }
    const base = S.mean(S.baseline(rows).map(r => r.value)), end = rows[rows.length - 1].date, year = S.windowMean(rows, end, 365);
    out[name] = { rows: rows.length, first: rows[0].date, last: end, latest: rows[rows.length - 1].value, baseline: +base.toFixed(4), yearMean: +year.toFixed(4), yearAbove: +(year - base).toFixed(4),
      today: +S.vsRecentDays(rows, 1).toFixed(4), ninety: +S.vsRecentDays(rows, 90).toFixed(4), todayQuantiles: qs(d1), ninetyQuantiles: qs(d90), dayToDayChange: { median: q(jump, 0.5), p95: q(jump, 0.95), max: q(jump, 1) },
      last30Today: d1.slice(-30).map(v => +v.toFixed(3)), missing: rows.length ? Math.round((S.toMs(end) - S.toMs(rows[0].date)) / S.DAY) + 1 - rows.length : 0 };
  }
  fs.writeFileSync(path.join(root(), 'status/tune.json'), JSON.stringify(out, null, 1) + '\n'); console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
