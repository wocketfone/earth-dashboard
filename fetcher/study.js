// A one-off look at two candidate sources for faster ANTH and PALIN readings. Writes status/study.json and nothing else.
const fs = require('fs'), path = require('path');
const { get } = require('./sources.js'); const { root } = require('./load.js');
const split = l => { const o = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(cur); cur = ''; } else cur += ch; } o.push(cur); return o; };
(async () => {
  const out = {};
  try {
    const r = await get('https://files.ember-energy.org/public-downloads/generation/outputs/release_generation_monthly_global.csv', 240000);
    const lines = r.text.split('\n'), head = split(lines[0]).map(s => s.trim()), ix = n => head.indexOf(n);
    const A = ix('Area'), D = ix('Date'), S = ix('Electricity source'), G = ix('Generation (TWh)'), SH = ix('Share of generation (%)'), sources = new Set(), series = {};
    for (let i = 1; i < lines.length; i++) { if (!lines[i]) continue; const c = split(lines[i]); sources.add(c[S]);
      if (['World', 'China', 'United States', 'Germany', 'EU', 'India'].includes(c[A]) && /^(Renewables|Clean|Wind and solar|Total generation|Demand|Fossil)$/i.test(c[S]) && c[D] >= '2024-09-01') ((series[c[A]] = series[c[A]] || {})[c[S]] = series[c[A]][c[S]] || []).push([c[D].slice(0, 7), +(+c[G]).toFixed(1), +(+c[SH]).toFixed(1)]); }
    for (const a in series) for (const k in series[a]) series[a][k].sort((x, y) => (x[0] < y[0] ? -1 : 1));
    out.ember = { sources: [...sources], series };
  } catch (err) { out.ember = { error: String(err.message) }; }
  for (const [name, url] of [['carbonMonitorPower', 'https://datas.carbonmonitor.org/API/downloadFullDataset.php?source=energy_global'], ['carbonMonitorCO2', 'https://datas.carbonmonitor.org/API/downloadFullDataset.php?source=carbon_global']]) {
    try { const r = await get(url, 240000), lines = r.text.split('\n').filter(Boolean); const head = lines[0], rows = lines.slice(1).map(l => l.split(','));
      const dates = rows.map(c => c.find(x => /^\d{2}\/\d{2}\/\d{4}$|^\d{4}-\d{2}-\d{2}$/.test(x))).filter(Boolean).map(d => (/\//.test(d) ? d.split('/').reverse().join('-') : d)).sort();
      out[name] = { status: r.status, megabytes: +(r.text.length / 1e6).toFixed(1), lines: lines.length, header: head.slice(0, 200), firstRows: lines.slice(1, 4), lastRows: lines.slice(-3), world: (() => { const w = rows.filter(c => /WORLD|World/.test(c[0])); const by = {}; for (const c of w.slice(-400)) { const d = c[1].replace(/"/g, '').split('/').reverse().join('-'); (by[d] = by[d] || {})[c[2].replace(/"/g, '')] = +c[3].replace(/"/g, ''); } const ds = Object.keys(by).sort(); return { rows: w.length, lastDays: ds.slice(-3).map(d => [d, by[d]]) }; })(), allCountries: [...new Set(rows.map(c => c[0].replace(/"/g, '')))].length, hasChinaUS: ['China', 'United States', 'US', 'Germany', 'India', 'Japan', 'Russia'].filter(n => rows.some(c => c[0] === '"' + n + '"')), lastByCountry: (() => { const o = {}; for (const c of rows) { const n = c[0].replace(/"/g, ''); if (['China', 'United States', 'US', 'Germany', 'India', 'EU27 & UK', 'WORLD'].includes(n)) { const d = c[1].replace(/"/g, '').split('/').reverse().join('-'); if (!o[n] || d > o[n]) o[n] = d; } } return o; })(), firstDate: dates[0], lastDate: dates[dates.length - 1], countries: [...new Set(rows.map(c => c[0]))].slice(0, 40), sectors: [...new Set(rows.map(c => c[2]))].slice(0, 20) };
    } catch (err) { out[name] = { error: String(err.message) }; }
  }
  fs.writeFileSync(path.join(root(), 'status/study.json'), JSON.stringify(out, null, 1) + '\n'); console.log(JSON.stringify(out, null, 1).slice(0, 6000));
})().catch(e => { console.error(e); process.exit(1); });
