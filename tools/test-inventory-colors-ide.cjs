const { chromium } = require("playwright");
const sharp = require("sharp");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "bin/inventory-colors-ide");
const previewURL = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18121";
const ideURL = process.env.SKILL_BATTLE_IDE_URL || "http://127.0.0.1:18092";
const button = "ui/atlas/common/button/ui_btn_cj_fh.png";
const saveKey = "nowchange.stage3-inventory.v1";

async function open(browser, url, viewport, imported, files) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => {
        const find = node => {
            if (node.skillBattleController?.nodes?.inventoryRoot) return node.skillBattleController;
            for (let i = 0; i < node.numChildren; i++) {
                const panel = find(node.getChildAt(i));
                if (panel) return panel;
            }
        };
        window.__colorPanel = window.Laya?.stage && find(Laya.stage);
        return window.__colorPanel?.opened;
    });
    await page.evaluate(() => window.__colorPanel.command("invPrimary"));
    await page.waitForFunction(() => window.__colorPanel.visibleItems.length >= 6);
    const textures = await page.evaluate(async ({ files, imported }) => {
        const result = [];
        for (const url of files) {
            const texture = await Laya.loader.load(url);
            const bitmap = texture.bitmap;
            const meta = imported ? await Laya.AssetDb.inst.getMeta(
                url, await Laya.AssetDb.inst.URL_to_UUID_async(url)) : null;
            result.push({ url, width: texture.width, height: texture.height,
                pma: bitmap._premultiplyAlpha, srgb: bitmap._gammaSpace, meta });
        }
        return result;
    }, { files, imported });
    for (const texture of textures) {
        assert.ok(texture.width > 0 && texture.height > 0, texture.url);
        assert.equal(texture.pma, true, `${texture.url}: premultiplied alpha`);
        assert.equal(texture.srgb, true, `${texture.url}: sRGB`);
        if (imported) {
            assert.equal(texture.meta.type, 2, `${texture.url}: sprite importer`);
            assert.equal(texture.meta.sRGB, true, `${texture.url}: imported sRGB`);
            assert.equal(texture.meta.pma, true, `${texture.url}: imported alpha`);
        }
    }
    if (imported) assert.equal(await page.evaluate(() => Laya.Config.useWebGL2), true,
        "Check the actual IDE pipeline without the preview's WebGL1 override");
    await page.waitForTimeout(300);
    return { context, page, errors };
}

async function probe(page, files) {
    return page.evaluate(files => {
        const save = localStorage.getItem("nowchange.stage3-inventory.v1");
        // Identical opaque backdrops expose both gamma shifts and white alpha fringes.
        const swatches = new Laya.Sprite();
        swatches.zOrder = 100000;
        swatches.graphics.drawRect(0, 0, 1280, 720, "#172228");
        files.forEach((url, i) => {
            const x = 20 + (i % 10) * 124, y = 20 + Math.floor(i / 10) * 220;
            swatches.graphics.drawRect(x, y, 120, 100, "#102018");
            swatches.graphics.drawRect(x, y + 100, 120, 100, "#b8bac0");
            const texture = Laya.loader.getRes(url);
            swatches.graphics.drawTexture(texture, x + 4, y + 4, 112, 192);
        });
        Laya.stage.addChild(swatches);
        window.__colorSwatches = swatches;
        return save;
    }, files);
}

async function compare(a, b, tag) {
    const left = await sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const right = await sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual(left.info, right.info);
    let total = 0, changed = 0;
    for (let i = 0; i < left.data.length; i++) {
        const delta = Math.abs(left.data[i] - right.data[i]);
        total += delta;
        if (delta > 8) changed++;
    }
    const mean = total / left.data.length, fraction = changed / left.data.length;
    assert.ok(mean < 2 && fraction < 0.02,
        `${tag}: IDE/preview color difference mean=${mean}, changed=${fraction}`);
    return { mean, fraction };
}

async function main() {
    await fs.mkdir(output, { recursive: true });
    const manifest = JSON.parse(await fs.readFile(
        path.join(root, "assets/ui/atlas/module/inventory/sources.json"), "utf8"));
    const files = [...manifest.assets.map(asset => asset.file), button];
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 },
            { width: 844, height: 390 }]) {
            const tag = viewport.width < 900 ? "mobile" : viewport.width > 1280 ? "wide" : "desktop";
            const pages = [];
            try {
                for (const [label, url, imported] of [["preview", previewURL, false], ["ide", ideURL, true]]) {
                    const run = await open(browser, url, viewport, imported, files);
                    pages.push(run);
                    await run.page.screenshot({ path: path.join(output, `${tag}-${label}-inventory.png`) });
                    const before = await probe(run.page, files);
                    await run.page.waitForTimeout(200);
                    // The IDE and standalone HTML have different letterbox colors outside the canvas.
                    await run.page.locator("canvas").first().screenshot({
                        path: path.join(output, `${tag}-${label}-swatches.png`) });
                    assert.equal(await run.page.evaluate(key => localStorage.getItem(key), saveKey), before,
                        "Rendering probes must not change inventory saves");
                    assert.deepEqual(run.errors, []);
                }
                const colors = await compare(path.join(output, `${tag}-preview-swatches.png`),
                    path.join(output, `${tag}-ide-swatches.png`), tag);
                console.log(`PASS ${tag}: ${files.length} imported textures, sRGB/alpha and IDE/preview pixels ${JSON.stringify(colors)}`);
            } finally {
                for (const run of pages) await run.context.close();
            }
        }
    } finally {
        await browser.close();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
