const { chromium } = require("playwright");
const sharp = require("sharp");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { confirmStartup } = require("./lobby-save-test-utils.cjs");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18095";
const out = path.resolve(__dirname, "../output/design/lobby");
const facilities = ["alchemy", "forge", "warehouse", "library", "realm", "market"];
const skins = [
    "img_player_strip", "img_player_portrait", "img_player_frame",
    "img_wish_strip", "img_wish", "img_settings_skin", "img_settings",
    ...facilities.map(name => `img_${name}_plate`),
];

async function checkEditorSnapshot() {
    const prefab = path.resolve(__dirname, "../assets/ui/prefab/module/lobby/LobbyView.lh");
    const meta = JSON.parse(await fs.readFile(prefab + ".meta", "utf8"));
    const snapshot = path.resolve(__dirname, "../library/cache", meta.uuid + ".lh");
    let data;
    try { data = JSON.parse(await fs.readFile(snapshot, "utf8")); }
    catch (error) {
        if (error.code === "ENOENT") return;
        throw error;
    }
    const images = new Set();
    const visit = node => {
        if (node._$type === "GImage" && node.src) images.add(node.src);
        (node._$child || []).forEach(visit);
    };
    visit(data);
    for (const facility of facilities)
        assert.ok(images.has(`ui/texture/lobby/building-${facility}.png`),
            `IDE 大厅快照遗漏 ${facility} 建筑；编辑器仍保留旧预制体，需重新加载后再运行。`);
}

async function click(page, key, part = null) {
    const point = await page.evaluate(({ key, part }) => {
        const preview = window.__skillBattlePreview;
        const node = preview.ui.topView?.getElement(key, false) || preview.view.getElement(key, false);
        if (!node?.visible || !node.mouseEnabled) throw new Error(`控件不可用：${key}`);
        const target = part ? preview.view.getElement(part) : node;
        const center = target.localToGlobal(new Laya.Point(target.width / 2, target.height / 2));
        const rect = document.querySelector("canvas").getBoundingClientRect();
        return { x: rect.left + center.x * rect.width / Laya.stage.width,
            y: rect.top + center.y * rect.height / Laya.stage.height };
    }, { key, part });
    if (page.touchMode) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(100);
}

async function waitLobby(page) {
    await page.waitForFunction(() => window.__skillBattlePreview?.view?.isOpened &&
        window.__skillBattlePreview.view.path.endsWith("/LobbyView.lh"));
    await page.waitForFunction(names => names.every(name => {
        const image = window.__skillBattlePreview.view.getElement(`img_${name}_building`, false);
        return image?.visible && image.texture?.bitmap && image.texture.width > 0 && image.texture.height > 0;
    }), facilities);
    await page.waitForFunction(keys => keys.every(key => {
        const image = window.__skillBattlePreview.view.getElement(key, false);
        return image?.visible && image.texture?.bitmap && image.texture.width > 0 && image.texture.height > 0;
    }), skins);
}

async function assertBuildingPixels(page) {
    const regions = await page.evaluate(names => {
        const rect = document.querySelector("canvas").getBoundingClientRect();
        return names.map(name => {
            const image = window.__skillBattlePreview.view.getElement(`img_${name}_building`);
            const point = image.localToGlobal(new Laya.Point());
            return { name, left: Math.round(rect.left + point.x * rect.width / Laya.stage.width),
                top: Math.round(rect.top + point.y * rect.height / Laya.stage.height),
                width: Math.floor(image.width * image.parent.scaleX * rect.width / Laya.stage.width),
                height: Math.floor(image.height * image.parent.scaleY * rect.height / Laya.stage.height) };
        });
    }, facilities);
    const visible = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    try {
        await page.evaluate(names => names.forEach(name => {
            window.__skillBattlePreview.view.getElement(`img_${name}_building`).visible = false;
        }), facilities);
        await page.waitForTimeout(50);
        const hidden = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer();
        for (const region of regions) {
            let changed = 0;
            for (let y = region.top; y < region.top + region.height; y++) {
                for (let x = region.left; x < region.left + region.width; x++) {
                    const offset = (y * visible.info.width + x) * 3;
                    const delta = Math.abs(visible.data[offset] - hidden[offset]) +
                        Math.abs(visible.data[offset + 1] - hidden[offset + 1]) +
                        Math.abs(visible.data[offset + 2] - hidden[offset + 2]);
                    if (delta > 24) changed++;
                }
            }
            assert.ok(changed > region.width * region.height * 0.15, region.name + "建筑未实际绘制");
        }
    } finally {
        await page.evaluate(names => names.forEach(name => {
            window.__skillBattlePreview.view.getElement(`img_${name}_building`).visible = true;
        }), facilities);
        await page.waitForTimeout(50);
    }
}

async function screenshot(page, name) {
    const bytes = await page.screenshot({ path: path.join(out, name + ".png") });
    const stats = await sharp(bytes).stats();
    assert.ok(stats.channels.slice(0, 3).some(channel => channel.stdev > 12), "场景画布非空");
}

async function assertLayout(page) {
    const issues = await page.evaluate(() => {
        const view = window.__skillBattlePreview.view, issues = [];
        const facilities = ["alchemy", "forge", "warehouse", "library", "realm", "market"];
        const bounds = node => {
            const a = node.localToGlobal(new Laya.Point());
            const b = node.localToGlobal(new Laya.Point(node.width, node.height));
            return { left: a.x, top: a.y, right: b.x, bottom: b.y };
        };
        const intersects = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 &&
            a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
        const buttons = facilities.map(name => ({ name, box: bounds(view.getElement("btn_" + name)) }));
        const hud = ["box_player", "box_wish", "btn_settings"].map(key => bounds(view.getElement(key)));
        for (const key of ["img_player_strip", "img_player_portrait", "img_player_frame", "txt_player_name",
            "txt_player_realm", "img_wish_strip", "img_wish", "txt_wish_amount",
            "img_settings_skin", "img_settings"]) {
            const node = view.getElement(key), box = bounds(node);
            if (box.left < 0 || box.top < 0 || box.right > Laya.stage.width + 0.5 ||
                box.bottom > Laya.stage.height + 0.5) issues.push(key + "顶部控件超出视口");
            if (node instanceof Laya.GTextField) {
                node.textIns.typeset(true);
                if (node.textIns.textWidth > node.width + 1 || node.textIns.textHeight > node.height + 1)
                    issues.push(key + "顶部文字溢出");
            }
        }
        if (hud.some((box, index) => hud.slice(index + 1).some(other => intersects(box, other))))
            issues.push("顶部信息栏相互重叠");
        for (const name of facilities) {
            for (const key of ["btn_" + name, "img_" + name + "_building", "img_" + name + "_plate", "txt_" + name]) {
                const node = view.getElement(key), box = bounds(node);
                if (box.left < -0.5 || box.top < -0.5 || box.right > Laya.stage.width + 0.5 ||
                    box.bottom > Laya.stage.height + 0.5) issues.push(key + "超出视口");
                if (node instanceof Laya.GTextField) {
                    node.textIns.typeset(true);
                    if (node.textIns.textWidth > node.width + 1 || node.textIns.textHeight > node.height + 1)
                        issues.push(key + "文字溢出");
                    const fontSize = node.fontSize * (box.bottom - box.top) / node.height;
                    if (Math.abs(fontSize - 23) > 0.01) issues.push(key + "字号随建筑缩放");
                }
            }
            const plate = bounds(view.getElement("img_" + name + "_plate"));
            if (Math.abs(plate.right - plate.left - 152) > 0.01 ||
                Math.abs(plate.bottom - plate.top - 40) > 0.01) issues.push(name + "名称牌尺寸不统一");
        }
        buttons.forEach((button, i) => {
            if (hud.some(box => intersects(button.box, box))) issues.push(button.name + "遮挡状态栏");
            for (const other of buttons.slice(i + 1))
                if (intersects(button.box, other.box)) issues.push(button.name + "与" + other.name + "热区重叠");
        });
        const background = bounds(view.getElement("img_courtyard"));
        if (background.left > 0.5 || background.top > 0.5 || background.right < Laya.stage.width - 0.5 ||
            background.bottom < Laya.stage.height - 0.5) issues.push("背景未铺满");
        const image = view.getElement("img_courtyard");
        if (Math.abs(image.width / image.height - 16 / 9) > 0.001) issues.push("背景被拉伸");
        if (view.getElement("box_courtyard").scaleX !== 1) issues.push("背景容器带动建筑裁切");
        return issues;
    });
    assert.deepEqual(issues, []);
}

(async () => {
    await fs.mkdir(out, { recursive: true });
    await checkEditorSnapshot();
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, width, height, touch] of [
            ["desktop", 1280, 720, false], ["wide", 1560, 720, false], ["mobile", 844, 390, true],
            ["tablet", 1024, 768, true], ["laptop", 1440, 900, false], ["ultrawide", 2560, 1080, false],
            ["compact", 667, 375, true],
        ]) {
            const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
            const page = await context.newPage(), errors = [];
            page.touchMode = touch;
            page.on("pageerror", error => errors.push(error.message));
            await page.goto(url);
            await confirmStartup(page);
            await waitLobby(page);
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.trial.inventory.phase), "preparation",
                "进入大厅前已确认创建整备存档");
            await assertLayout(page);
            await assertBuildingPixels(page);
            await screenshot(page, "lobby-" + name);
            if (name === "desktop") {
                for (const size of [{ width: 1560, height: 720 }, { width: 1024, height: 768 },
                    { width: 2560, height: 1080 }, { width, height }]) {
                    await page.setViewportSize(size);
                    await page.waitForTimeout(150);
                    await assertLayout(page);
                }
                await click(page, "btn_alchemy");
                assert.equal(await page.evaluate(() => window.__skillBattlePreview.view.getElement("txt_notice").text), "炼丹炉尚未开放");
                assert.equal(await page.evaluate(() => {
                    const view = window.__skillBattlePreview.view;
                    const notice = view.getElement("box_notice");
                    const corner = notice.localToGlobal(new Laya.Point());
                    return ["alchemy", "forge", "warehouse", "library", "realm", "market"].every(name => {
                        const plate = view.getElement(`img_${name}_plate`);
                        const bottom = plate.localToGlobal(new Laya.Point(plate.width, plate.height));
                        return bottom.y <= corner.y;
                    });
                }), true, "提示条不会覆盖建筑名称牌");
                await screenshot(page, "lobby-notice-" + name);
            }
            for (const [key, message] of [
                ["btn_alchemy", "炼丹炉尚未开放"], ["btn_forge", "炼器室尚未开放"],
                ["btn_library", "功法查阅与升级尚未开放"], ["btn_market", "坊市交易尚未开放"],
            ]) {
                const facility = key.slice(4);
                for (const part of ["img_" + facility + "_building", "img_" + facility + "_plate"]) {
                    await click(page, key, part);
                    assert.equal(await page.evaluate(() => window.__skillBattlePreview.view.getElement("txt_notice").text), message);
                }
            }
            await click(page, "btn_settings");
            await page.waitForFunction(() => window.__skillBattlePreview.ui.topView?.path.endsWith("/LobbySettingsView.lh"));
            await screenshot(page, "lobby-settings-" + name);
            await click(page, "btn_music");
            await click(page, "btn_sound");
            assert.deepEqual(await page.evaluate(() => [Laya.SoundManager.musicMuted, Laya.SoundManager.soundMuted]), [true, true]);
            await click(page, "btn_close");
            await click(page, "btn_warehouse", "img_warehouse_plate");
            await page.waitForFunction(() => window.__skillBattlePreview.view.path.endsWith("/SkillBattleInventoryView.lh") &&
                window.__skillBattlePreview.view.isOpened);
            await screenshot(page, "lobby-warehouse-" + name);
            await click(page, "btn_close");
            await waitLobby(page);
            await click(page, "btn_realm", "img_realm_building");
            await page.waitForFunction(() => window.__skillBattlePreview.panel?.opened);
            await screenshot(page, "lobby-preparation-" + name);
            const saved = await page.evaluate(() => localStorage.getItem("nowchange.expedition.v1"));
            assert.ok(saved);
            await click(page, "btn_lobby_back");
            await waitLobby(page);
            assert.equal(await page.evaluate(() => localStorage.getItem("nowchange.expedition.v1")), saved,
                "返回大厅不修改已准备的物品或探索状态");
            await page.reload();
            await confirmStartup(page);
            await waitLobby(page);
            assert.deepEqual(await page.evaluate(() => [Laya.SoundManager.musicMuted, Laya.SoundManager.soundMuted]), [true, true]);
            await click(page, "btn_realm");
            await page.waitForFunction(() => window.__skillBattlePreview.panel?.opened);
            await click(page, "invPrimary");
            await page.waitForFunction(() => window.__skillBattlePreview.trial.inventory?.phase === "active");
            await page.reload();
            await confirmStartup(page);
            await page.waitForFunction(() => window.__skillBattlePreview?.panel?.pageRole === "map");
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.trial.inventory.phase), "active",
                "刷新进行中的探索仍恢复原地图");
            assert.deepEqual(await page.evaluate(() => [Laya.SoundManager.musicMuted, Laya.SoundManager.soundMuted]), [true, true]);
            assert.deepEqual(errors, []);
            await context.close();
            console.log(`通过 ${name}：建筑与名称完整、热区无重叠、背景铺满、实际点击/触摸、设置及往返恢复`);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
