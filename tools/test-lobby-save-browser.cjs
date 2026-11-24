const { chromium } = require("playwright");
const sharp = require("sharp");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { confirmStartup } = require("./lobby-save-test-utils.cjs");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18095";
const out = path.resolve(__dirname, "../tmp/combat-release/lobby-save");
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
    if (page.touchMode) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(100);
}
async function resetDialog(page) {
    await click(page,"btn_save_reset");
    await page.waitForFunction(() => window.__skillBattlePreview.ui.topView?.isOpened &&
        window.__skillBattlePreview.ui.topView.path.endsWith("/SkillBattleConfirmView.lh"));
}
async function shot(page, name, confirmation=false) {
    const issues = await page.evaluate(confirmation => {
        const v = window.__skillBattlePreview.ui.topView, issues = [];
        const panel = v.getElement(confirmation?"dialogArea":"box_save_dialog");
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
    },confirmation);
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
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.view.getElement("btn_save_reset").visible),false);
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
            // 在隔离档内制造物品出售与限购记录，确认重置确实恢复初始状态。
            await page.evaluate(() => {
                const m=window.__skillBattlePreview.trial;
                const item=m.archive.config.templates.find(t=>t.kind==="material"&&t.width===1&&t.height===1);
                m.buyMarketGoods(1,[{id:1,itemId:item.id,price:0,limitCount:1,enabled:true}],
                    {space:"bag",x:1,y:0,rotated:false});
                const bought=m.inventory.items.find(i=>i.uid.includes(":market:"));
                m.sellMarketItem(bought.uid,bought.location);
                localStorage.setItem("reset-test-other-setting","keep");
            });
            const changed=await page.evaluate(key=>localStorage.getItem(key),key);
            assert.ok(JSON.parse(changed).state.wish>0);
            assert.equal(JSON.parse(changed).state.marketPurchases.length,1);
            await page.reload();await ready(page);
            await resetDialog(page);
            assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),changed,"打开确认不重置");
            await shot(page,name+"-reset-confirm",true);
            await click(page,"dialogCancel");
            assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),changed,"取消保留原档");
            assert.equal(await page.evaluate(()=>window.__skillBattlePreview.view.isOpened),true);
            await resetDialog(page);
            await click(page,"dialogConfirm");
            await page.waitForFunction(()=>window.__skillBattlePreview.view.isOpened&&
                window.__skillBattlePreview.view.path.endsWith("/LobbyView.lh"));
            const reset=await page.evaluate(key=>localStorage.getItem(key),key),fresh=JSON.parse(reset);
            assert.notEqual(fresh.runId,JSON.parse(changed).runId);
            assert.equal(fresh.state.phase,"preparation");
            assert.equal(fresh.state.wish,JSON.parse(first).state.wish);
            assert.equal(fresh.state.marketPurchases,undefined);
            assert.equal(fresh.state.items.length,JSON.parse(first).state.items.length);
            assert.deepEqual(fresh.commands,[]);
            assert.equal(await page.evaluate(()=>localStorage.getItem("reset-test-other-setting")),"keep");
            await page.reload();await ready(page);
            assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),reset);
            await confirmStartup(page);
            assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),reset,"新档继续不重复发物品");
            assert.deepEqual(errors,[]);
            await context.close();
            console.log(`通过 ${name}：首次保存、原档继续、重置确认/取消、清除交易记录并重新开始、刷新保持与适配。`);
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
        let original = await page.evaluate(key => localStorage.getItem(key),key);
        const earlier=original;
        await page.reload();await ready(page);
        await resetDialog(page);
        await page.evaluate(key=>{
            const write=Storage.prototype.setItem;
            window.__restoreSaveWrite=()=>{Storage.prototype.setItem=write;};
            Storage.prototype.setItem=function(k,v){
                if(k===key)throw Error("测试：重置写入失败");
                return write.call(this,k,v);
            };
        },key);
        await click(page,"dialogConfirm");
        assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),original);
        assert.equal(await page.evaluate(()=>window.__skillBattlePreview.ui.topView.getElement("dialogError").text),
            "测试：重置写入失败");
        assert.deepEqual(await page.evaluate(()=>window.__skillBattlePreview.trial.archive),JSON.parse(original));
        await shot(page,"reset-write-failed",true);
        await page.evaluate(()=>window.__restoreSaveWrite());
        await click(page,"dialogConfirm");
        await page.waitForFunction(()=>window.__skillBattlePreview.view.path.endsWith("/LobbyView.lh"));
        original=await page.evaluate(key=>localStorage.getItem(key),key);
        assert.notEqual(original,earlier);
        await page.reload();await ready(page);await resetDialog(page);
        await page.evaluate(({key,earlier})=>localStorage.setItem(key,earlier),{key,earlier});
        await click(page,"dialogConfirm");
        assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),earlier);
        assert.match(await page.evaluate(()=>window.__skillBattlePreview.ui.topView.getElement("dialogError").text),/其他页面/);
        await click(page,"dialogCancel");
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
            await page.reload();await ready(page);await resetDialog(page);
            await click(page,"dialogCancel");
            assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),text);
            await resetDialog(page);await click(page,"dialogConfirm");
            await page.waitForFunction(()=>window.__skillBattlePreview.view.path.endsWith("/LobbyView.lh"));
            assert.equal(await page.evaluate(()=>window.__skillBattlePreview.trial.error),"");
            assert.equal(JSON.parse(await page.evaluate(key=>localStorage.getItem(key),key)).state.phase,"preparation");
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
        console.log("通过首次与重置保存失败保留原档和重试、损坏/不匹配档确认重建、跨页更新拒绝覆盖。");
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
