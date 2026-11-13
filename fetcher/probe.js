// Tries every data source once and writes a report. It changes nothing else.
const fs = require('fs'), path = require('path');
const { get, SOURCES } = require('./sources.js');

(async () => {
  const report = { ran: new Date().toISOString(), sources: [] };
  for (const src of SOURCES) {
    const row = { id: src.id, tube: src.tube, role: src.role, url: src.url() };
    const t0 = Date.now();
    try {
      const res = await get(row.url);
      row.status = res.status; row.bytes = res.text.length; row.head = res.text.slice(0, 160).replace(/\s+/g, ' ');
      if (!res.ok) throw new Error('The server answered ' + res.status + '.');
      const rows = src.parse(res.text);
      if (!rows.length) throw new Error('The file arrived but no rows could be read from it.');
      row.rows = rows.length; row.first = rows[0].date; row.last = rows[rows.length - 1].date; row.lastValue = rows[rows.length - 1].value;
      row.ok = true;
    } catch (e) { row.ok = false; row.error = String(e.message || e); }
    row.seconds = +((Date.now() - t0) / 1000).toFixed(1);
    report.sources.push(row);
    console.log(`${row.ok ? 'OK  ' : 'FAIL'} ${row.id.padEnd(16)} ${row.ok ? `${row.rows} rows, ${row.first} to ${row.last}, latest ${row.lastValue}` : row.error}`);
  }
  const dir = path.join(__dirname, '..', 'status'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'probe.json'), JSON.stringify(report, null, 2) + '\n');
})();
