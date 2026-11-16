// A one-off look at two candidate sources for faster ANTH and PALIN readings. Writes status/study.json and nothing else.
const fs = require('fs'), path = require('path');
const { get } = require('./sources.js'); const { root } = require('./load.js');
const split = l => { const o = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(cur); cur = ''; } else cur += ch; } o.push(cur); return o; };
(async () => {
  const out = {};
  try {
    const r = await get('https://files.ember-energy.org/public-downloads/generation/outputs/release_generation_monthly_global.csv', 240000);
    const lines = r.text.split('\n'), head = split(lines[0]).map(s => s.trim()), ix = n => head.indexOf(n);
    const e = { status: r.status, bytes: r.text.length, lines: lines.length, header: head, areas: new Set(), worldVars: {}, lastByArea: {} };
    for (let i = 1; i < lines.length; i++) { if (!lines[i]) continue; const c = split(lines[i]); const area = c[ix('Area')], date = c[ix('Date')], v = c[ix('Variable')], unit = c[ix('Unit')], cat = c[ix('Category')], val = c[ix('Value')];
      e.areas.add(area); if (!e.lastByArea[area] || date > e.lastByArea[area]) e.lastByArea[area] = date;
      if (area === 'World') { const k = `${cat} | ${v} | ${unit}`; (e.worldVars[k] = e.worldVars[k] || []).push([date, +val]); } }
    const keep = {}; for (const k in e.worldVars) { const a = e.worldVars[k].sort((x, y) => (x[0] < y[0] ? -1 : 1)); if (/Renewables|Clean|Demand|Total Generation|Wind and Solar|Fossil/.test(k)) keep[k] = { first: a[0][0], last: a[a.length - 1][0], n: a.length, last14: a.slice(-14) }; }
    const want = ['World', 'China', 'United States of America', 'United States', 'Germany', 'India', 'EU', 'G20', 'OECD', 'Japan'];
    out.ember = { status: e.status, megabytes: +(e.bytes / 1e6).toFixed(1), lines: e.lines, header: e.header, areaCount: e.areas.size, hasWorld: e.areas.has('World'), aggregates: [...e.areas].filter(a => /World|G20|G7|OECD|EU|Asia|Africa|Europe|America|ASEAN|Middle|Oceania/.test(a)), lastMonth: Object.fromEntries(want.filter(a => e.lastByArea[a]).map(a => [a, e.lastByArea[a]])), world: keep, worldVarNames: Object.keys(e.worldVars) };
  } catch (err) { out.ember = { error: String(err.message) }; }
  for (const [name, url] of [['carbonMonitorPower', 'https://datas.carbonmonitor.org/API/downloadFullDataset.php?source=energy_global'], ['carbonMonitorCO2', 'https://datas.carbonmonitor.org/API/downloadFullDataset.php?source=carbon_global']]) {
    try { const r = await get(url, 240000), lines = r.text.split('\n').filter(Boolean); const head = lines[0], rows = lines.slice(1).map(l => l.split(','));
      const dates = rows.map(c => c.find(x => /^\d{2}\/\d{2}\/\d{4}$|^\d{4}-\d{2}-\d{2}$/.test(x))).filter(Boolean).map(d => (/\//.test(d) ? d.split('/').reverse().join('-') : d)).sort();
      out[name] = { status: r.status, megabytes: +(r.text.length / 1e6).toFixed(1), lines: lines.length, header: head.slice(0, 200), firstRows: lines.slice(1, 4), lastRows: lines.slice(-3), firstDate: dates[0], lastDate: dates[dates.length - 1], countries: [...new Set(rows.map(c => c[0]))].slice(0, 40), sectors: [...new Set(rows.map(c => c[2]))].slice(0, 20) };
    } catch (err) { out[name] = { error: String(err.message) }; }
  }
  fs.writeFileSync(path.join(root(), 'status/study.json'), JSON.stringify(out, null, 1) + '\n'); console.log(JSON.stringify(out, null, 1).slice(0, 6000));
})().catch(e => { console.error(e); process.exit(1); });
