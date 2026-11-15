// Checks the recorded sequences in docs/sequences/ against the rules they're meant to show. No browser needed.
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'docs', 'sequences');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log(' x ' + m); } };
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
ok(index.sequences.length === 12, 'twelve sequences listed');
const near = (a, b, tol = 20) => Math.abs(a - b) <= tol;
for (const entry of index.sequences) {
  const s = JSON.parse(fs.readFileSync(path.join(DIR, entry.file), 'utf8')), n = s.name;
  ok(s.name + '.json' === entry.file && s.changes.length === entry.changes && s.lengthMs === entry.lengthMs, `${n}: matches the index`);
  // replay
  const states = [{ at: 0, ...s.start }]; for (const c of s.changes) states.push({ ...states[states.length - 1], ...c });
  ok(s.changes.every((c, i) => c.at > (i ? s.changes[i - 1].at : -1) && c.at <= s.lengthMs), `${n}: changes are in time order`);
  ok(JSON.stringify({ ...states[states.length - 1], at: 0 }) === JSON.stringify({ at: 0, ...s.end }), `${n}: replaying the changes gives the recorded end`);
  ok(states.every(x => /^[0-9-]{9}$/.test(x.show) && /^[01]{9}$/.test(x.lamps)), `${n}: every state is nine digits and nine lamps`);
  // one digit at a time: between two moments a tube either holds, moves by one, goes dark, comes back from dark, or starts a sweep or lamp test at 0
  let jumps = 0; for (let i = 1; i < states.length; i++) for (let t = 0; t < 9; t++) { const a = states[i - 1].show[t], b = states[i].show[t]; if (a === b || a === '-' || b === '-' || b === '0') continue; if (Math.abs(+a - +b) !== 1) { const backFromTest = +a === 9 && states[i - 1].show === '999999999' && /lamp test/.test(JSON.stringify(s.events)); if (!backFromTest) jumps++; } }
  ok(jumps === 0, `${n}: no tube ever skips a digit (${jumps} skips)`);
  ok(states.every(x => !x.asleep || (x.show === '---------' && x.lamps === '000000000')), `${n}: asleep means everything dark`);
  // a sweep, where there is one: 0 up to 9 then 8, 7, 6, 5, each 220 ms after the last, all tubes together
  const shows = s.changes.filter(c => c.show), i0 = shows.findIndex(c => c.show === '000000000');
  const lampTest = s.events.some(e => /lamp test/.test(e.what));
  if (i0 >= 0 && !lampTest) {
    const want = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '8', '7', '6', '5'].map(d => d.repeat(9)), got = shows.slice(i0, i0 + 14);
    ok(got.length === 14 && got.every((c, k) => c.show === want[k]), `${n}: the sweep runs 0 to 9 then back to 5`);
    ok(got.every((c, k) => k === 0 || near(c.at - got[k - 1].at, 220)), `${n}: each sweep step is 220 ms`);
    const next = shows[i0 + 14], idle = next ? next.at - got[13].at : null, wake = s.events.some(e => /walks up|covered button/.test(e.what)) || (s.events[0].what === 'everyone leaves' && s.events.length > 1);
    if (next && next.show !== '000000000') ok(near(idle, (wake ? 5000 : 2000) + 220, 30), `${n}: the idle at 5 lasts ${wake ? 5 : 2} seconds, got ${idle - 220} ms`);
    const walk = []; for (let k = i0 + 14; k < shows.length && shows[k].show !== '000000000'; k++) walk.push(shows[k]);
    ok(walk.every((c, k) => k === 0 || near(c.at - walk[k - 1].at, 700)), `${n}: each walk step is 700 ms`);
    ok(walk.length <= 4, `${n}: the walk from 5 is never more than four steps`);
  }
  if (lampTest) { const run = shows.slice(i0, i0 + 10); ok(run.every((c, k) => c.show === String(k).repeat(9)) && run.every((c, k) => k === 0 || near(c.at - run[k - 1].at, 1000)), `${n}: the lamp test shows 0 to 9, a second each`); ok(s.end.show === s.start.show && s.end.lamps === s.start.lamps, `${n}: and returns to the reading it left`); }
}
// each sequence ends where its frame says it should
const end = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const B = end('01-press-at-rest.json').frame;
for (const [f, row] of [['01-press-at-rest.json', 1], ['02-wake.json', 0], ['03-press-during-sweep.json', 2], ['04-press-during-idle.json', 3], ['05-press-during-walk.json', 0], ['08-dark-tubes.json', 2], ['10-press-while-asleep.json', 1]]) { const s = end(f); ok(s.end.show === B.d[row] && s.end.lamps === B.slow[row], `${f}: ends on button ${row + 1}'s digits and lamps`); }
{ const s = end('06-new-data-at-rest.json'); ok(s.end.show === '323456787' && s.end.lamps === '010000000' && !s.changes.some(c => c.show === '000000000'), 'new data at rest: reaches the new digits with no sweep'); ok(s.changes.filter(c => c.show).length === 2, 'new data at rest: two beats, because the furthest tube moves two digits'); }
{ const s = end('09-sleep.json'); ok(s.end.asleep === true && s.end.show === '---------' && s.changes.length === 1, 'sleep: one change, to dark'); }
{ const s = end('11-reset.json'); ok(s.start.era === 0 && s.end.era === 1 && s.end.glow === '7A5CFF' && s.end.show === '666666666' && s.end.ready === false, 'reset: ends on scale 1 with its colour and its readings'); const lit = s.changes.find(c => c.ready === true), press = s.events.find(e => /covered/.test(e.what)), moved = s.changes.find(c => c.era === 1); ok(lit && moved && lit.at < press.at && moved.at >= press.at && moved.at - press.at <= 20, 'reset: the lamp lights first, and the scale changes only at the press'); }
{ const s = end('12-covered-button-unlit.json'); ok(s.changes.length === 0, 'covered button with the lamp unlit: nothing happens'); }
{ const s = end('05-press-during-walk.json'); ok(s.changes.filter(c => c.show === '000000000').length === 2, 'press during the walk: the sweep runs twice'); }
{ const s = end('03-press-during-sweep.json'); ok(s.changes.filter(c => c.show === '000000000').length === 1, 'press during the sweep: the sweep is not restarted'); }
console.log(`sequences: PASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
