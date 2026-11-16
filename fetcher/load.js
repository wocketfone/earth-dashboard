// Fetches one named source and returns its parsed rows, or throws with a plain reason.
// For testing, EARTH_FIXTURES names a folder of saved files (one per source id) to read in place of the network.
const fs = require('fs'), path = require('path');
const { get, SOURCES } = require('./sources.js');
const byId = Object.fromEntries(SOURCES.map(s => [s.id, s]));
const FIXTURES = process.env.EARTH_FIXTURES;

// A few sources are large files that change rarely. Those are fetched at most once every `keepHours` and the parsed rows
// are kept in data/cache between times. If a later fetch fails, the kept rows are used, however old: they are real
// readings, and their own dates tell the frame job how stale they are.
const cacheFile = id => path.join(root(), 'data', 'cache', id + '.json');
const useCache = () => !FIXTURES || process.env.EARTH_CACHE === '1';
function readCache(id) { try { const c = JSON.parse(fs.readFileSync(cacheFile(id), 'utf8')); return Array.isArray(c.rows) && c.rows.length && typeof c.fetched === 'string' ? c : null; } catch (e) { return null; } }

async function load(id, url) {
  const src = byId[id], keep = src.keepHours && !url && useCache();
  const kept = keep ? readCache(id) : null;
  if (kept && (clock() - Date.parse(kept.fetched)) / 3600000 < src.keepHours && clock() >= Date.parse(kept.fetched)) return kept.rows;
  try {
    let rows = await fetchRows(id, url);
    // A source's record should only ever grow. If a fresh copy ends earlier than the kept one, it was cut short or
    // rolled back, so the kept rows stand. The time is still noted, so a broken source isn't asked again every run.
    if (kept && rows[rows.length - 1].date < kept.rows[kept.rows.length - 1].date) rows = kept.rows;
    if (keep) { fs.mkdirSync(path.dirname(cacheFile(id)), { recursive: true }); fs.writeFileSync(cacheFile(id), JSON.stringify({ fetched: new Date(clock()).toISOString(), rows }) + '\n'); }
    return rows;
  } catch (e) { if (kept) return kept.rows; throw e; }
}
async function fetchRows(id, url) {
  const src = byId[id];
  let text;
  if (FIXTURES) {
    const file = path.join(FIXTURES, id + '.txt');
    if (!fs.existsSync(file)) throw new Error(`${id}: the server answered 404`);
    text = fs.readFileSync(file, 'utf8');
  } else {
    const res = await get(url || src.url(), src.keepHours ? 240000 : undefined);
    if (!res.ok) throw new Error(`${id}: the server answered ${res.status}`);
    text = res.text;
  }
  let rows = src.parse(text);
  if (FIXTURES && url) {                                   // honour the date range a real query would have applied
    const m = /starttime=(\d{4}-\d{2}-\d{2})(?:&endtime=(\d{4}-\d{2}-\d{2}))?/.exec(url);
    if (m) rows = rows.filter(r => r.date >= m[1] && (!m[2] || r.date < m[2]));
  }
  if (!rows.length) throw new Error(`${id}: the file arrived but held no readable rows`);
  return rows;
}
const usgsUrl = (from, to) => `https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&starttime=${from}${to ? '&endtime=' + to : ''}&minmagnitude=5&orderby=time-asc`;
const sleep = ms => new Promise(r => setTimeout(r, FIXTURES ? 0 : ms));
// The clock and the folder can be pinned for testing.
const clock = () => (process.env.EARTH_NOW ? Date.parse(process.env.EARTH_NOW) : Date.now());
const root = () => process.env.EARTH_ROOT || path.join(__dirname, '..');

module.exports = { load, usgsUrl, sleep, clock, root };
