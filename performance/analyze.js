const fs = require('node:fs');
const path = require('node:path');
function csv(line) {
  const cells = []; let cell = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && quoted && line[i + 1] === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { cells.push(cell); cell = ''; }
    else cell += c;
  }
  cells.push(cell); return cells;
}
function analyze(file, expectedUsers = 500) {
  const [header, ...lines] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).map(csv);
  const rows = lines.map(cells => Object.fromEntries(header.map((key, i) => [key, cells[i]])));
  const samples = rows.filter(row => row.label === 'Consultar asientos');
  if (!samples.length) throw new Error('JTL sin consultas de asientos');
  const times = samples.map(r => Number(r.elapsed)).sort((a, b) => a - b);
  const start = Math.min(...samples.map(r => Number(r.timeStamp)));
  const end = Math.max(...samples.map(r => Number(r.timeStamp) + Number(r.elapsed)));
  const failures = samples.filter(r => r.success !== 'true').length;
  const result = {
    label: 'Consultar asientos', samples: samples.length, failures,
    errorPercent: 100 * failures / samples.length,
    throughputPerSecond: samples.length / ((end - start) / 1000),
    averageMs: times.reduce((a, b) => a + b, 0) / times.length,
    p95Ms: times[Math.ceil(times.length * .95) - 1],
    maxMs: times.at(-1), maxThreads: Math.max(...samples.map(r => Number(r.allThreads))),
    durationSeconds: (end - start) / 1000, startUTC: new Date(start).toISOString(),
    scope: 'Mock local: lectura de asientos con JWT compartido, sin banco real.'
  };
  result.passed = result.errorPercent < 1 && result.p95Ms < 300 && result.maxThreads >= expectedUsers;
  fs.writeFileSync(path.join(path.dirname(file), 'summary.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) throw new Error('No se cumplieron los umbrales de carga');
  return result;
}
if (require.main === module) {
  try { analyze(process.argv[2], Number(process.argv[3] || 500)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { analyze };
