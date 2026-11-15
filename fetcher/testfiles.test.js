// Checks the bench test files: every "accept" file passes the same checks the fetcher applies to the live frame,
// every "reject" file fails them, and the copies saved in public/test/ match what the generator makes.
const fs = require('fs'), os = require('os'), path = require('path');
const M = require('./mapping.js'), T = require('./testfiles.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log(' x ' + m); } };
const check = body => { let o; try { o = JSON.parse(body); } catch (e) { return 'not JSON'; } return M.validateFrame(o); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-')), NOW = Date.parse('2026-11-15T20:30:00Z'), index = T.writeAll(tmp, NOW);
const read = f => fs.readFileSync(path.join(tmp, f), 'utf8');
for (const e of index.files) {
  if (e.file === 'bad/no-such-file.json') { ok(!fs.existsSync(path.join(tmp, e.file)), 'the 404 address really has no file'); continue; }
  const why = check(read(e.file));
  if (e.expect === 'accept') { ok(why === null, `${e.file} must be accepted, but: ${why}`); ok(read(e.file).length < 400 && read(e.file).endsWith('\n'), `${e.file} is small and ends with a newline`); ok(typeof e.shows === 'string' && e.shows.length > 20, `${e.file} says what it shows`); }
  else { ok(why !== null, `${e.file} must be rejected, but it passed`); ok(typeof e.why === 'string' && e.why.length > 10, `${e.file} says why it is bad`); }
}
ok(index.files.filter(e => e.expect === 'accept').length === 10 && index.files.filter(e => e.expect === 'reject').length === 15, 'ten to accept, fifteen to reject');
ok(new Set(index.files.map(e => e.file)).size === index.files.length, 'no file listed twice');
// each bad file is bad for one reason only: mending that one thing makes it pass (where it parses at all)
const good = JSON.parse(read('calm.json'));
for (const [name] of T.BAD) { let o; try { o = JSON.parse(read(name)); } catch (e) { continue; } if (Array.isArray(o)) continue; const diff = Object.keys(good).filter(k => JSON.stringify(o[k]) !== JSON.stringify(good[k])); ok(diff.length === 1, `${name} differs from a good frame in exactly one field: ${diff}`); }
// the reset pair hangs together
const r0 = JSON.parse(read('reset/frame-0.json')), r1 = JSON.parse(read('reset/frame-1.json'));
ok(r0.era === 0 && r0.ready === true && r0.glow === '' && r1.era === 1 && r1.ready === false && r1.glow === '7A5CFF' && r1.seq < r0.seq, 'reset pair: lamp lit on the old scale, colour on the new, and the new count starts again');
// the moving file
const a = T.moving(NOW), b = T.moving(NOW + 3600000), c = T.moving(NOW + 59 * 60000 - 30 * 60000);
ok(M.validateFrame(a) === null && M.validateFrame(b) === null, 'moving: valid at any hour'); ok(b.seq === a.seq + 1 && c.seq === a.seq, 'moving: the number goes up by one on the hour and not between');
ok([0, 1, 2].every(r => [...a.d[r]].every((ch, i) => { const x = +ch, y = +b.d[r][i]; return y === (x % 9) + 1; })), 'moving: every tube steps by exactly one digit each hour (9 wraps to 1)');
ok(a.d[0] !== a.d[1] && a.d[1] !== a.d[2] && a.d[3] === '555555555' && new Set(a.d[0]).size === 9, 'moving: the three buttons differ and each shows all nine digits');
ok([...a.slow[0]].filter(ch => ch === '1').length === 1 && a.slow[0] !== b.slow[0], 'moving: one lamp lit, and it moves');
for (let h = 0; h < 30; h++) ok(M.validateFrame(T.moving(NOW + h * 3600000)) === null, 'moving: valid at hour +' + h);
ok(a.made === '2026-11-15T20:00:00.000Z', 'moving: stamped on the hour: ' + a.made);
// what is saved in the repository is what the generator makes (apart from the hourly file)
const saved = path.join(__dirname, '..', 'public', 'test');
if (fs.existsSync(saved)) { for (const e of index.files) { if (e.file === 'moving.json' || e.file === 'bad/no-such-file.json') continue; ok(fs.existsSync(path.join(saved, e.file)) && fs.readFileSync(path.join(saved, e.file), 'utf8') === read(e.file), `saved copy of ${e.file} is current`); }
  ok(fs.readFileSync(path.join(saved, 'index.json'), 'utf8') === read('index.json'), 'saved index is current'); ok(M.validateFrame(JSON.parse(fs.readFileSync(path.join(saved, 'moving.json'), 'utf8'))) === null, 'saved moving file is valid'); }
else ok(false, 'public/test is missing: run node fetcher/testfiles.js');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`testfiles: PASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
