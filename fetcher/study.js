// A one-off look at Ember's monthly World figures, to set the steps for ANTH and PALIN. Writes status/study.json and nothing else.
const fs = require('fs'), path = require('path');
const { get, parseOwidColumn } = require('./sources.js'); const { root } = require('./load.js');
const split = l => { const o = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(cur); cur = ''; } else cur += ch; } o.push(cur); return o; };
const q = (a, p) => { const v = a.slice().sort((x, y) => x - y), i = (v.length - 1) * p, lo = Math.floor(i); return +(v[lo] + (v[Math.ceil(i)] - v[lo]) * (i - lo)).toFixed(3); };
(async () => {
  const out = {};
  const r = await get('https://files.ember-energy.org/public-downloads/generation/outputs/release_generation_monthly_global.csv', 240000);
  const lines = r.text.split('\n'), head = split(lines[0]).map(s => s.trim()), ix = n => head.indexOf(n);
  const A = ix('Area'), D = ix('Date'), S = ix('Electricity source'), G = ix('Generation (TWh)'), SH = ix('Share of generation (%)'), w = {};
  for (let i = 1; i < lines.length; i++) { if (!lines[i].startsWith('World,')) continue; const c = split(lines[i]); (w[c[S]] = w[c[S]] || {})[c[D].slice(0, 7)] = [+c[G], +c[SH]]; }
  const months = Object.keys(w.Demand).sort(), prev = m => `${+m.slice(0, 4) - 1}${m.slice(4)}`;
  const share = m => w.Renewables[m][1], dem = m => w.Demand[m][0];
  const yoyShare = [], yoyDem = [], table = [];
  for (const m of months) { const p = prev(m); const row = { m, share: share(m), demand: dem(m) }; if (w.Demand[p]) { row.shareYoY = +(share(m) - share(p)).toFixed(2); row.demandYoY = +((dem(m) / dem(p) - 1) * 100).toFixed(2); yoyShare.push(row.shareYoY); yoyDem.push(row.demandYoY); } table.push(row); }
  const roll = months.slice(11).map((m, k) => { const win = months.slice(k, k + 12); const gen = win.reduce((a, x) => a + w['Total generation'][x][0], 0), ren = win.reduce((a, x) => a + w.Renewables[x][0], 0), d = win.reduce((a, x) => a + dem(x), 0); return [m, +(100 * ren / gen).toFixed(2), Math.round(d)]; });
  const Q = a => Object.fromEntries([0.02, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98].map(p => [p, q(a, p)]));
  out.ember = { first: months[0], last: months[months.length - 1], months: months.length, gaps: months.filter((m, i) => i && (+m.slice(0, 4) * 12 + +m.slice(5)) - (+months[i - 1].slice(0, 4) * 12 + +months[i - 1].slice(5)) !== 1),
    shareYoY: Q(yoyShare), demandYoY: Q(yoyDem), since2021: { shareYoY: Q(table.filter(t => t.m >= '2021-01' && t.shareYoY !== undefined).map(t => t.shareYoY)), demandYoY: Q(table.filter(t => t.m >= '2021-01' && t.demandYoY !== undefined).map(t => t.demandYoY)) },
    table: table.map(t => [t.m, t.share, Math.round(t.demand), t.shareYoY, t.demandYoY]), rolling12: roll.filter((x, i) => i % 6 === 0 || i >= roll.length - 3) };
  const o = await get('https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv', 240000);
  out.owid = {}; for (const col of ['electricity_demand', 'electricity_generation', 'renewables_share_elec', 'renewables_electricity', 'primary_energy_consumption']) { try { const rows = parseOwidColumn(o.text, col).filter(x => x.value !== null); const b = rows.filter(x => x.date >= '2001' && x.date <= '2020-12-31'); out.owid[col] = { first: rows[0].date, last: rows[rows.length - 1].date, baseYears: b.length, baseMean: +(b.reduce((a, x) => a + x.value, 0) / b.length).toFixed(2), last6: rows.slice(-6).map(x => [x.date.slice(0, 4), x.value]) }; } catch (e) { out.owid[col] = { error: e.message }; } }
  fs.writeFileSync(path.join(root(), 'status/study.json'), JSON.stringify(out, null, 1) + '\n'); console.log(JSON.stringify(out).slice(0, 3000));
})().catch(e => { console.error(e); process.exit(1); });
