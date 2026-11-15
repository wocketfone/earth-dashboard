// Writes the bench test files into public/test/. These are made-up frames at fixed addresses, for checking a board
// (or the emulator) without waiting for the planet to do something. Each one says in public/test/index.json whether
// a board should accept it, and what the tubes should then show.
// Run with no arguments to rebuild them all. "moving" alone rebuilds only the file that changes every hour.
const fs = require('fs'), path = require('path');
const M = require('./mapping.js');
const { clock, root } = require('./load.js');

const MADE = '2026-11-15T12:00:00.000Z', Z = '000000000', FIVES = '555555555';
const frame = (d, more = {}) => ({ v: 1, seq: 1, made: MADE, poll: 3600, era: 0, ready: false, glow: '', d, slow: [Z, Z, Z, Z], ...more });
const text = o => JSON.stringify(o) + '\n';

// name, what a board should do, the file, and what to look for
const GOOD = [
  ['calm.json', frame([FIVES, FIVES, FIVES, FIVES]), 'Every tube at 5 on every button. After the sweep, nothing walks.'],
  ['spread.json', frame(['123456789', '987654321', '159159159', FIVES]), 'Button 1 reads 1 to 9 across the tubes in file order. Button 2 reads 9 down to 1. Button 3 alternates 1, 5, 9. Shows every digit on every tube and the longest walks.'],
  ['pinned.json', frame(['999991111', '111119999', '919191919', FIVES]), 'Only 1s and 9s, the two ends of the scale. The walk from 5 takes four steps on every tube.'],
  ['dark.json', frame(['1-3-5-7-9', '---------', '5555-5555', '5-5-5-5-5']), 'A "-" is a tube with no reading: it goes dark at the walk, with its lamp off. Button 2 leaves all nine dark. The sweep and the idle still light every tube.'],
  ['lamps.json', frame([FIVES, FIVES, FIVES, FIVES], { slow: ['111111111', '101010101', '000000001', Z] }), 'Marker lamps only. Button 1 lights all nine, button 2 every other one, button 3 the last tube only, button 4 none.'],
  ['extra-fields.json', { note: 'A board must ignore fields it does not know.', ...frame(['246813579', FIVES, FIVES, FIVES]), future: { anything: [1, 2, 3] } }, 'Has fields a board has never heard of. It must be accepted, and button 1 reads 2 4 6 8 1 3 5 7 9.'],
  ['poll-short.json', frame([FIVES, FIVES, FIVES, FIVES], { poll: 60 }), 'Asks to be fetched every 60 seconds, the shortest wait allowed.'],
  ['reset/frame-0.json', frame(['999999999', '999999999', '999999999', FIVES], { seq: 40, ready: true }), 'The original scale with the reset lamp lit ("ready": true). The lamp by the covered button lights. Pressing it moves the board to reset/frame-1.json.'],
  ['reset/frame-1.json', frame(['666666666', '666666666', '666666666', '111111111'], { era: 1, glow: '7A5CFF' }), 'The scale after a reset: every tube at 6, the tube-base colour 7A5CFF, and button 4 showing the old normal at 1. Its own frame number starts again at 1. The lamp is not lit, so the covered button does nothing here.'],
];
const BAD = [
  ['bad/not-json.json', '<!doctype html><html><body><h1>Moved</h1></body></html>\n', 'A web page where the file should be.'],
  ['bad/cut-short.json', text(frame([FIVES, FIVES, FIVES, FIVES])).slice(0, 96), 'The file stops partway through, as after a dropped connection.'],
  ['bad/empty.json', '', 'An empty file.'],
  ['bad/digit-zero.json', text(frame(['505555555', FIVES, FIVES, FIVES])), 'One digit is 0, which is never a reading.'],
  ['bad/digit-letter.json', text(frame(['55555555x', FIVES, FIVES, FIVES])), 'One character is a letter.'],
  ['bad/eight-tubes.json', text(frame(['55555555', FIVES, FIVES, FIVES])), 'Button 1 has eight characters, not nine.'],
  ['bad/ten-tubes.json', text(frame(['5555555555', FIVES, FIVES, FIVES])), 'Button 1 has ten characters.'],
  ['bad/three-buttons.json', text(frame([FIVES, FIVES, FIVES])), '"d" has three strings, not four.'],
  ['bad/version-2.json', text(frame([FIVES, FIVES, FIVES, FIVES], { v: 2 })), 'A format version this board does not know.'],
  ['bad/poll-too-short.json', text(frame([FIVES, FIVES, FIVES, FIVES], { poll: 5 })), '"poll" is under 60 seconds.'],
  ['bad/lamp-flag.json', text(frame([FIVES, FIVES, FIVES, FIVES], { slow: ['200000000', Z, Z, Z] })), 'A lamp flag that is neither 0 nor 1.'],
  ['bad/seq-text.json', text(frame([FIVES, FIVES, FIVES, FIVES], { seq: '7' })), '"seq" is text, not a number.'],
  ['bad/glow-hash.json', text(frame([FIVES, FIVES, FIVES, FIVES], { glow: '#7A5CFF' })), 'The colour has a "#" in front, making it seven characters.'],
  ['bad/a-list.json', text([frame([FIVES, FIVES, FIVES, FIVES])]), 'A valid frame wrapped in a list.'],
];
// One file changes every hour, so a board left running can be seen walking quietly to new data with nobody pressing anything.
function moving(now) {
  const hour = Math.floor(now / 3600000), at = new Date(hour * 3600000).toISOString(), k = hour % 9;
  const row = shift => Array.from({ length: 9 }, (_, i) => 1 + ((i + k + shift) % 9)).join('');
  return frame([row(0), row(3), row(6), FIVES], { seq: hour, made: at, slow: [Array.from({ length: 9 }, (_, i) => (i === k ? '1' : '0')).join(''), Z, Z, Z] });
}
const MOVING_NOTE = 'Changes on the hour, every hour. Button 1 reads 1 to 9 across the tubes, moved along by one tube each hour, and one marker lamp moves with it. A board left resting on button 1 should step every tube by one digit, with no sweep. "seq" is the number of hours since 1970, so it always rises.';

function writeAll(dir, now) {
  fs.rmSync(dir, { recursive: true, force: true });
  const put = (name, body) => { const f = path.join(dir, name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); };
  const index = { about: 'Bench test files for the Earth Dashboard. Fetch each from this folder. "accept" files must pass the board\'s checks; "reject" files must be refused whole, leaving the last good frame on the tubes.', base: 'https://raw.githubusercontent.com/wocketfone/earth-dashboard/main/public/test/', files: [] };
  for (const [name, o, shows] of GOOD) { put(name, text(o)); index.files.push({ file: name, expect: 'accept', shows }); }
  put('moving.json', text(moving(now))); index.files.push({ file: 'moving.json', expect: 'accept', shows: MOVING_NOTE });
  for (const [name, body, why] of BAD) { put(name, body); index.files.push({ file: name, expect: 'reject', why }); }
  index.files.push({ file: 'bad/no-such-file.json', expect: 'reject', why: 'There is no file here, so the server answers 404.' });
  put('index.json', JSON.stringify(index, null, 1) + '\n');
  return index;
}
module.exports = { GOOD, BAD, moving, writeAll, MOVING_NOTE };

if (require.main === module) {
  const dir = path.join(root(), 'public', 'test');
  if (process.argv[2] === 'moving') { if (fs.existsSync(dir)) fs.writeFileSync(path.join(dir, 'moving.json'), text(moving(clock()))); }   // delete the folder and this stops
  else console.log('Wrote', writeAll(dir, clock()).files.length, 'test files to', dir);
}
