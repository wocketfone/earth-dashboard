// Earth Dashboard mapping rules, version 1.
// Turns a measured value into a tube digit. Pure functions, no network, so the fetcher and the tests share them.

const DEADBAND = 0.15;                       // fraction of a step a value must pass a boundary by before the digit moves
const TRANSFORMS = {
  linear: x => x,
  log10: x => Math.log10(x),                 // LITHO and TECH: equal ratios are equal steps
  sqrt: x => Math.sqrt(Math.max(0, x)),      // SOLAR: the standard way to even out sunspot numbers
};

// Era 0 rules. "normal" is the 2001-2020 value unless stated. null means "computed from data when the fetcher is commissioned".
// counts: whether a pinned tube counts toward the reset rule. Steady tubes don't, or a quiet sun would trigger a reset.
// PALIN doesn't either: renewables reaching 9 is good news, not the planet outrunning its scale.
const RULES = {
  LITHO: { family: 'steady',   transform: 'log10',  normal: null,  step: null, counts: false, unit: 'joules of earthquake energy in the window' },
  // OCEAN and ATMOS ask two questions. Year: how far from 2001-2020, at 0.3 a step. Today and 90 days: how far from
  // the same time of year over the last ten years, at 0.15 a step. That second question is what makes them move.
  OCEAN: { family: 'climbing', transform: 'linear', normal: 0,     step: 0.3,  recentStep: 0.15, counts: true,  unit: 'degrees C' },
  ATMOS: { family: 'climbing', transform: 'linear', normal: 0,     step: 0.3,  recentStep: 0.15, counts: true,  unit: 'degrees C' },
  CRYO:  { family: 'climbing', transform: 'linear', normal: 0,     step: 0.75, counts: true,  unit: 'standard deviations, Arctic and Antarctic averaged' },
  CHEMO: { family: 'climbing', transform: 'linear', normal: 390.6, step: 20,   counts: true,  unit: 'ppm of carbon dioxide' },
  CYCLO: { family: 'steady',   transform: 'linear', normal: 0,     step: 0.5,  wholeSteps: true, counts: false, unit: 'degrees C in the central Pacific; 0.5 is a weak El Nino, 2.0 a very strong one' },
  ANTH:  { family: 'climbing', transform: 'linear', normal: null,  step: null, counts: true,  unit: 'exajoules of primary energy per year' },
  PALIN: { family: 'climbing', transform: 'linear', normal: null,  step: null, counts: false, unit: 'percent of world electricity from renewables' },
  SOLAR: { family: 'steady',   transform: 'sqrt',   normal: 56.9,  step: 1.5,  counts: false, unit: 'sunspot number' },
};
const ORDER = ['LITHO', 'OCEAN', 'ATMOS', 'CRYO', 'CHEMO', 'CYCLO', 'ANTH', 'PALIN', 'SOLAR'];

// How many steps a value sits from normal. Positive means more of the thing measured.
function position(value, rule) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (!(rule.step > 0)) return null;                       // a rule with no step can't place a value
  const f = TRANSFORMS[rule.transform || 'linear'];
  let p = (f(value) - f(rule.normal)) / rule.step;
  // Whole-step tubes change digit when the value crosses a whole step, not half of one. CYCLO uses this so its
  // digits line up with the official El Nino strengths: 0.5 is weak, 1.0 moderate, 1.5 strong, 2.0 very strong.
  if (rule.wholeSteps) p = Math.sign(p) * Math.max(Math.abs(p) - 0.5 + 1e-9, 0);
  return p;
}

// Rounding rule: exact halves round up, toward "more". 1 and 9 mean "this far or further".
function rawDigit(p) { return Math.min(9, Math.max(1, Math.floor(p + 0.5) + 5)); }

// Deadband: a tube keeps its digit until the value is clearly past the boundary.
function digit(p, prev) {
  if (p === null || p === undefined || Number.isNaN(p)) return null;
  const r = rawDigit(p);
  if (prev === null || prev === undefined || prev === r) return r;
  const lo = prev === 1 ? -Infinity : prev - 5 - 0.5 - DEADBAND;
  const hi = prev === 9 ? Infinity : prev - 5 + 0.5 + DEADBAND;
  return p >= lo && p < hi ? prev : r;
}

// Steady tubes: step sized so that the middle 90% of baseline windows spans digits 2 to 8.
function steadyRule(baselineValues, transform = 'linear') {
  const f = TRANSFORMS[transform], v = baselineValues.map(f).sort((a, b) => a - b);
  const q = x => { const i = (v.length - 1) * x, lo = Math.floor(i), hi = Math.ceil(i); return v[lo] + (v[hi] - v[lo]) * (i - lo); };
  const inv = { linear: x => x, log10: x => 10 ** x, sqrt: x => x * x }[transform];
  return { transform, normal: inv(q(0.5)), step: (q(0.95) - q(0.05)) / 6 };
}

// Nine digits as the frame file writes them: 1-9, or "-" for no reading.
function encode(digits) { return digits.map(d => d === null || d === undefined ? '-' : String(d)).join(''); }

// Reset rule: three or more counting tubes have each sat at 1 or 9 on the Year button for 365 days running.
// history: one entry per day, oldest first, each an array of nine Year digits.
// A day with no reading for a tube neither counts nor breaks its run, but a tube needs real readings on most days.
function resetDue(history, rules = RULES, days = 365, needed = 3, minReadings = 300) {
  if (history.length < days) return false;
  const recent = history.slice(-days);
  let pinned = 0;
  ORDER.forEach((name, i) => {
    if (!rules[name].counts) return;
    const seen = recent.map(day => day[i]).filter(d => d !== null && d !== undefined);
    if (seen.length >= minReadings && seen.every(d => d === 1 || d === 9)) pinned++;
  });
  return pinned >= needed;
}

// After a reset, button 4 shows where the old normal sits on the new scale. The step is unchanged between eras.
function memoryDigit(oldNormal, newRule) { return digit(position(oldNormal, newRule), null); }

// How often each source reports, in days. A tube is "slow" on a button whose window is shorter than this.
const CADENCE = { LITHO: 0, OCEAN: 30, ATMOS: 30, CRYO: 1, CHEMO: 1, CYCLO: 30, ANTH: 365, PALIN: 365, SOLAR: 1 };
const WINDOWS = [1, 90, 365];                // buttons 1 to 3, in days

// Builds one frame file. positions: three arrays (today, 90 days, year) of nine step-positions, null for no reading.
// previous: the last file's "d" strings, so the deadband has something to hold on to. baseline: nine digits for button 4.
function buildFrame({ seq, made, poll = 3600, era = 0, ready = false, glow = '', positions, previous = null, baseline = [5, 5, 5, 5, 5, 5, 5, 5, 5], cadence = CADENCE, stale = [] }) {
  const prevDigit = (b, i) => { const c = previous && previous[b] ? previous[b][i] : '-'; return c >= '1' && c <= '9' ? +c : null; };
  const rows = positions.map((row, b) => row.map((p, i) => digit(p, prevDigit(b, i))));
  rows.push(baseline.slice());
  const slow = rows.map((row, b) => row.map((d, i) => b < 3 && d !== null && (cadence[ORDER[i]] > WINDOWS[b] || stale.includes(ORDER[i])) ? '1' : '0').join(''));
  const file = { v: 1, seq, made, poll, era, ready, glow, d: rows.map(encode), slow };
  const error = validateFrame(file);
  if (error) throw new Error('Refusing to publish a bad frame: ' + error);
  return file;
}

// The same checks the board makes. Returns null when the file is good, or a sentence saying what's wrong.
function validateFrame(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return 'The file must be one JSON object.';
  if (o.v !== 1) return '"v" must be 1.';
  if (!Number.isInteger(o.seq) || o.seq < 0) return '"seq" must be a whole number, 0 or more.';
  if (!Number.isInteger(o.poll) || o.poll < 60) return '"poll" must be a whole number of seconds, 60 or more.';
  if (typeof o.made !== 'string' || Number.isNaN(Date.parse(o.made))) return '"made" must be a date and time.';
  if (!Number.isInteger(o.era) || o.era < 0) return '"era" must be a whole number, 0 or more.';
  if (typeof o.ready !== 'boolean') return '"ready" must be true or false.';
  if (typeof o.glow !== 'string' || !/^([0-9A-Fa-f]{6})?$/.test(o.glow)) return '"glow" must be empty or six hex characters.';
  for (const key of ['d', 'slow']) if (!Array.isArray(o[key]) || o[key].length !== 4) return `"${key}" must list four strings, one per button.`;
  for (let b = 0; b < 4; b++) {
    if (typeof o.d[b] !== 'string' || !/^[1-9-]{9}$/.test(o.d[b])) return `Button ${b + 1}: "d" must be nine characters, each 1 to 9 or "-".`;
    if (typeof o.slow[b] !== 'string' || !/^[01]{9}$/.test(o.slow[b])) return `Button ${b + 1}: "slow" must be nine characters, each 0 or 1.`;
  }
  return null;
}

module.exports = { DEADBAND, TRANSFORMS, RULES, ORDER, CADENCE, WINDOWS, position, rawDigit, digit, steadyRule, encode, resetDue, memoryDigit, buildFrame, validateFrame };
