import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './serve.mjs';
const handler = await createHandler();
async function request(url, method = 'GET') {
  let status, headers, body;
  await handler({ url, method }, {
    writeHead(code, values = {}) { status = code; headers = values; },
    end(value) { body = value === undefined ? '' : value.toString(); }
  });
  return { status, headers, body };
}
test('构建首页返回 HTML 与安全响应头', async () => {
  const response = await request('/');
  assert.equal(response.status, 200);
  assert.ok(response.body.includes('CampusTwin 2.0'));
  assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
  assert.ok(response.headers['Content-Security-Policy'].includes("frame-ancestors 'none'"));
});
test('构建 JS 和 CSS 的实际内容与响应类型正确，HEAD 不返回正文', async () => {
  const index = await request('/');
  const asset = index.body.match(/src="([^"]+\.js)"/)[1];
  const response = await request(asset);
  assert.equal(response.status, 200); assert.ok(response.body.length > 1000);
  assert.equal(response.headers['Content-Type'], 'text/javascript; charset=utf-8');
  assert.equal((await request(asset, 'HEAD')).body, '');
});
test('源码、依赖、配置与路径穿越请求均不能读取', async () => {
  for (const url of ['/src/main.tsx', '/package.json', '/node_modules/react/package.json', '/%2e%2e%2fpackage.json']) {
    const response = await request(url);
    assert.ok([403, 404].includes(response.status));
  }
});
test('拒绝写入方法、非法编码、空字符及反斜杠', async () => {
  const post = await request('/', 'POST');
  assert.equal(post.status, 405); assert.equal(post.headers.Allow, 'GET, HEAD');
  for (const url of ['/%00', '/%ZZ', '/%5csecret']) assert.equal((await request(url)).status, 400);
});
