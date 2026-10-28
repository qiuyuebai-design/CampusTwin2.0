import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.join(root, 'evidence');
await fs.mkdir(evidence, { recursive: true });
const mode = process.env.BROWSER_TEST_MODE === 'memory' ? 'memory' : 'network';
const server = mode === 'network' ? await startServer({ port: 0 }) : null;
const baseURL = server ? `http://127.0.0.1:${server.address().port}` : 'http://localhost:4173';
await fs.mkdir(path.join(evidence, 'downloads'), { recursive: true });
const browser = await chromium.launch({ headless: true, downloadsPath: path.join(evidence, 'downloads') });
const results = [];
const startedAt = new Date().toISOString();
const browserVersion = browser.version();
let sample;
async function enter(page) {
  await page.goto(baseURL);
  await page.getByRole('button', { name: '调度工作台', exact: true }).click();
}
async function preset(page) {
  await enter(page);
  await page.getByRole('button', { name: '运行调度分析', exact: true }).click();
  await page.getByRole('button', { name: '选择此方案', exact: true }).first().click();
}
async function custom(page, enumerate = false) {
  await enter(page);
  await page.getByRole('button', { name: '自定义变更（直接分析候选）', exact: true }).click();
  await page.locator('#wb-activity-select').selectOption('act-003');
  await page.locator('#wb-kind-select').selectOption('venue');
  if (enumerate) await page.getByRole('checkbox', { name: /按时段枚举候选/ }).check();
  await page.getByRole('button', { name: '运行调度分析', exact: true }).click();
}
async function downloadText(page, button) {
  if (mode === 'memory') {
    const before = await page.evaluate(() => window.__campusExports.length);
    await page.getByRole('button', { name: button, exact: true }).first().click();
    await page.waitForFunction(index => window.__campusExports.length > index, before);
    return page.evaluate(() => window.__campusExports.at(-1).content);
  }
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const download = await waiting;
  const text = await fs.readFile(await download.path(), 'utf8');
  assert.equal(await download.failure(), null);
  return text;
}
async function waitText(locator, needle) {
  await locator.filter({ hasText: needle }).first().waitFor({ state: 'visible' });
}
async function run(name, callback, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true, ...options });
  if (mode === 'memory') {
    // Read-only browser fixture: fulfill every request from dist without opening a network connection.
    await context.addInitScript(() => {
      const blobs = new Map();
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => { const url = create(blob); blobs.set(url, blob); return url; };
      const click = HTMLAnchorElement.prototype.click;
      window.__campusExports = [];
      HTMLAnchorElement.prototype.click = function () {
        const blob = blobs.get(this.href);
        if (this.download && blob) {
          const name = this.download;
          void blob.text().then(content => window.__campusExports.push({ name, content }));
        } else click.call(this);
      };
    });
    await context.route('**/*', async route => {
      try {
        const url = new URL(route.request().url());
        if (url.origin !== baseURL) return route.abort('blockedbyclient');
        const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
        const dist = path.join(root, 'dist');
        const file = path.resolve(dist, '.' + pathname);
        if (!file.startsWith(dist + path.sep) || pathname.includes('\\')) return route.fulfill({ status: 403, body: '' });
        const body = await fs.readFile(file);
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
        return route.fulfill({ status: 200, body, contentType: types[path.extname(file)] ?? 'application/octet-stream' });
      } catch { return route.fulfill({ status: 404, body: '' }); }
    });
  }
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const start = Date.now();
  try {
    await callback(page, context);
    assert.deepEqual(errors, [], 'Uncaught browser errors');
    results.push({ name, status: 'passed', durationMs: Date.now() - start });
    console.log(`PASS ${name}`);
  } catch (error) {
    await page.screenshot({ path: path.join(evidence, `failure-${results.length + 1}.png`), fullPage: true }).catch(() => {});
    results.push({ name, status: 'failed', durationMs: Date.now() - start, error: error.stack, pageErrors: errors });
    console.error(`FAIL ${name}: ${error.message}`);
  } finally { await context.close(); }
}
try {
  await run('F01：枚举开关双向切换都清空结果、选择、勾选，不复活旧方案', async page => {
    await custom(page);
    await page.getByRole('button', { name: '选择此方案', exact: true }).first().click();
    await page.getByRole('checkbox', { name: /最终方案确认/ }).check();
    const toggle = page.getByRole('checkbox', { name: /按时段枚举候选/ });
    await toggle.check();
    await waitText(page.locator('.wb-result--empty'), '尚未运行分析');
    assert.equal(await page.locator('.wb-decision').count(), 0);
    assert.equal(await page.getByRole('button', { name: '保存当前方案', exact: true }).isDisabled(), true);
    await toggle.uncheck();
    assert.equal(await page.locator('.wb-decision').count(), 0);
    await page.getByRole('button', { name: '运行调度分析', exact: true }).click();
    await page.getByRole('button', { name: '选择此方案', exact: true }).first().click();
    assert.equal(await page.getByRole('checkbox', { name: /最终方案确认/ }).isChecked(), false);
  });
  await run('F03：多时段排除显示时段，晚间方案导出内容使用所选时段', async page => {
    await custom(page, true);
    const excluded = page.locator('.wb-candidates--excluded .wb-candidate');
    assert.ok(await excluded.count() > 1);
    assert.equal(await excluded.locator('.wb-candidate__slot').count(), await excluded.count());
    const late = page.locator('.wb-candidates:not(.wb-candidates--excluded) .wb-candidate').filter({ hasText: 'venue-002' }).filter({ hasText: '时间段 [2026-10-22T19:00, 2026-10-22T21:00)' });
    assert.equal(await late.count(), 1);
    await late.getByRole('button', { name: '选择此方案', exact: true }).click();
    await page.getByRole('checkbox', { name: /最终方案确认/ }).check();
    await page.locator('#plan-name').fill('多时段验证方案');
    sample = JSON.parse(await downloadText(page, '导出方案 JSON'));
    assert.equal(sample.selection.candidateKey, 'venue-002@2026-10-22T19:00~2026-10-22T21:00');
    const report = await downloadText(page, '导出方案报告');
    assert.ok(report.includes('目标时段：2026-10-22T19:00 → 2026-10-22T21:00'));
    assert.ok(report.includes('[x] 最终方案确认'));
    assert.ok(report.includes('未执行真实预约'));
    await fs.writeFile(path.join(evidence, 'sample-plan.json'), JSON.stringify(sample, null, 2));
    await fs.writeFile(path.join(evidence, 'sample-plan-report.md'), report);
    await page.screenshot({ path: path.join(evidence, 'workbench-desktop.png'), fullPage: true });
    await page.locator('.wb-library').screenshot({ path: path.join(evidence, 'plan-library-desktop.png') });
  });
  await run('本地保存：刷新与首页往返后可恢复所选候选及人工清单', async page => {
    await preset(page);
    await page.locator('#plan-name').fill('刷新恢复验证');
    await page.getByRole('checkbox', { name: /最终方案确认/ }).check();
    await page.getByRole('button', { name: '保存当前方案', exact: true }).click();
    await waitText(page.locator('.wb-library__notice'), '已保存');
    await page.reload();
    await page.getByRole('button', { name: '调度工作台', exact: true }).click();
    assert.equal(await page.locator('.wb-library__item').count(), 1);
    await page.getByRole('button', { name: '恢复方案', exact: true }).click();
    assert.equal(await page.getByRole('checkbox', { name: /最终方案确认/ }).isChecked(), true);
    assert.ok((await page.locator('.wb-decision').innerText()).includes('73.60'));
    await page.getByRole('button', { name: '首页', exact: true }).click();
    await page.getByRole('button', { name: '调度工作台', exact: true }).click();
    await page.getByRole('button', { name: '恢复方案', exact: true }).click();
    assert.equal(await page.getByRole('checkbox', { name: /最终方案确认/ }).isChecked(), true);
  });
  await run('JSON 文件导入：恢复多时段方案；重复导入不覆盖旧记录；删除后刷新保持', async page => {
    assert.ok(sample);
    await enter(page);
    const upload = () => page.locator('#plan-import').setInputFiles({ name: 'plan.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sample)) });
    await upload(); await waitText(page.locator('.wb-library__notice'), '已导入');
    assert.equal(await page.getByRole('checkbox', { name: /最终方案确认/ }).isChecked(), true);
    assert.ok((await page.locator('.wb-decision').innerText()).includes('2026-10-22T19:00'));
    await upload();
    await page.waitForFunction(() => document.querySelectorAll('.wb-library__item').length === 2);
    const backup = await downloadText(page, '下载 JSON');
    assert.equal(JSON.parse(backup).selection.candidateKey, sample.selection.candidateKey);
    await page.getByRole('button', { name: '删除方案 多时段验证方案', exact: true }).first().click();
    assert.equal(await page.locator('.wb-library__item').count(), 1);
    await page.reload(); await page.getByRole('button', { name: '调度工作台', exact: true }).click();
    assert.equal(await page.locator('.wb-library__item').count(), 1);
  });
  await run('文件校验：非法 JSON、未知版本、超限文件不覆盖当前选择', async page => {
    await preset(page);
    const original = await page.locator('.wb-decision').innerText();
    for (const [buffer, needle] of [
      [Buffer.from('{bad'), '合法 JSON'],
      [Buffer.from(JSON.stringify({ ...sample, schemaVersion: 99 })), '不兼容'],
      [Buffer.alloc(262145, 32), '256 KiB']
    ]) {
      await page.locator('#plan-import').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer });
      await waitText(page.locator('.wb-library__error'), needle);
      assert.equal(await page.locator('.wb-decision').innerText(), original);
      assert.equal(await page.locator('.wb-library__item').count(), 0);
    }
  });
  await run('过期方案导入重新分析，清空旧选择和勾选，阻止报告导出', async page => {
    await enter(page);
    await page.locator('#plan-import').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...sample, engineVersion: 'old-engine' })) });
    await waitText(page.locator('.wb-library__notice'), '旧选择与勾选已清除');
    assert.equal(await page.locator('.wb-decision').count(), 0);
    assert.equal(await page.getByRole('button', { name: '导出方案报告', exact: true }).isDisabled(), true);
    assert.ok(await page.getByRole('button', { name: '选择此方案', exact: true }).count() > 0);
  });
  await run('存储空间不足可见报错，JSON 导出仍可用且不假报保存成功', async (page, context) => {
    await context.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('quota', 'QuotaExceededError'); }; });
    await preset(page);
    await page.getByRole('button', { name: '保存当前方案', exact: true }).click();
    await waitText(page.locator('.wb-library__error'), '空间不足');
    assert.equal(await page.locator('.wb-library__item').count(), 0);
    const backup = JSON.parse(await downloadText(page, '导出方案 JSON'));
    assert.equal(backup.schemaVersion, 1);
  });
  await run('损坏存储不会静默覆盖，页面仍能分析', async page => {
    await enter(page);
    await page.evaluate(() => localStorage.setItem('campustwin.plans.v1', '{corrupt'));
    await page.reload(); await page.getByRole('button', { name: '调度工作台', exact: true }).click();
    await waitText(page.locator('.wb-library__error'), '损坏');
    await page.getByRole('button', { name: '运行调度分析', exact: true }).click();
    await page.getByRole('button', { name: '选择此方案', exact: true }).first().click();
    await page.getByRole('button', { name: '保存当前方案', exact: true }).click();
    await waitText(page.locator('.wb-library__error'), '损坏');
    assert.equal(await page.evaluate(() => localStorage.getItem('campustwin.plans.v1')), '{corrupt');
  });
  await run('375px 移动视口可分析和保存，页面无整体横向溢出', async page => {
    await preset(page);
    await page.getByRole('button', { name: '保存当前方案', exact: true }).click();
    await waitText(page.locator('.wb-library__notice'), '已保存');
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    assert.ok(dimensions.scroll <= dimensions.client + 1, JSON.stringify(dimensions));
    await page.screenshot({ path: path.join(evidence, 'workbench-mobile.png'), fullPage: true });
    await page.locator('.wb-library').screenshot({ path: path.join(evidence, 'plan-library-mobile.png') });
  }, { viewport: { width: 375, height: 812 } });
  if (mode === 'network') await run('离线启动服务仅提供构建文件，拒绝源码访问和写入请求', async () => {
    const index = await fetch(baseURL); assert.equal(index.status, 200);
    assert.ok(index.headers.get('content-security-policy').includes("object-src 'none'"));
    assert.equal((await fetch(`${baseURL}/package.json`)).status, 404);
    assert.equal((await fetch(`${baseURL}/src/main.tsx`)).status, 404);
    assert.equal((await fetch(`${baseURL}/%00`)).status, 400);
    assert.equal((await fetch(baseURL, { method: 'POST' })).status, 405);
  });
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  const report = { mode, transportVerified: mode === 'network', physicalDownloadsVerified: mode === 'network', exportVerification: mode === 'memory' ? 'captured generated Blob content; browser file downloads blocked by environment' : 'actual browser downloads', startedAt, finishedAt: new Date().toISOString(), browser: browserVersion, playwright: '1.63.0',
    passed: results.filter(result => result.status === 'passed').length,
    failed: results.filter(result => result.status === 'failed').length, results };
  await fs.writeFile(path.join(evidence, 'browser-tests.json'), JSON.stringify(report, null, 2));
  console.log(`Browser tests: ${report.passed} passed, ${report.failed} failed`);
  if (report.failed) process.exitCode = 1;
}
