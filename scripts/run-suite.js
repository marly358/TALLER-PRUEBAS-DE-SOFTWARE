// Cada suite usa una BD efímera y un puerto libre; no borra tus reservas locales.
const { createApp } = require('../backend/app');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const suite = process.argv[2];
  if (!['api', 'ui', 'performance'].includes(suite)) throw new Error('Suite inválida');
  const { app, db } = createApp({ log: false });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  fs.mkdirSync('artifacts', { recursive: true });
  console.log(`Suite ${suite} · servidor aislado ${baseUrl}`);
  try {
    if (suite === 'api') {
      await new Promise((resolve, reject) => require('newman').run({
        collection: require('../api_tests/CineFlex_API_Collection.json'),
        environment: require('../api_tests/CineFlex_Environment.json'),
        envVar: [{ key: 'baseUrl', value: baseUrl }],
        reporters: ['cli', 'json'], reporter: { json: { export: 'artifacts/newman.json' } }
      }, (error, summary) => error ? reject(error) : summary.run.failures.length
        ? reject(new Error(`${summary.run.failures.length} fallos de API`)) : resolve()));
    } else {
      let command = process.execPath;
      let args = ['ui_tests/test_suite.js'];
      let resultDir;
      if (suite === 'performance') {
        command = process.env.JMETER_BIN || 'jmeter';
        const dir = path.resolve('performance/results', new Date().toISOString().replace(/[:.]/g, '-'));
        resultDir = dir;
        fs.mkdirSync(dir, { recursive: true });
        args = ['-n', '-t', 'performance/prueba_carga.jmx', `-Jport=${port}`, '-l', `${dir}/results.jtl`,
          '-j', `${dir}/jmeter.log`, '-e', '-o', `${dir}/dashboard`];
        console.log(`Resultados: ${dir}`);
      }
      await new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, BASE_URL: baseUrl } });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Suite finalizó con código ${code}`)));
      });
      if (resultDir) require('../performance/analyze').analyze(path.join(resultDir, 'results.jtl'));
    }
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
