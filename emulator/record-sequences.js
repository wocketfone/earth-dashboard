// Records what the emulator's choreographer tells the tubes to do, moment by moment, for a set of situations.
// The results go in docs/sequences/. Firmware can be checked against them: same frame, same presses, same digits at the same times.
// Needs Node.js and Playwright. Run from the repository root:  node emulator/record-sequences.js
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'docs', 'sequences'), TICK = 10;      // sampled every 10 ms
const html = '<!doctype html><html><head><meta charset=utf-8></head><body>' + fs.readFileSync(path.join(__dirname, 'earth-dashboard-emulator.html'), 'utf8') + '</body></html>';
const test = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'test', f), 'utf8'));
const Z = '000000000', FIVES = '555555555';
const BENCH = { v: 1, seq: 10, made: '2026-11-15T12:00:00.000Z', poll: 3600, era: 0, ready: false, glow: '', d: ['123456789', '987654321', '19-555-91', FIVES], slow: ['100000000', '000000001', '000010000', Z] };
const NEWER = { ...BENCH, seq: 11, d: ['323456787', '987654321', '19-555-91', FIVES], slow: ['010000000', '000000001', '000010000', Z] };

(async () => {
  const b = await chromium.launch(), written = [];
  // run(name, what, frame, script): script gets helpers and returns nothing; everything is captured.
  async function run(name, what, frame, startOn, script, seconds) {
    const p = await b.newPage(); await p.setContent(html); await p.waitForTimeout(100);
    const st = () => p.evaluate(() => { const s = window.__emu.state(); return { show: s.sel.map(v => (v < 0 ? '-' : String(v))).join(''), lamps: s.lamps.map(v => (v ? '1' : '0')).join(''), era: s.era, glow: s.glow, ready: s.ready, asleep: s.asleep }; });
    const adv = ms => p.evaluate(s => window.__emu.advance(s), ms / 1000);
    const send = async f => { await p.fill('#framebox', JSON.stringify(f)); await p.click('#sendframe'); };
    await adv(10000); await send(frame); await adv(15000);
    if (startOn !== 0) { await p.evaluate(i => window.__emu.press(i), startOn); await adv(20000); }
    let now = 0, last = await st(); const events = [], changes = [];
    const rec = { name, what, frame, timings: { sampledEveryMs: TICK, sweepStepMs: 220, walkStepMs: 700, idleAfterPressMs: 2000, idleAfterWakeMs: 5000, lampTestStepMs: 1000 }, start: last, events, changes };
    const wait = async ms => { for (let k = 0; k < Math.round(ms / TICK); k++) { await adv(TICK); now += TICK; const s = await st(); if (JSON.stringify(s) !== JSON.stringify(last)) { const c = { at: now }; for (const key in s) if (s[key] !== last[key]) c[key] = s[key]; changes.push(c); last = s; } } };
    const act = async (label, fn) => { events.push({ at: now, what: label }); await fn(); };
    const h = { wait, press: n => act(`press button ${n}`, () => p.evaluate(i => window.__emu.press(i), n - 1)), click: (label, id) => act(label, () => p.click(id)),
      newFrame: (label, f) => act(label, () => send(f)), fetchPair: (label, f0, f1) => act(label, () => p.evaluate(async ([f0, f1]) => { await window.__emu.fetchLive(async u => ({ ok: true, status: 200, text: async () => JSON.stringify(/frame-1/.test(u) ? f1 : f0) }), Date.parse(f0.made) + 60000); }, [f0, f1])),
      reset: () => act('press the covered button', () => p.evaluate(() => window.__emu.pressReset())) };
    await script(h); await wait(seconds * 1000 - now > 0 ? seconds * 1000 - now : 0);
    rec.lengthMs = now; rec.end = last;
    fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(rec, null, 1).replace(/\{\n\s+"at": (\d+),\n\s+/g, '{ "at": $1, ').replace(/,\n\s+"(show|lamps|era|glow|ready|asleep|what)": /g, ', "$1": ').replace(/("(?:[^"\\]|\\.)*"|true|false|\d+)\n\s+\}(,?)\n/g, '$1 }$2\n') + '\n');
    written.push({ file: name + '.json', what, lengthMs: now, changes: changes.length }); await p.close();
  }
  await run('01-press-at-rest', 'Resting on button 1. Button 2 is pressed. Sweep up 0 to 9, fall back to 5, idle two seconds, then walk one digit a beat to the new readings.', BENCH, 0, async h => { await h.wait(500); await h.press(2); }, 13);
  await run('02-wake', 'Asleep and dark. Someone walks up. The same sequence, with a five-second idle at 5.', BENCH, 0, async h => { await h.click('everyone leaves', '#sleep'); await h.wait(2000); await h.click('someone walks up', '#wake'); }, 18);
  await run('03-press-during-sweep', 'Button 2 is pressed, then button 3 while the sweep is still running. The sweep carries on and the walk goes to button 3\'s readings.', BENCH, 0, async h => { await h.wait(500); await h.press(2); await h.wait(900); await h.press(3); }, 13);
  await run('04-press-during-idle', 'Button 2 is pressed, then button 4 during the idle at 5. No new sweep. The walk goes to button 4\'s readings, which are all 5, so nothing moves.', BENCH, 0, async h => { await h.wait(500); await h.press(2); await h.wait(3600); await h.press(4); }, 12);
  await run('05-press-during-walk', 'Button 2 is pressed, then button 1 partway through the walk. The whole sequence starts again from the sweep.', BENCH, 0, async h => { await h.wait(500); await h.press(2); await h.wait(6400); await h.press(1); }, 21);
  await run('06-new-data-at-rest', 'Resting on button 1 when a new frame arrives with three changed digits and a moved lamp. No sweep: each changed tube steps one digit a beat.', BENCH, 0, async h => { await h.wait(500); await h.newFrame('a new frame arrives', NEWER); }, 5);
  await run('07-lamp-test', 'The lamp test: every tube shows 0, then 1, up to 9, a second each, then returns to its reading.', BENCH, 0, async h => { await h.wait(500); await h.click('start the lamp test', '#lamp'); }, 20);
  await run('08-dark-tubes', 'Button 3 has two tubes with no reading. They sweep and idle with the rest, then go dark at the walk.', BENCH, 0, async h => { await h.wait(500); await h.press(3); }, 13);
  await run('09-sleep', 'Resting on button 2 when everyone leaves. All tubes and lamps go dark.', BENCH, 1, async h => { await h.wait(500); await h.click('everyone leaves', '#sleep'); }, 3);
  await run('10-press-while-asleep', 'Asleep. Button 2 is pressed, which also wakes it.', BENCH, 0, async h => { await h.click('everyone leaves', '#sleep'); await h.wait(2000); await h.press(2); }, 18);
  await run('11-reset', 'The reset. The board fetches a frame with the lamp lit, and the next scale\'s file. The covered button is pressed: the board moves to scale 1, the colour comes on, and the full sequence runs to the new readings.', BENCH, 0, async h => { await h.wait(500); await h.fetchPair('frame with "ready": true arrives', test('reset/frame-0.json'), test('reset/frame-1.json')); await h.wait(6000); await h.reset(); }, 22);
  await run('12-covered-button-unlit', 'The covered button is pressed while its lamp is not lit. Nothing happens.', BENCH, 0, async h => { await h.wait(500); await h.reset(); }, 3);
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ about: 'Recorded from the emulator. "show" is the digit each tube is told to show, in file order (LITHO, OCEAN, ATMOS, CRYO, CHEMO, CYCLO, ANTH, PALIN, SOLAR); "-" is blank. "lamps" is the nine marker lamps. Times are in milliseconds from the start of the recording, sampled every 10 ms. Each change lists only what changed.', sequences: written }, null, 1) + '\n');
  console.log(written.map(w => `${w.file}  ${w.lengthMs} ms  ${w.changes} changes`).join('\n')); await b.close();
})();
