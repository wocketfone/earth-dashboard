// Fetches one named source and returns its parsed rows, or throws with a plain reason.
// For testing, EARTH_FIXTURES names a folder of saved files (one per source id) to read in place of the network.
const fs = require('fs'), path = require('path');
const { get, SOURCES } = require('./sources.js');
const byId = Object.fromEntries(SOURCES.map(s => [s.id, s]));
const FIXTURES = process.env.EARTH_FIXTURES;

async function load(id, url) {
  const src = byId[id];
  let text;
  if (FIXTURES) {
    const file = path.join(FIXTURES, id + '.txt');
    if (!fs.existsSync(file)) throw new Error(`${id}: the server answered 404`);
    text = fs.readFileSync(file, 'utf8');
  } else {
    const res = await get(url || src.url());
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
