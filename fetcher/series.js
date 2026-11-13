// Small, pure helpers for working with dated series. No network here, so everything can be tested.
const DAY = 86400000;
const toMs = date => Date.parse(date + 'T00:00:00Z');
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
function sd(a) { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); }

// Mean of the values dated within the last `days` days up to and including `end`. null if there are none.
function windowMean(rows, end, days) {
  const hi = toMs(end), lo = hi - days * DAY;
  const v = rows.filter(r => { const t = toMs(r.date); return t > lo && t <= hi; }).map(r => r.value);
  return v.length ? mean(v) : null;
}
const between = (rows, from, to) => rows.filter(r => r.date >= from && r.date <= to);
const baseline = rows => between(rows, '2001-01-01', '2020-12-31');

// How the last `n` monthly readings compare with the same calendar months in the `years` years before each one.
// Returns the average difference, or null if too few of those earlier years have data.
function vsRecentYears(rows, n, years = 10) {
  if (rows.length < n) return null;
  const byDate = new Map(rows.map(r => [r.date, r.value])), diffs = [];
  for (const r of rows.slice(-n)) {
    const y = +r.date.slice(0, 4), rest = r.date.slice(4), past = [];
    for (let k = 1; k <= years; k++) { const v = byDate.get(`${y - k}${rest}`); if (v !== undefined) past.push(v); }
    if (past.length < Math.ceil(years * 0.8)) return null;
    diffs.push(r.value - mean(past));
  }
  return mean(diffs);
}

// Sea ice. For each calendar day, the usual extent and its spread over the chosen years (2001-2020 unless told otherwise), pooled over five days.
function iceClimatology(rows, from = '2001-01-01', to = '2020-12-31') {
  const base = between(rows, from, to), byKey = {};
  for (const r of base) {
    const t = toMs(r.date);
    for (let k = -2; k <= 2; k++) { const key = new Date(t + k * DAY).toISOString().slice(5, 10); (byKey[key] = byKey[key] || []).push(r.value); }
  }
  const out = {};
  for (const key in byKey) if (byKey[key].length >= 20) out[key] = { mean: +mean(byKey[key]).toFixed(4), sd: +sd(byKey[key]).toFixed(4) };
  return out;
}
// How unusual each day's ice is, in standard deviations for that calendar day.
function iceZ(rows, clim) {
  return rows.map(r => { const c = clim[r.date.slice(5, 10)]; return c && c.sd > 0 ? { date: r.date, value: (r.value - c.mean) / c.sd } : null; }).filter(Boolean);
}
// Average the two poles day by day. A day needs both.
function pairMean(a, b) {
  const m = new Map(b.map(r => [r.date, r.value]));
  return a.filter(r => m.has(r.date)).map(r => ({ date: r.date, value: (r.value + m.get(r.date)) / 2 }));
}

// Earthquakes. Total energy per calendar day, with quiet days as zero.
function dailySums(events, from, to) {
  const sums = new Map();
  for (const e of events) sums.set(e.date, (sums.get(e.date) || 0) + e.value);
  const out = [];
  for (let t = toMs(from); t <= toMs(to); t += DAY) { const d = new Date(t).toISOString().slice(0, 10); out.push({ date: d, value: sums.get(d) || 0 }); }
  return out;
}
// Totals over every run of `days` days in a row.
function rollingSums(daily, days) {
  const out = []; let run = 0;
  for (let i = 0; i < daily.length; i++) { run += daily[i].value; if (i >= days) run -= daily[i - days].value; if (i >= days - 1) out.push(run); }
  return out;
}
// Energy released in the last `hours` hours before `nowMs`.
function energySince(events, nowMs, hours) { return events.filter(e => e.time > nowMs - hours * 3600000 && e.time <= nowMs).reduce((x, e) => x + e.value, 0); }

module.exports = { DAY, toMs, mean, sd, windowMean, vsRecentYears, between, baseline, iceClimatology, iceZ, pairMean, dailySums, rollingSums, energySince };
