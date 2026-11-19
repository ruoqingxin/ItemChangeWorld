const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18095";
const out = path.resolve(__dirname, "../output/design/warehouse");

async function point(page, key, interactive = true) {
    return page.evaluate(({ key, interactive }) => {
        const node = window.__skillBattlePreview.view.getElement(key);
        if (!node.visible || interactive && !node.mouseEnabled) throw Error("控件不可用：" + key);
        const p = node.localToGlobal(new Laya.Point(node.width / 2, node.height / 2));
        const r = document.querySelector("canvas").getBoundingClientRect();
        return { x: r.left + p.x * r.width / Laya.stage.width,
            y: r.top + p.y * r.height / Laya.stage.height };
    }, { key, interactive });
}

async function click(page, key) {
    const p = await point(page, key);
    if (page.touchMode) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(120);
}

async function drag(page, from, to) {
    const a = await point(page, from), b = await point(page, to, false);
    if (page.touchMode) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...a, id: 1 }] });
        for (let i = 1; i <= 16; i++)
            await cdp.send("Input.dispatchTouchEvent", { type: "touchMove",
                touchPoints: [{ x: a.x + (b.x - a.x) * i / 16, y: a.y + (b.y - a.y) * i / 16, id: 1 }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
    } else {
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
        await page.mouse.move(b.x, b.y, { steps: 16 });
        await page.mouse.up();
    }
    await page.waitForTimeout(180);
}

async function warehouse(page) {
    await page.waitForFunction(() => window.__skillBattlePreview?.view?.isOpened &&
        window.__skillBattlePreview.view.path.endsWith("/SkillBattleInventoryView.lh"));
    await page.waitForFunction(() => ["invLeftPanel", "invBagPanel", "invRightPanel"].every(key =>
        window.__skillBattlePreview.view.getElement(key).texture?.bitmap));
}

async function checkLayout(page) {
    const issues = await page.evaluate(() => {
        const v = window.__skillBattlePreview.view, problems = [];
        const bounds = n => {
            const a = n.localToGlobal(new Laya.Point()), b = n.localToGlobal(new Laya.Point(n.width, n.height));
            return { x: a.x, y: a.y, right: b.x, bottom: b.y };
        };
        const panels = ["invLeftPanel", "invBagPanel", "invRightPanel"].map(key => bounds(v.getElement(key)));
        if (panels.some((p, i) => i && p.x < panels[i - 1].right)) problems.push("三栏重叠");
        if (panels.some(p => Math.abs(p.y - panels[0].y) > 0.1 ||
            Math.abs(p.bottom - panels[0].bottom) > 0.1)) problems.push("三栏上下未对齐");
        for (const n of v.uiElement.elementMapper.elements) {
            if (n.name === "screenBackground") continue;
            let visible = n.visible;
            for (let p = n.parent; p; p = p.parent) visible &&= p.visible;
            if (!visible) continue;
            const b = bounds(n);
            if (b.x < -0.5 || b.y < -0.5 || b.right > Laya.stage.width + 0.5 ||
                b.bottom > Laya.stage.height + 0.5) problems.push(n.name + "超出屏幕");
            if (n instanceof Laya.GTextField && n.text) {
                n.textIns.typeset(true);
                if (n.textIns.textWidth > n.width + 2 || n.textIns.textHeight > n.height + 2)
                    problems.push(n.name + "文字溢出");
            }
        }
        const first = v.getElement("invSourceCell0"), last = v.getElement("invSourceCell55");
        if (first.width !== 54 || last.x - first.x !== 7 * 56 ||
            last.y - first.y !== 6 * 56) problems.push("仓库格距发生变化");
        const detail = bounds(v.getElement("invDetail")), bag = bounds(v.getElement("invCell_bag_0"));
        if (bag.y + 6 * 56 > detail.y) problems.push("最大纳虚器容量遮挡详情");
        return problems;
    });
    assert.deepEqual(issues, []);
}

(async () => {
    await fs.mkdir(out, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, width, height, touch] of [
            ["desktop", 1280, 720, false], ["mobile", 844, 390, true],
            ["tablet", 1024, 768, true], ["wide", 1560, 720, false],
        ]) {
            const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
            const page = await context.newPage(), errors = [];
            page.touchMode = touch;
            page.on("pageerror", e => errors.push(e.message));
            await page.goto(url);
            await page.waitForFunction(() => window.__skillBattlePreview?.view?.isOpened);
            await click(page, "btn_warehouse");
            await warehouse(page);
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.view.getElement("box_warehouse_empty").visible), true);
            assert.equal(await page.evaluate(() => localStorage.getItem("nowchange.expedition.v1")), null);
            await checkLayout(page);
            await page.screenshot({ path: path.join(out, name + "-empty.png") });
            await click(page, "invPrimary");
            await page.waitForFunction(() => window.__skillBattlePreview.trial.inventory?.phase === "preparation");
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.view.getElement("box_warehouse_empty").visible), false);
            await click(page, "btn_lobby_back");
            await click(page, "btn_warehouse");
            await warehouse(page);
            await checkLayout(page);
            await page.screenshot({ path: path.join(out, name + ".png") });
            const sourceIndex = await page.evaluate(() =>
                window.__skillBattlePreview.panel.visibleItems.findIndex(i => i.templateId === 309));
            assert.ok(sourceIndex >= 0);
            await click(page, "invList" + sourceIndex);
            assert.ok(await page.evaluate(() => window.__skillBattlePreview.view.getElement("invDetail").text.length > 0));
            await checkLayout(page);
            await page.screenshot({ path: path.join(out, name + "-selected.png") });
            await drag(page, "invList" + sourceIndex, "invCell_bag_1");
            assert.equal(await page.evaluate(() =>
                window.__skillBattlePreview.trial.inventory.items.find(i => i.templateId === 309).location.space), "bag");
            const bagIndex = await page.evaluate(() =>
                window.__skillBattlePreview.panel.gridItems.findIndex(i => i.templateId === 309));
            await drag(page, "invItem" + bagIndex, "invSourceCell55");
            assert.equal(await page.evaluate(() =>
                window.__skillBattlePreview.trial.inventory.items.find(i => i.templateId === 309).location.space), "warehouse");
            assert.deepEqual(await page.evaluate(() => {
                const s = window.__skillBattlePreview.trial.inventory;
                const uid = s.items.find(i => i.templateId === 309).uid;
                const slot = s.warehouseLayout.find(p => p.uid === uid);
                return [slot.page, slot.x, slot.y];
            }), [0, 7, 6]);
            await click(page, "invEquipment");
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.panel.visibleItems.length), 0);
            await click(page, "invAll");
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.panel.visibleItems.length), 3);
            const saved = await page.evaluate(() => localStorage.getItem("nowchange.expedition.v1"));
            await click(page, "btn_lobby_back");
            await click(page, "btn_warehouse");
            await warehouse(page);
            assert.equal(await page.evaluate(() => localStorage.getItem("nowchange.expedition.v1")), saved);
            if (name === "desktop") {
                for (const size of [{ width: 2560, height: 1080 }, { width: 667, height: 375 },
                    { width: 1280, height: 720 }]) {
                    await page.setViewportSize(size);
                    await page.waitForTimeout(160);
                    await checkLayout(page);
                    await page.screenshot({ path: path.join(out, `resize-${size.width}.png`) });
                }
            }
            assert.deepEqual(errors, []);
            await context.close();
            console.log(`通过 ${name}：空状态、三栏适配、分类、物品详情、双向拖拽及存档保持。`);
        }
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
