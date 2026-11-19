const { chromium } = require("playwright");
const sharp = require("sharp");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { confirmStartup } = require("./lobby-save-test-utils.cjs");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18095";
const out = path.resolve(__dirname, "../output/design/lobby-save");
const key = "nowchange.expedition.v1";

async function ready(page) {
    await page.waitForFunction(() => window.__skillBattlePreview?.view?.isOpened &&
        window.__skillBattlePreview.view.path.endsWith("/LobbySaveView.lh") &&
        window.__skillBattlePreview.view.getElement("img_save_background").texture?.bitmap);
}
async function click(page, name) {
    const point = await page.evaluate(name => {
        const v = window.__skillBattlePreview, n = v.ui.topView.getElement(name);
        const p = n.localToGlobal(new Laya.Point(n.width / 2, n.height / 2));
        const r = document.querySelector("canvas").getBoundingClientRect();
        return { x: r.left + p.x * r.width / Laya.stage.width,
            y: r.top + p.y * r.height / Laya.stage.height };
    }, name);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(100);
}
async function shot(page, name) {
    const issues = await page.evaluate(() => {
        const v = window.__skillBattlePreview.view, issues = [];
        const panel = v.getElement("box_save_dialog");
        const center = panel.localToGlobal(new Laya.Point(panel.width / 2, panel.height / 2));
        if (Math.abs(center.x - Laya.stage.width / 2) > 0.5 ||
            Math.abs(center.y - Laya.stage.height / 2) > 0.5) issues.push("弹窗未居中");
        for (const n of v.uiElement.elementMapper.elements) {
            if (!n.visible || n.name === "img_save_background") continue;
            const a = n.localToGlobal(new Laya.Point());
            const b = n.localToGlobal(new Laya.Point(n.width, n.height));
            if (a.x < -0.5 || a.y < -0.5 || b.x > Laya.stage.width + 0.5 ||
                b.y > Laya.stage.height + 0.5) issues.push(n.name + "溢出屏幕");
            if (n instanceof Laya.GTextField && n.text) {
                n.textIns.typeset(true);
                if (n.textIns.textWidth > n.width + 2 || n.textIns.textHeight > n.height + 2)
                    issues.push(n.name + "文字溢出");
            }
        }
        return issues;
    });
    assert.deepEqual(issues, []);
    const image = await page.screenshot({ path: path.join(out, name + ".png") });
    const stats = await sharp(image).stats();
    assert.ok(stats.channels.slice(0, 3).some(c => c.stdev > 12), "画布不能为空");
}

(async () => {
    await fs.mkdir(out, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, width, height, touch] of [
            ["desktop",1280,720,false], ["mobile",844,390,true],
            ["compact",667,375,true], ["tablet",1024,768,true], ["wide",2560,1080,false],
        ]) {
            const context = await browser.newContext({ viewport:{width,height}, hasTouch:touch, isMobile:touch });
            const page = await context.newPage(), errors = [];
            page.touchMode = touch;
            page.on("pageerror", e => errors.push(e.message));
            await page.goto(url);
            await ready(page);
            assert.deepEqual(await page.evaluate(key => [
                localStorage.getItem(key), window.__skillBattlePreview.trial.inventory,
            ], key), [null,null]);
            await page.mouse.click(8,8);
            await page.keyboard.press("Escape");
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.view.isOpened),true);
            await shot(page,name+"-new");
            await confirmStartup(page);
            const first = await page.evaluate(key => localStorage.getItem(key),key);
            assert.ok(first);
            assert.equal(JSON.parse(first).state.phase,"preparation");
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.view.path.endsWith("/LobbyView.lh")),true);
            await page.reload();
            await ready(page);
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.view.getElement("txt_save_title").text),"发现存档");
            assert.equal(await page.evaluate(key => localStorage.getItem(key),key),first);
            await shot(page,name+"-existing");
            await confirmStartup(page);
            assert.equal(await page.evaluate(key => localStorage.getItem(key),key),first,"继续不会重复初始化");
            assert.deepEqual(errors,[]);
            await context.close();
            console.log(`通过 ${name}：首次确认保存、原档继续、点击外部不跳过、文字与居中适配。`);
        }
        const context = await browser.newContext({ viewport:{width:1280,height:720} });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", e => errors.push(e.message));
        await page.goto(url); await ready(page);
        // 仅在隔离测试页阻止游戏档写入，验证保存失败不会进入大厅。
        await page.evaluate(key => {
            const write = Storage.prototype.setItem;
            window.__restoreSaveWrite = () => { Storage.prototype.setItem = write; };
            Storage.prototype.setItem = function(k,v) {
                if (k === key) throw Error("测试：设备空间不足");
                return write.call(this,k,v);
            };
        },key);
        await click(page,"btn_save_confirm");
        assert.equal(await page.evaluate(() => window.__skillBattlePreview.view.path.endsWith("/LobbySaveView.lh")),true);
        assert.deepEqual(await page.evaluate(key => [
            localStorage.getItem(key),window.__skillBattlePreview.trial.inventory,
        ],key),[null,null]);
        await shot(page,"write-failed");
        await page.evaluate(() => window.__restoreSaveWrite());
        await confirmStartup(page);
        const original = await page.evaluate(key => localStorage.getItem(key),key);
        // 构造与当前配置不一致的隔离存档，不能以新档覆盖。
        const mismatch = JSON.parse(original);
        mismatch.config.spaces.safeWidth++;
        for (const [name,text] of [["corrupt","{broken-save"],["mismatch",JSON.stringify(mismatch)]]) {
            await page.evaluate(({key,text}) => localStorage.setItem(key,text),{key,text});
            await page.reload(); await ready(page);
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.view.getElement("txt_save_title").text),"存档需要处理");
            await shot(page,name);
            await confirmStartup(page);
            assert.equal(await page.evaluate(key => localStorage.getItem(key),key),text);
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.view.path.endsWith("/SkillBattleStartView.lh")),true);
        }
        // 其他页面已更新存档时，首次确认也必须拒绝覆盖。
        await page.evaluate(key => localStorage.removeItem(key),key);
        await page.reload(); await ready(page);
        await page.evaluate(({key,original}) => localStorage.setItem(key,original),{key,original});
        await click(page,"btn_save_confirm");
        assert.equal(await page.evaluate(key => localStorage.getItem(key),key),original);
        assert.equal(await page.evaluate(() => window.__skillBattlePreview.view.path.endsWith("/LobbySaveView.lh")),true);
        assert.deepEqual(errors,[]);
        await context.close();
        console.log("通过保存失败重试、损坏/不匹配原档保留、跨页更新拒绝覆盖。");
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
