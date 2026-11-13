// Fetches one named source and returns its parsed rows, or throws with a plain reason.
const { get, SOURCES } = require('./sources.js');
const byId = Object.fromEntries(SOURCES.map(s => [s.id, s]));

async function load(id, url) {
  const src = byId[id], res = await get(url || src.url());
  if (!res.ok) throw new Error(`${id}: the server answered ${res.status}`);
  const rows = src.parse(res.text);
  if (!rows.length) throw new Error(`${id}: the file arrived but held no readable rows`);
  return rows;
}
const usgsUrl = (from, to) => `https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&starttime=${from}${to ? '&endtime=' + to : ''}&minmagnitude=5&orderby=time-asc`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { load, usgsUrl, sleep };
