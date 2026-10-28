import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = process.env.npm_execpath ?? path.resolve(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
fs.mkdirSync(path.join(root, 'evidence'), { recursive: true });
const report = { startedAt: new Date().toISOString(), node: process.version, npm: process.env.npm_config_user_agent?.split(' ')[0] ?? 'unknown', platform: process.platform, steps: [] };
const steps = [
  ['typecheck', ['run', 'typecheck']],
  ['unit-tests', ['test', '--', '--reporter=default', '--reporter=json', '--outputFile=evidence/unit-tests.json']],
  ['build', ['run', 'build']],
  ['server-tests', ['run', 'test:server']]
];
if (process.argv.includes('--browser')) steps.push(['browser-tests', ['run', 'test:browser']]);
for (const [name, args] of steps) {
  console.log(`\n[verify] ${name}`);
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  fs.writeFileSync(path.join(root, 'evidence', `${name}.txt`), output);
  process.stdout.write(output);
  const exitCode = result.status ?? 1;
  report.steps.push({ name, command: `npm ${args.join(' ')}`, startedAt, finishedAt: new Date().toISOString(), exitCode, log: `evidence/${name}.txt` });
  if (exitCode !== 0) { process.exitCode = exitCode; break; }
}
report.finishedAt = new Date().toISOString();
report.passed = report.steps.length === steps.length && report.steps.every(step => step.exitCode === 0);
fs.writeFileSync(path.join(root, 'evidence', 'verification.json'), JSON.stringify(report, null, 2));
