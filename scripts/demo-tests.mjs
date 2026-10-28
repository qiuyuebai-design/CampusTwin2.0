import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { startServer } from "./serve.mjs";
const out = process.argv[2] || "evidence/demo";
await fs.mkdir(out, { recursive: true });
const server = await startServer({ port: 0 });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  acceptDownloads: true,
});
const page = await ctx.newPage();
const errors = [];
const results = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const base = `http://127.0.0.1:${server.address().port}`;
const nav = async (label) => {
  if (await page.locator(".mobile-menu").isVisible())
    await page.getByRole("button", { name: "展开导航", exact: true }).click();
  await page.locator(".nav-item").filter({ hasText: label }).click();
};
const role = async (value) =>
  page.getByLabel("切换演示角色").selectOption(value);
const modal = () => page.getByRole("dialog").last();
const row = (title) =>
  page.locator(".booking-row").filter({ hasText: title }).first();
const check = async (name, fn) => {
  await fn();
  results.push({ name, passed: true });
  console.log("PASS " + name);
};
async function create(title, start = "10:00", end = "12:00") {
  await nav("我的申请");
  await page.getByRole("button", { name: "创建申请", exact: true }).click();
  await modal().getByLabel("活动名称", { exact: true }).fill(title);
  await modal()
    .getByLabel("活动介绍与安排")
    .fill("校园创新分享，设有签到、主持和现场秩序志愿者。");
  await modal().getByRole("button", { name: "下一步", exact: true }).click();
  await modal().getByLabel("开始时间", { exact: true }).fill(start);
  await modal().getByLabel("结束时间", { exact: true }).fill(end);
  await modal().getByRole("button", { name: "下一步", exact: true }).click();
  await modal().getByRole("button", { name: "提交审核", exact: true }).click();
  await row(title).getByText("待审核", { exact: true }).waitFor();
}
async function review(title, action, note = "") {
  await nav("审批中心");
  await role("teacher");
  await row(title)
    .getByRole("button", { name: "审核申请", exact: true })
    .click();
  if (note) await modal().getByLabel("审核意见").fill(note);
  await modal().getByRole("button", { name: action, exact: true }).click();
  await modal().getByRole("button", { name: "确认审核", exact: true }).click();
}
try {
  await page.goto(base);
  await page.waitForLoadState("networkidle");
  await check("首页示意插画与资源地图正常渲染", async () => {
    assert.equal(await page.locator("h1").innerText(), "你好，学生 A。");
    assert.equal(await page.locator(".map-building").count(), 6);
    assert.ok(
      await page
        .locator(".hero>img")
        .evaluate((i) => i.complete && i.naturalWidth > 0),
    );
    assert.ok(
      await page
        .locator(".hero-content")
        .evaluate((e) => e.getBoundingClientRect().width > 400),
    );
    await page.screenshot({
      path: out + "/CampusTwin-首页.png",
      fullPage: true,
    });
  });
  await check("场地筛选与详情", async () => {
    await nav("场地探索");
    await page.getByLabel("参与人数", { exact: true }).fill("500");
    assert.equal(await page.locator(".venue-card").count(), 2);
    await page.getByRole("button", { name: "重置", exact: true }).click();
    assert.equal(await page.locator(".venue-card").count(), 6);
    await page
      .getByRole("button", { name: "查看场地", exact: true })
      .first()
      .click();
    await modal().getByRole("heading", { name: "场地日程" }).waitFor();
    await modal().getByRole("button", { name: "关闭弹窗" }).click();
    await page.screenshot({
      path: out + "/CampusTwin-场地探索.png",
      fullPage: true,
    });
  });
  await check("创建申请与待审不占用", async () => {
    await create("E2E 创新分享会");
    await create("E2E 同时段竞争申请");
  });
  await check("批准申请并更新公开活动", async () => {
    await review("E2E 创新分享会", "批准申请");
    await row("E2E 创新分享会").getByText("已批准", { exact: true }).waitFor();
    await row("E2E 创新分享会")
      .getByRole("button", { name: "查看详情" })
      .click();
    await modal().getByRole("button", { name: "查看已发布活动" }).click();
    await page
      .getByRole("heading", { name: "E2E 创新分享会", exact: true })
      .waitFor();
    assert.ok(
      await page
        .locator(".qr")
        .evaluate((i) => i.complete && i.naturalWidth > 0),
    );
    assert.equal(
      await page
        .locator(".public-event")
        .getByText("审核意见", { exact: true })
        .count(),
      0,
    );
  });
  await check("审批时重检阻止重叠预约", async () => {
    await review("E2E 同时段竞争申请", "批准申请");
    await modal().getByRole("alert").filter({ hasText: "无法批准" }).waitFor();
    await modal().getByRole("button", { name: "关闭弹窗" }).click();
    assert.equal(
      await row("E2E 同时段竞争申请")
        .getByText("待审核", { exact: true })
        .count(),
      1,
    );
  });
  await check("退回必须填写原因", async () => {
    await row("E2E 同时段竞争申请")
      .getByRole("button", { name: "审核申请" })
      .click();
    await modal()
      .getByRole("button", { name: "退回修改", exact: true })
      .click();
    await modal().getByRole("button", { name: "确认审核" }).click();
    await modal().getByRole("alert").filter({ hasText: "请填写" }).waitFor();
    await modal()
      .getByLabel("审核意见")
      .fill("请调整活动时间，当前场地已被占用。");
    await modal().getByRole("button", { name: "确认审核" }).click();
    await row("E2E 同时段竞争申请")
      .getByText("待修改", { exact: true })
      .waitFor();
  });
  await check("修订重提与历史保留", async () => {
    await role("student");
    await nav("我的申请");
    await row("E2E 同时段竞争申请")
      .getByRole("button", { name: "修改重提" })
      .click();
    await modal().getByRole("button", { name: "下一步", exact: true }).click();
    await modal().getByLabel("开始时间", { exact: true }).fill("16:00");
    await modal().getByLabel("结束时间", { exact: true }).fill("18:00");
    await modal().getByRole("button", { name: "下一步", exact: true }).click();
    await modal().getByRole("button", { name: "提交审核" }).click();
    await row("E2E 同时段竞争申请")
      .getByRole("button", { name: "查看详情" })
      .click();
    await modal()
      .getByText("审核老师退回修改：请调整活动时间，当前场地已被占用。", {
        exact: true,
      })
      .waitFor();
    await modal().getByRole("button", { name: "关闭弹窗" }).click();
  });
  await check("撤回后审批不可用", async () => {
    await row("E2E 同时段竞争申请")
      .getByRole("button", { name: "撤回", exact: true })
      .click();
    await modal().getByRole("button", { name: "确认", exact: true }).click();
    await nav("审批中心");
    await role("teacher");
    await row("E2E 同时段竞争申请")
      .getByText("已撤回", { exact: true })
      .waitFor();
    assert.equal(
      await row("E2E 同时段竞争申请")
        .getByRole("button", { name: "审核申请" })
        .count(),
      0,
    );
  });
  await check("已发布活动变更前保持原版本，批准后稳定链接更新", async () => {
    await role("student");
    await nav("我的申请");
    await row("E2E 创新分享会")
      .getByRole("button", { name: "申请变更" })
      .click();
    await modal().getByRole("button", { name: "下一步", exact: true }).click();
    await modal().getByLabel("开始时间", { exact: true }).fill("18:00");
    await modal().getByLabel("结束时间", { exact: true }).fill("20:00");
    await modal().getByRole("button", { name: "下一步", exact: true }).click();
    await modal().getByRole("button", { name: "提交审核" }).click();
    await nav("校园活动");
    await page
      .locator(".event-card")
      .filter({ hasText: "E2E 创新分享会" })
      .click();
    const stable = page.url();
    assert.ok(
      (await page.locator(".event-facts").innerText()).includes("10:00–12:00"),
    );
    await review("E2E 创新分享会", "批准申请");
    await page.goto(stable);
    await page
      .getByRole("heading", { name: "E2E 创新分享会", exact: true })
      .waitFor();
    assert.ok(
      (await page.locator(".event-facts").innerText()).includes("18:00–20:00"),
    );
    assert.equal(page.url(), stable);
  });
  await check("预演容量检查、方案保存与报告真实下载", async () => {
    await nav("智能预演");
    await page
      .getByRole("button", { name: "人数增至 560", exact: true })
      .click();
    await page
      .getByRole("button", { name: "运行智能预演", exact: true })
      .click();
    assert.equal(await page.locator(".candidate").count(), 6);
    await page.getByRole("button", { name: "保存方案", exact: true }).click();
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出报告", exact: true }).click();
    const file = await waiting;
    const text = await fs.readFile(await file.path(), "utf8");
    assert.ok(text.includes("560"));
    assert.ok(text.includes("14:00–16:00"));
    await page.screenshot({
      path: out + "/CampusTwin-智能预演.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: /我的方案库/ }).click();
    assert.equal(await page.locator(".saved-plans .booking-row").count(), 1);
    await page.reload();
    await nav("智能预演");
    await page.getByRole("button", { name: /我的方案库/ }).click();
    assert.equal(await page.locator(".saved-plans .booking-row").count(), 1);
  });
  await check("管理员地图、时间轴、场地开关", async () => {
    await nav("资源驾驶舱");
    await role("admin");
    await page.getByLabel("场景时间").fill("18");
    await page.getByRole("button", { name: "放大地图", exact: true }).click();
    await page.getByRole("button", { name: "平面视角", exact: true }).click();
    await page.getByRole("button", { name: "资源时轴", exact: true }).click();
    assert.equal(await page.locator(".resource-table tbody tr").count(), 6);
    await page.getByRole("button", { name: "场地管理", exact: true }).click();
    await page.getByRole("switch").first().click();
    await modal().getByRole("button", { name: "确认", exact: true }).click();
    assert.equal(
      await page.getByRole("switch").first().getAttribute("aria-checked"),
      "false",
    );
  });
  await check("经典调度工具仍可运行", async () => {
    await nav("智能预演");
    await page.getByRole("button", { name: "经典工作台", exact: true }).click();
    await page
      .getByRole("button", { name: "运行调度分析", exact: true })
      .click();
    await page
      .getByRole("button", { name: "选择此方案", exact: true })
      .first()
      .waitFor();
  });
  await check("360px 手机主要页面无整体横向溢出", async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    for (const name of [
      "校园总览",
      "场地探索",
      "我的申请",
      "智能预演",
      "校园活动",
      "审批中心",
      "资源驾驶舱",
      "消息通知",
    ]) {
      await nav(name);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        name + " overflow",
      );
    }
    await nav("场地探索");
    await page.screenshot({
      path: out + "/CampusTwin-手机场地.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "创建申请", exact: true }).click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: out + "/CampusTwin-手机申请.png",
      fullPage: true,
    });
    await modal().getByRole("button", { name: "关闭弹窗" }).click();
  });
  assert.deepEqual(errors, []);
  results.push({ name: "全流程无浏览器脚本及控制台错误", passed: true });
} catch (e) {
  results.push({ name: "failure", passed: false, message: e.stack });
  await page.screenshot({ path: out + "/failure.png", fullPage: true });
  process.exitCode = 1;
  console.error(e);
} finally {
  await fs.writeFile(
    out + "/Demo-测试结果.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  await browser.close();
  await new Promise((r) => server.close(r));
}

