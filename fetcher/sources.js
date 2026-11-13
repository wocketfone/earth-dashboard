// Earth Dashboard data sources.
// Each source has an address and a parser. A parser turns the source's text into a list of
// { date: 'YYYY-MM-DD', value: number }, oldest first. Parsers are pure, so they can be tested without a network.

const HEADERS = { 'User-Agent': 'earth-dashboard (https://github.com/wocketfone/earth-dashboard)' };

async function get(url, timeoutMs = 90000) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ctl.signal, redirect: 'follow' });
    return { status: res.status, ok: res.ok, text: await res.text() };
  } finally { clearTimeout(timer); }
}

const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const num = s => { const v = Number(String(s).trim()); return Number.isFinite(v) ? v : null; };
const lines = text => text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
const sorted = rows => rows.filter(r => r.value !== null).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

// NOAA GML, global CO2, daily. Columns: year, month, day, smoothed, trend. We take "trend", which has the seasons removed.
function parseCo2Daily(text) {
  return sorted(lines(text).map(l => l.split(',')).filter(c => num(c[0]) > 1900 && c.length >= 5)
    .map(c => ({ date: iso(+c[0], +c[1], +c[2]), value: num(c[4]) })));
}

// NOAA GML, global CO2, monthly. Columns: year, month, decimal, average, average_unc, trend, trend_unc.
function parseCo2Monthly(text) {
  return sorted(lines(text).map(l => l.split(',')).filter(c => num(c[0]) > 1900 && c.length >= 6)
    .map(c => ({ date: iso(+c[0], +c[1], 15), value: num(c[5]) })));
}

// NASA GISTEMP, monthly anomalies against 1951-1980. Rows: Year, Jan ... Dec, then yearly and seasonal columns.
// Months not yet published are written as ***.
function parseGistemp(text) {
  const out = [];
  for (const c of lines(text).map(l => l.split(','))) {
    const y = num(c[0]); if (!y || y < 1800) continue;
    for (let m = 1; m <= 12; m++) { const v = num(c[m]); if (v !== null) out.push({ date: iso(y, m, 15), value: v }); }
  }
  return sorted(out);
}

// SILSO, daily total sunspot number. Columns split by ";": year, month, day, fraction, number, ... A number of -1 means missing.
function parseSilsoDaily(text) {
  return sorted(lines(text).map(l => l.split(';')).filter(c => c.length >= 5 && num(c[0]) > 1800)
    .map(c => ({ date: iso(+c[0], +c[1], +c[2]), value: num(c[4]) })).filter(r => r.value !== null && r.value >= 0));
}

// NSIDC Sea Ice Index, daily extent in millions of square km. Columns: Year, Month, Day, Extent, Missing, Source.
function parseNsidcDaily(text) {
  return sorted(lines(text).map(l => l.split(',')).filter(c => c.length >= 4 && num(c[0]) > 1900)
    .map(c => ({ date: iso(+c[0], +c[1], +c[2]), value: num(c[3]) })).filter(r => r.value !== null && r.value > 0));
}

// Climate Reanalyzer, daily mean sea surface temperature from NOAA OISST, 60S to 60N.
// JSON: a list of { name: '1982', data: [366 values] }, plus a few named averages we skip.
function parseOisstJson(text) {
  const out = [];
  for (const series of JSON.parse(text)) {
    if (!/^\d{4}$/.test(String(series.name))) continue;
    const y = +series.name, start = Date.UTC(y, 0, 1);
    (series.data || []).forEach((v, i) => {
      if (v === null || v === undefined) return;
      const d = new Date(start + i * 86400000);
      if (d.getUTCFullYear() === y) out.push({ date: d.toISOString().slice(0, 10), value: num(v) });
    });
  }
  return sorted(out);
}

// NOAA NCEI Climate at a Glance, monthly anomaly. Rows: YYYYMM, anomaly.
function parseNceiMonthly(text) {
  return sorted(lines(text).map(l => l.split(',')).filter(c => /^\d{6}$/.test((c[0] || '').trim()))
    .map(c => ({ date: iso(+c[0].trim().slice(0, 4), +c[0].trim().slice(4, 6), 15), value: num(c[1]) })));
}

// USGS earthquake catalogue, CSV. The first five columns are time, latitude, longitude, depth, mag.
// Value is the energy of each earthquake in joules: log10(E) = 1.5 x magnitude + 4.8.
function parseUsgsCsv(text) {
  return sorted(lines(text).map(l => l.split(',')).filter(c => /^\d{4}-\d{2}-\d{2}T/.test(c[0] || '') && num(c[4]) !== null)
    .map(c => ({ date: c[0].slice(0, 10), time: Date.parse(c[0]), value: 10 ** (1.5 * num(c[4]) + 4.8) })));
}

// SILSO estimated sunspot number for the current month. Columns: year, month, day, fraction, number, ...
function parseEisn(text) {
  return sorted(lines(text).map(l => l.split(',')).filter(c => c.length >= 5 && num(c[0]) > 1800)
    .map(c => ({ date: iso(+c[0], +c[1], +c[2]), value: num(c[4]) })).filter(r => r.value !== null && r.value >= 0));
}

// Our World in Data energy file. We want the World rows and the primary_energy_consumption column, in TWh a year.
function parseOwidEnergy(text) {
  const all = text.split(/\r?\n/), head = all[0].split(',');
  const iCountry = head.indexOf('country'), iYear = head.indexOf('year'), iVal = head.indexOf('primary_energy_consumption');
  if (iCountry < 0 || iYear < 0 || iVal < 0) throw new Error('Expected columns not found in the energy file.');
  return sorted(all.filter(l => l.startsWith('World,')).map(l => l.split(','))
    .map(c => ({ date: iso(+c[iYear], 7, 1), value: num(c[iVal] === '' ? 'x' : c[iVal]) })));
}

const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// Every address we rely on, in one place. "backup" sources are tried when the main one for that tube fails.
const SOURCES = [
  { id: 'litho-usgs', tube: 'LITHO', role: 'main', parse: parseUsgsCsv,
    url: () => `https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&starttime=${daysAgo(30)}&minmagnitude=5&orderby=time-asc` },
  { id: 'ocean-oisst', tube: 'OCEAN', role: 'main', parse: parseOisstJson,
    url: () => 'https://climatereanalyzer.org/clim/sst_daily/json/oisst2.1_world2_sst_day.json' },
  { id: 'ocean-ncei', tube: 'OCEAN', role: 'backup', parse: parseNceiMonthly,
    url: () => `https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance/global/time-series/globe/ocean/tavg/1/0/1990-${new Date().getUTCFullYear()}/data.csv` },
  { id: 'atmos-gistemp', tube: 'ATMOS', role: 'main', parse: parseGistemp,
    url: () => 'https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv' },
  { id: 'atmos-ncei', tube: 'ATMOS', role: 'backup', parse: parseNceiMonthly,
    url: () => `https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance/global/time-series/globe/land_ocean/tavg/1/0/1990-${new Date().getUTCFullYear()}/data.csv` },
  { id: 'cryo-north', tube: 'CRYO', role: 'main', parse: parseNsidcDaily,
    url: () => 'https://noaadata.apps.nsidc.org/NOAA/G02135/north/daily/data/N_seaice_extent_daily_v4.0.csv' },
  { id: 'cryo-south', tube: 'CRYO', role: 'main', parse: parseNsidcDaily,
    url: () => 'https://noaadata.apps.nsidc.org/NOAA/G02135/south/daily/data/S_seaice_extent_daily_v4.0.csv' },
  { id: 'chemo-daily', tube: 'CHEMO', role: 'main', parse: parseCo2Daily,
    url: () => 'https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_trend_gl.csv' },
  { id: 'chemo-monthly', tube: 'CHEMO', role: 'backup', parse: parseCo2Monthly,
    url: () => 'https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_gl.csv' },
  { id: 'anth-owid', tube: 'ANTH', role: 'main', parse: parseOwidEnergy,
    url: () => 'https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv' },
  { id: 'solar-silso', tube: 'SOLAR', role: 'main', parse: parseSilsoDaily,
    url: () => 'https://www.sidc.be/SILSO/INFO/sndtotcsv.php' },
  { id: 'solar-eisn', tube: 'SOLAR', role: 'extra', parse: parseEisn,
    url: () => 'https://www.sidc.be/SILSO/DATA/EISN/EISN_current.csv' },
];

module.exports = { get, SOURCES, parseCo2Daily, parseCo2Monthly, parseGistemp, parseSilsoDaily, parseNsidcDaily, parseOisstJson, parseNceiMonthly, parseUsgsCsv, parseOwidEnergy, parseEisn };
