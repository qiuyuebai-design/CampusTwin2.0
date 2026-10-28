import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {startServer} from './serve.mjs';
const out=process.argv[2]||'evidence/demo';await fs.mkdir(out,{recursive:true});
const server=await startServer({port:0});const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByLabel('切换演示角色').selectOption('admin');
 await page.locator('.nav-item').filter({hasText:'资源驾驶舱'}).click();
 await page.getByRole('button',{name:'场地管理',exact:true}).click();
 await page.getByRole('button',{name:'编辑配置',exact:true}).first().click();
 await page.getByRole('dialog').getByLabel('可容纳人数').fill('250');
 await page.getByRole('button',{name:'保存配置',exact:true}).click();
 assert.ok((await page.locator('.directory .booking-row').first().innerText()).includes('250 人'));
 await page.getByRole('button',{name:'空间视图',exact:true}).click();
 await page.screenshot({path:out+'/CampusTwin-资源驾驶舱.png',fullPage:true});
 await page.locator('.nav-item').filter({hasText:'设置与帮助'}).click();
 const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'导出演示数据',exact:true}).click();const file=await waiting;const backup=await fs.readFile(await file.path());const parsed=JSON.parse(backup);assert.equal(parsed.venues[0].capacity,250);
 await page.locator('input[type=file]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":1,"venues":[]}')});await page.getByRole('status').filter({hasText:'无法导入'}).waitFor();
 await page.locator('input[type=file]').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:backup});await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();await page.getByRole('status').filter({hasText:'演示数据已恢复'}).waitFor();
 await page.getByRole('button',{name:'重置演示',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();
 await page.locator('.nav-item').filter({hasText:'场地探索'}).click();await page.getByLabel('参与人数',{exact:true}).fill('100');await page.getByLabel('开始时间',{exact:true}).fill('16:00');await page.getByLabel('结束时间',{exact:true}).fill('18:00');await page.getByRole('button',{name:'申请使用',exact:true}).first().click();await page.getByRole('dialog').getByLabel('活动名称',{exact:true}).fill('筛选条件继承验证');await page.getByRole('dialog').getByLabel('活动介绍与安排').fill('继承所选日期、时段和人数。');await page.getByRole('dialog').getByRole('button',{name:'下一步',exact:true}).click();assert.equal(await page.getByRole('dialog').getByLabel('开始时间',{exact:true}).inputValue(),'16:00');await page.getByRole('dialog').getByRole('button',{name:'关闭弹窗'}).click();
 await page.setViewportSize({width:360,height:800});await page.getByRole('button',{name:'创建申请',exact:true}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/CampusTwin-手机申请.png',fullPage:false});
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/Demo-补充验证.json',JSON.stringify({passed:['管理员配置编辑','演示备份导出与恢复','损坏备份拒绝','场地筛选条件继承','360px表单适配'],errors},null,2));console.log('PASS admin editing, backup roundtrip, corrupt import rejection, filter inheritance, mobile modal');
}finally {await browser.close();await new Promise(r=>server.close(r))}
