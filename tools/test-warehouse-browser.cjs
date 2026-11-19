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
        const popup = bounds(v.getElement("box_inventory_popup"));
        if (Math.abs((popup.x + popup.right) / 2 - Laya.stage.width / 2) > 0.5 ||
            Math.abs((popup.y + popup.bottom) / 2 - Laya.stage.height / 2) > 0.5)
            problems.push("弹窗未居中");
        if (v.mapperType !== 2) problems.push("仓库未使用弹窗遮罩");
        const visible = n => {
            for (let p=n;p;p=p.parent) if(!p.visible)return false;
            return true;
        };
        for (const key of ["invTitle","invClock","invToggle","invPrimary","invUse","invDrop",
            "invCancel","invConfirm","invExtract","invAbandon"])
            if (visible(v.getElement(key))) problems.push("冗余控件仍可见：" + key);
        for (const n of v.uiElement.elementMapper.elements) {
            if (n.name === "screenBackground") continue;
            if (!visible(n)) continue;
            // 被纳虚器视口裁切的内容不属于屏幕溢出。
            let clipped = false;
            for(let p=n.parent;p;p=p.parent) if(p.name === "bagItemsArea")clipped=true;
            if(clipped)continue;
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
        const equip = bounds(v.getElement("equipmentArea")), bag = bounds(v.getElement("bagArea"));
        if (equip.bottom >= bag.y) problems.push("装备与背包重叠");
        return problems;
    });
    assert.deepEqual(issues, []);
}

async function checkBagScrolling(page) {
    const saved = await page.evaluate(() => localStorage.getItem("nowchange.expedition.v1"));
    // 仅在浏览器内存中放入现有八列六行纳虚器，恢复后继续使用正式整备档。
    await page.evaluate(() => {
        const v=window.__skillBattlePreview;
        window.__warehouseFixture=structuredClone(v.trial.data.save.state);
        const state=v.trial.data.save.state;
        state.items.find(i=>i.location.space==="container").templateId=1211;
        state.items.find(i=>i.location.space==="bag").location.y=5;
        v.panel.refresh();
    });
    await click(page,"btn_bag_down");
    await click(page,"btn_bag_down");
    assert.deepEqual(await page.evaluate(() => {
        const v=window.__skillBattlePreview,p=v.panel,s=p.bagScroller;
        const target=v.view.getElement("invCell_bag_41");
        const point=p.root.globalToLocal(target.localToGlobal(new Laya.Point(27,27)));
        const item=v.trial.inventory.items.find(i=>i.templateId===309);
        const hit=p.hitDrag(point,{uid:item.uid,rotated:false,grabX:0.5,grabY:0.5});
        const hidden=v.view.getElement("invCell_bag_0");
        const clipped=p.root.globalToLocal(hidden.localToGlobal(new Laya.Point(27,27)));
        const hiddenHit=p.hitDrag(clipped,{uid:item.uid,rotated:false,grabX:0.5,grabY:0.5});
        return [s.posY,s.contentHeight,hit?.space,hit?.x,hit?.y,hiddenHit?.space==="bag"];
    }),[168,334,"bag",1,5,false]);
    await checkLayout(page);
    await page.screenshot({path:path.join(out,page.touchMode?"mobile-scroll.png":"desktop-scroll.png")});
    await page.evaluate(() => {
        const v=window.__skillBattlePreview;
        v.panel.bagScroller.posY=0;
        v.trial.data.save.state=window.__warehouseFixture;
        delete window.__warehouseFixture;
        v.panel.refresh();
    });
    assert.equal(await page.evaluate(() => localStorage.getItem("nowchange.expedition.v1")),saved);
}

async function checkMapModal(page) {
    await click(page,"btn_lobby_back");
    await click(page,"btn_realm");
    await click(page,"invPrimary");
    await page.waitForFunction(() => window.__skillBattlePreview.view.path.endsWith("/SkillBattleMapView.lh"));
    await page.evaluate(() => {window.__warehouseMap=window.__skillBattlePreview.view;});
    await click(page,"expStorage");
    await warehouse(page);
    await checkLayout(page);
    await click(page,"expLootPage7");
    assert.equal(await page.evaluate(() => window.__skillBattlePreview.panel.inventoryPage),6);
    await click(page,"expLootPage1");
    await page.screenshot({path:path.join(out,page.touchMode?"mobile-active.png":"desktop-active.png")});
    await click(page,"btn_lobby_back");
    assert.equal(await page.evaluate(() => window.__skillBattlePreview.view===window.__warehouseMap &&
        window.__warehouseMap.isOpened && window.__skillBattlePreview.panel.opened),true);
    await click(page,"expStorage");
    await warehouse(page);
    await click(page,"btn_lobby_back");
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
            await page.evaluate(() => { window.__warehouseUnderlay = window.__skillBattlePreview.view; });
            await click(page, "btn_warehouse");
            await warehouse(page);
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.view.getElement("box_warehouse_empty").visible), true);
            assert.equal(await page.evaluate(() => localStorage.getItem("nowchange.expedition.v1")), null);
            assert.equal(await page.evaluate(() => window.__warehouseUnderlay.isOpened &&
                window.__warehouseUnderlay.view.visible), true);
            await checkLayout(page);
            await page.screenshot({ path: path.join(out, name + "-empty.png") });
            await click(page, "btn_lobby_back");
            assert.equal(await page.evaluate(() =>
                window.__skillBattlePreview.view === window.__warehouseUnderlay), true);
            await click(page, "btn_realm");
            await click(page, "invPrimary");
            await page.waitForFunction(() => window.__skillBattlePreview.trial.inventory?.phase === "preparation");
            await click(page, "btn_lobby_back");
            await click(page, "btn_warehouse");
            await warehouse(page);
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.view.getElement("box_warehouse_empty").visible), false);
            await checkLayout(page);
            await page.screenshot({ path: path.join(out, name + ".png") });
            const sourceIndex = await page.evaluate(() =>
                window.__skillBattlePreview.panel.visibleItems.findIndex(i => i.templateId === 309));
            assert.ok(sourceIndex >= 0);
            await click(page, "invList" + sourceIndex);
            assert.ok(await page.evaluate(() => window.__skillBattlePreview.view.getElement("invDetail").text.length > 0));
            await checkLayout(page);
            await page.screenshot({ path: path.join(out, name + "-selected.png") });
            const beforeSelection=await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1"));
            await click(page,"invList1");
            await click(page,"invCell_bag_1");
            assert.equal(await page.evaluate(()=>window.__skillBattlePreview.panel.draft),null);
            assert.equal(await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1")),beforeSelection);
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
            if (name === "desktop" || name === "mobile") {
                await checkBagScrolling(page);
                await checkMapModal(page);
            }
            assert.deepEqual(errors, []);
            await context.close();
            console.log(`通过 ${name}：弹窗返回、空状态、适配、分类、物品详情、双向拖拽及存档保持。`);
        }
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
