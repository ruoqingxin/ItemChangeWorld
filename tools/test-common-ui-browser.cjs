const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const { createPrefabResolver } = require("./ui-prefab.cjs");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18125";
const output = path.resolve(__dirname, "../tmp/common-ui-browser");
const prefabs = createPrefabResolver();
const canonical = node => ({
    name: node.name, type: node._$type, x: node.x || 0, y: node.y || 0,
    width: node.width, height: node.height, text: node.text,
    visible: node.visible !== false, mouseEnabled: node.mouseEnabled,
    children: (node._$child || []).map(canonical),
});
const fragments = [
    "inventory/InventoryPanel", "inventory/InventoryCarry", "inventory/InventoryBag",
    "inventory/InventorySource", "inventory/InventoryItem", "dialog/PagedReportPanel", "choice/ChoiceSlots",
].map(name => {
    const file = `ui/prefab/common/${name}.lh`;
    return { file, expected: canonical(prefabs.expand(file)) };
});

(async () => {
    await fs.mkdir(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, width, height, touch] of [
            ["desktop", 1280, 720, false], ["wide", 1920, 1080, false], ["mobile", 844, 390, true],
        ]) {
            const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
            try {
                const page = await context.newPage(), errors = [], failed = [];
                page.on("pageerror", error => errors.push(error.message));
                page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
                page.on("response", response => { if (response.status() >= 400) failed.push(response.url()); });
                await page.goto(url);
                await page.waitForFunction(() => window.__skillBattlePreview?.view?.isOpened &&
                    window.__skillBattlePreview.panel?.opened);
                const native = await page.evaluate(async fragments => {
                    const issues = [];
                    for (const { file, expected } of fragments) {
                        const prefab = await Laya.loader.load(file, Laya.Loader.HIERARCHY);
                        const instance = prefab.create();
                        function canonical(n) {
                            const result = {
                                name: n.name, type: n.constructor.name, x: n.x, y: n.y,
                                width: n.width, height: n.height, visible: n.visible, mouseEnabled: n.mouseEnabled,
                                children: [],
                            };
                            if (n instanceof Laya.GTextField) result.text = n.text;
                            for (let i = 0; i < n.numChildren; i++) {
                                const child = n.getChildAt(i);
                                if (child instanceof Laya.GWidget) result.children.push(canonical(child));
                            }
                            return result;
                        }
                        const actual = canonical(instance);
                        function compare(a, b) {
                            for (const key of Object.keys(b)) {
                                if (key === "children" || b[key] === undefined) continue;
                                const v = key === "type" ? a[key].split(".").pop() : a[key];
                                if (v !== b[key]) issues.push([file, b.name, key, v, b[key]]);
                            }
                            if (a.children.length !== b.children.length) issues.push([file, b.name, "child count"]);
                            else a.children.forEach((child, i) => compare(child, b.children[i]));
                        }
                        compare(actual, expected);
                        instance.destroy();
                    }
                    return issues;
                }, fragments);
                assert.deepEqual(native, [], "Static prefab expansion agrees with the actual native Laya parser");
                const cloneResult = await page.evaluate(() => {
                    const view = window.__skillBattlePreview.view;
                    function find(node, name) {
                        if (node.name === name) return node;
                        for (let i = 0; i < node.numChildren; i++) {
                            const child = find(node.getChildAt(i), name);
                            if (child) return child;
                        }
                        return null;
                    }
                    const mapped = view.uiElement.elementMapper.elements;
                    if (mapped.some(n => !n)) return ["Null native mapper reference"];
                    for (const node of mapped) {
                        if (view.getElement(node.name, false) !== node) return ["Mismatched binding", node.name];
                        if (!node.__raw) return ["Missing raw clone data", node.name];
                    }
                    const issues = [];
                    for (const name of ["inventoryRoot", "carryArea", "bagArea", "sourceArea",
                        "invItem0", "invList0", "invHeld", "invItem0Bg", "invList0Icon"]) {
                        const node = view.getElement(name);
                        const clone = Laya.HierarchyParser.parse(node.__raw)[0];
                        if (!clone || clone === node || clone.name !== node.name) issues.push(["Clone mismatch", name]);
                        if (clone) {
                            clone.name = "independent-clone";
                            if (node.name !== name) issues.push(["Clone mutated original", name]);
                            clone.destroy();
                        }
                    }
                    const source = Laya.loader.getRes("ui/prefab/common/inventory/InventoryItem.lh");
                    const background = source.data._$child[0], originalAlpha = background.alpha;
                    try {
                        background.alpha = 0.37;
                        const panel = Laya.loader.getRes("ui/prefab/common/inventory/InventoryPanel.lh");
                        const first = panel.create(), second = panel.create();
                        const a = find(first, "invList0Bg"), b = find(second, "invList0Bg");
                        if (a === b || a.alpha !== 0.37 || b.alpha !== 0.37)
                            issues.push(["Shared item edits did not propagate through source/panel nesting"]);
                        a.alpha = 0.9;
                        if (b.alpha !== 0.37 || view.getElement("invList0Bg").alpha === 0.9)
                            issues.push(["Shared prefab instances leaked mutable state"]);
                        first.destroy(); second.destroy();
                    } finally {
                        if (originalAlpha === undefined) delete background.alpha;
                        else background.alpha = originalAlpha;
                    }
                    return issues;
                });
                assert.deepEqual(cloneResult, [], "Scoped bindings, native cloning, inherited edits and independent instances");
                await page.evaluate(() => window.__skillBattlePreview.panel.startRun());
                await page.waitForFunction(() => window.__skillBattlePreview.trial.inventory?.phase === "preparation");
                const before = await page.evaluate(() => localStorage.getItem("nowchange.stage4-expedition.v1"));
                await page.evaluate(() => {
                    const preview = window.__skillBattlePreview;
                    preview.close(); preview.ui.clearAllInstant(); preview.reopen();
                });
                await page.waitForFunction(() => window.__skillBattlePreview.view?.isOpened &&
                    window.__skillBattlePreview.panel?.opened);
                assert.equal(await page.evaluate(() => localStorage.getItem("nowchange.stage4-expedition.v1")), before,
                    "Recreating a page from shared prefabs does not write or migrate the save");
                const pixels = await page.screenshot({ path: path.join(output, `${name}-shared-storage.png`) });
                const stats = await sharp(pixels).stats();
                assert.ok(stats.channels.slice(0, 3).some(c => c.stdev > 12), "Nonblank shared UI");
                assert.deepEqual(errors, []); assert.deepEqual(failed, []);
                console.log(`PASS native common prefabs: ${name}; parser parity, scoped bindings, cloning, edit propagation, instance isolation and cache recreation`);
            } finally { await context.close(); }
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
