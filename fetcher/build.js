// The regular job. Reads every source, works out the nine digits for each button, and writes public/frame-0.json.
// If a source fails, its tube keeps its last reading and its marker lamp lights. Nothing here can make a tube show a guess.
//
// It also runs the reset, with no person involved. When three or more counting tubes have sat pinned on the Year button
// for a year, it works out a new normal (the ten years ending that day), freezes it in data/normals-1.json, and starts
// publishing public/frame-1.json beside frame-0.json. frame-0.json then says "ready": true, which lights the lamp by the
// covered button. Every scale ever made keeps being published, so a board on any of them still gets readings.
const fs = require('fs'), path = require('path');
const { load, usgsUrl, clock, root } = require('./load.js');
const M = require('./mapping.js'), S = require('./series.js');
const { computeNormals, memory } = require('./normals.js');

const ROOT = root();
// Normals are read strictly: a damaged one stops the job, loudly, because guessing a scale would be worse than pausing.
const read = f => (fs.existsSync(path.join(ROOT, f)) ? JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')) : null);
// Everything else the job wrote for itself is read gently: a damaged file counts as missing and is simply written again.
const readSoft = f => { try { return read(f); } catch (e) { console.log(`${f} is damaged and will be rebuilt: ${e.message}`); return null; } };
const STALE_AFTER = { 0: 3, 1: 10, 30: 100, 365: 1000 };           // days without fresh data before a tube counts as stale
const ageDays = date => (clock() - S.toMs(date)) / S.DAY;

const GLOWS = ['7A5CFF', '3D7BFF', 'C04DFF'];                       // tube-base colour for scales 1, 2, 3, then round again. Scale 0 has none.
const TRIES = 48;                                                   // runs to wait for a failing source before a reset goes ahead without it
const files = e => ({ frame: `public/frame-${e}.json`, status: e ? `status/latest-${e}.json` : 'status/latest.json', history: e ? `data/year-history-${e}.csv` : 'data/year-history.csv' });
const save = (f, text) => { fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true }); fs.writeFileSync(path.join(ROOT, f), text); };

(async () => {
  const scales = [];
  for (let e = 0; ; e++) {
    const n = read(`data/normals-${e}.json`); if (!n) break;
    if (!n.tubes || typeof n.tubes !== 'object' || (n.era || 0) !== e) throw new Error(`data/normals-${e}.json doesn't describe scale ${e}. Restore it from the repository's history.`);
    scales.push({ ...n, era: e });
  }
  if (!scales.length) throw new Error('data/normals-0.json is missing. Run the normals job first.');
  // FRESH=1 forgets the previous digits for one run. Use it after a rule changes, so the deadband doesn't hold a tube
  // on a digit that was set under the old rule.
  const fresh = process.env.FRESH === '1';
  const now = clock(), today = new Date(now).toISOString().slice(0, 10);

  // Each reader returns { values: [today, 90 days, year], latest: 'YYYY-MM-DD', positions: [...] }.
  const three = (rows, rule) => {
    const end = rows[rows.length - 1].date, values = [rows[rows.length - 1].value, S.windowMean(rows, end, 90), S.windowMean(rows, end, 365)];
    return { values, latest: end, positions: values.map(v => M.position(v, rule)) };
  };
  // OCEAN and ATMOS: Today and 90 days compare with the same months of the last ten years. Year compares with 2001-2020.
  const twoQuestions = (rows, n) => {
    const end = rows[rows.length - 1].date, recent = { transform: 'linear', normal: 0, step: n.recentStep };
    const values = [S.vsRecentYears(rows, 1, n.recentYears), S.vsRecentYears(rows, 3, n.recentYears), S.windowMean(rows, end, 365)];
    return { values, latest: end, positions: [M.position(values[0], recent), M.position(values[1], recent), M.position(values[2], n)],
      note: 'Today and 90 days are degrees above the same months of the last ten years. Year is the level; normal is ' + n.normal + '.' };
  };
  // The same two questions from a daily source: today and the last 90 days against the same days of the last ten years.
  const twoQuestionsDaily = (all, n) => {
    const rows = all.filter(r => r.value !== null), end = rows[rows.length - 1].date, recent = { transform: 'linear', normal: 0, step: n.recentStep };
    const values = [S.vsRecentDays(rows, 1, n.recentYears), S.vsRecentDays(rows, 90, n.recentYears), S.windowMean(rows, end, 365)];
    return { values, latest: end, positions: [M.position(values[0], recent), M.position(values[1], recent), M.position(values[2], n)],
      note: 'Today and 90 days are degrees above the same days of the last ten years. Year is the level; normal is ' + n.normal + '.' };
  };
  // Daily first. If the daily source fails or has gone quiet for ten days, the monthly backup answers, on its own normal,
  // and the tube's lamp lights on the buttons a monthly source is too slow for.
  const temperature = async (n, dailyId, monthlyId) => {
    if (!n.daily) return twoQuestions(await load(monthlyId), n);
    let daily, why;
    try { daily = twoQuestionsDaily(await load(dailyId), n); if (ageDays(daily.latest) <= STALE_AFTER[1]) return daily; why = 'has published nothing new since ' + daily.latest; } catch (e) { why = 'failed: ' + e.message; }
    if (n.fallback) try {
      const r = twoQuestions(await load(monthlyId), { ...n, ...n.fallback });
      const covers = new Date(Date.UTC(+r.latest.slice(0, 4), +r.latest.slice(5, 7), 0)).toISOString().slice(0, 10);     // a monthly figure speaks for its whole month
      if (!daily || covers > daily.latest) return { ...r, cadence: n.fallback.cadence, source: n.fallback.source, note: r.note + ` This is the monthly backup, because the daily source ${why}.` };
    } catch (e) { /* the backup failed too */ }
    if (daily) return daily;
    throw new Error(`${dailyId} ${why}`);
  };
  const readers = {
    OCEAN: async n => temperature(n, 'ocean-daily-ecmwf', 'ocean-ncei'),
    ATMOS: async n => temperature(n, 'atmos-daily-ecmwf', 'atmos-gistemp'),
    CHEMO: async n => { let rows; try { rows = await load('chemo-daily'); } catch (e) { rows = await load('chemo-monthly'); } return three(rows, n); },
    CRYO: async n => three(S.pairMean(S.iceZ(await load('cryo-north'), n.clim.north), S.iceZ(await load('cryo-south'), n.clim.south)), n),
    SOLAR: async n => {
      let rows = await load('solar-silso');
      try { const last = rows[rows.length - 1].date; rows = rows.concat((await load('solar-eisn')).filter(r => r.date > last)); } catch (e) { /* the monthly file alone is fine */ }
      return three(rows, n);
    },
    CYCLO: async n => { let rows; try { rows = await load('cyclo-nino34'); } catch (e) { rows = await load('cyclo-oni'); } return three(rows, n); },
    PALIN: async n => { const rows = await load('palin-owid'), r = rows[rows.length - 1]; return { values: [r.value, r.value, r.value], latest: r.date, positions: [0, 0, 0].map(() => M.position(r.value, n)) }; },
    ANTH: async n => { const rows = await load('anth-owid'), r = rows[rows.length - 1]; return { values: [r.value, r.value, r.value], latest: r.date, positions: [0, 0, 0].map(() => M.position(r.value, n)) }; },
    LITHO: async n => {
      const from = new Date(now - 400 * S.DAY).toISOString().slice(0, 10), ev = await load('litho-usgs', usgsUrl(from));
      const values = [24, 90 * 24, 365 * 24].map(h => S.energySince(ev, now, h));
      const positions = values.map((v, i) => M.position(v, { transform: 'log10', ...n.windows[[1, 90, 365][i]] }));
      return { values, latest: today, positions };
    },
  };

  // Builds and publishes the file for one scale. ready: whether a newer scale exists.
  async function publish(normals, ready) {
  const era = normals.era, at = files(era), tag = `[scale ${era}]`;
  const prevStatus = readSoft(at.status) || { tubes: {} };
  let prev = readSoft(at.frame), lost = false;
  if (prev && M.validateFrame(prev)) { console.log(tag, 'The published frame fails its own checks and will be rebuilt.'); prev = null; }
  // The status file keeps a copy of the last frame. If the published one is lost or damaged, carry on from that copy,
  // so the tubes keep the digits they were holding.
  if (!prev && fs.existsSync(path.join(ROOT, at.status))) { lost = true; if (prevStatus.frame && !M.validateFrame(prevStatus.frame)) prev = prevStatus.frame; }
  // The frame number must never go backwards, even if the published file was lost. The status file remembers it too.
  const lastSeq = Math.max(prev ? prev.seq : 0, prevStatus.frame && Number.isInteger(prevStatus.frame.seq) ? prevStatus.frame.seq : 0);
  const status = { made: new Date(now).toISOString(), era, tubes: {} };
  const stale = [], cadence = { ...M.CADENCE };
  for (const name of M.ORDER) {
    const n = normals.tubes[name];
    // A tube carried over from the scale before sits on the same scale there, so its held reading is still right here.
    const last = prevStatus.tubes[name] || (n && n.carried && era > 0 ? ((readSoft(files(era - 1).status) || { tubes: {} }).tubes[name]) : undefined);
    if (n && !n.error) cadence[name] = n.cadence;
    try {
      if (!n || n.error || !readers[name]) throw new Error(n && n.error ? n.error : 'No reader for this tube.');
      const r = await readers[name](n);
      if (r.cadence !== undefined) cadence[name] = r.cadence;
      status.tubes[name] = { ok: true, source: r.source || n.source, unit: n.unit, latest: r.latest, ...(r.note ? { about: r.note } : {}), values: r.values, positions: r.positions.map(p => (p === null || !Number.isFinite(p) ? p : +p.toFixed(3))) };
      if (ageDays(r.latest) > STALE_AFTER[cadence[name]]) { stale.push(name); status.tubes[name].note = 'The source has not published anything new for a while.'; }
      console.log(tag, 'OK  ', name, r.latest, r.values.map(v => (v === null ? 'none' : +v.toPrecision(5))).join(', '));
    } catch (e) {
      console.log(tag, 'FAIL', name, e.message);
      if (last && last.positions) { status.tubes[name] = { ...last, ok: false, note: 'Holding the last reading. ' + e.message }; stale.push(name); }
      else status.tubes[name] = { ok: false, note: 'No reading. ' + e.message };
    }
  }

  const fix = p => (p === undefined || p === null || Number.isNaN(p) ? null : p);     // minus infinity is a real "nothing happened" reading
  const positions = [0, 1, 2].map(b => M.ORDER.map(name => { const t = status.tubes[name]; return t.positions ? fix(t.positions[b]) : null; }));
  const draft = M.buildFrame({ seq: 0, made: status.made, era, ready, glow: normals.glow || '', baseline: normals.memory || undefined, positions, previous: prev && !fresh ? prev.d : null, cadence, stale });
  const changed = lost || !prev || draft.d.join() !== prev.d.join() || draft.slow.join() !== prev.slow.join() || draft.ready !== prev.ready || draft.glow !== prev.glow;
  const file = { ...draft, seq: lastSeq + (changed ? 1 : 0) };
  const error = M.validateFrame(file); if (error) throw new Error('Refusing to publish a bad frame: ' + error);
  M.ORDER.forEach((name, i) => { status.tubes[name].digits = file.d.slice(0, 3).map(row => row[i]).join(''); });
  status.frame = file;

  // Write only when something changed, or about once a day so the board can see the data is fresh.
  const hoursOld = prev ? (now - Date.parse(prev.made)) / 3600000 : Infinity;
  if (changed || hoursOld > 20 || !prevStatus.made) {          // a lost status file is written again straight away
    save(at.frame, JSON.stringify(file) + '\n'); save(at.status, JSON.stringify(status, null, 1) + '\n');
    console.log(tag, changed ? 'Published a new frame:' : 'Refreshed the frame:', JSON.stringify(file));
  } else console.log(tag, 'Nothing changed. The published frame stands.');

  // The reset rule needs one line a day holding that day's latest Year digits. This is kept even when the frame didn't change.
  const hist = path.join(ROOT, at.history), was = fs.existsSync(hist) ? fs.readFileSync(hist, 'utf8') : '';
  const days = S.parseHistory(was).filter(d => d.date < today).concat({ date: today, digits: file.d[2] });
  const text = 'date,year_digits\n' + days.map(d => `${d.date},${d.digits}`).join('\n') + '\n';
  if (text !== was) save(at.history, text);
  return { status, history: days.map(d => [...d.digits].map(c => (c === '-' ? null : +c))) };
  }

  let newest;
  for (const n of scales) newest = await publish(n, n.era < scales.length - 1);

  // The reset. Only the newest scale can run out of room, so only its history is checked.
  const PENDING = 'data/reset-pending.json';
  if (!M.resetDue(newest.history)) { if (fs.existsSync(path.join(ROOT, PENDING))) fs.unlinkSync(path.join(ROOT, PENDING)); return; }
  const before = scales[scales.length - 1], era = before.era + 1, from = S.tenYearsBefore(today);
  console.log(`Reset due. Three or more counting tubes have been pinned for a year. Working out scale ${era} from ${from} to ${today}.`);
  const { out, failed } = await computeNormals({ era, from, to: today, prev: before, log: (...a) => console.log(`[scale ${era}]`, ...a) });
  // A tube whose normal couldn't be worked out keeps its old one. If its source is alive, that's probably a passing fault,
  // so wait and try again next run. After two days of trying, go ahead: a dead source must not block the reset for ever.
  const alive = failed.filter(name => newest.status.tubes[name] && newest.status.tubes[name].ok);
  const soft = readSoft(PENDING), pending = soft && Number.isInteger(soft.tries) ? soft : { since: today, tries: 0 };
  if (alive.length && pending.tries + 1 < TRIES) {
    save(PENDING, JSON.stringify({ ...pending, tries: pending.tries + 1, waitingFor: alive }, null, 1) + '\n');
    console.log(`Reset put off: no new normal yet for ${alive.join(', ')}. Try ${pending.tries + 1} of ${TRIES}.`); return;
  }
  const next = { ...out, since: today, glow: GLOWS[(era - 1) % GLOWS.length], memory: memory(before, out), ...(failed.length ? { carried: failed } : {}) };
  save(`data/normals-${era}.json`, JSON.stringify(next, null, 1) + '\n');
  if (fs.existsSync(path.join(ROOT, PENDING))) fs.unlinkSync(path.join(ROOT, PENDING));
  await publish(before, true);                 // lights the lamp by the covered button
  await publish(next, false);
  console.log(`Scale ${era} is live at public/frame-${era}.json.`);
})().catch(e => { console.error(e); process.exit(1); });
