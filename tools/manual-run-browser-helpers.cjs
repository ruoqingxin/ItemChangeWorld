const assert = require("node:assert/strict");
const sharp = require("sharp");
const path = require("node:path");
const fs = require("node:fs");
const { output } = require("./evaluate-manual-gameplay.cjs");
const browserOutput = path.join(output, "browser");
const url = process.env.MANUAL_TEST_URL || "http://127.0.0.1:18126";
const state = p => p.evaluate(() => window.__manualTestPreview.session.state);
async function ready(p) {
    await p.waitForFunction(() => window.__manualTestPreview?.view.isOpened && window.__manualTestPreview.panel?.opened);
}
async function point(p, key, map = "buttons") {
    return p.evaluate(({ key, map }) => {
        const b = window.__manualTestPreview.panel[map][key];
        if (!b?.visible || map === "buttons" && !b.mouseEnabled) throw new Error("Inactive " + key);
        const pos = b.localToGlobal(new Laya.Point(b.width / 2, b.height / 2));
        const r = document.querySelector("canvas").getBoundingClientRect();
        return { x: r.left + pos.x * r.width / Laya.stage.width, y: r.top + pos.y * r.height / Laya.stage.height };
    }, { key, map });
}
async function click(p, key) { const pt = await point(p, key); await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(25); }
async function act(p, move) { await click(p, move === "end" ? "endTurn" : "move_" + move); await click(p, "confirm"); }
async function choose(p, menu, title) {
    await click(p, menu);
    const key = await p.evaluate(title => {
        const panel = window.__manualTestPreview.panel;
        return Object.keys(panel.buttons).find(k => k.startsWith("option_") && panel.labels[k + "Text"].text === title);
    }, title);
    assert.ok(key, "missing option " + title); await click(p, key);
}
async function fill(p, key, value) {
    const pt = await point(p, key, "inputs"); await p.mouse.click(pt.x, pt.y);
    await p.keyboard.press("Control+A"); await p.keyboard.type(String(value)); await p.keyboard.press("Tab");
    await p.waitForTimeout(50);
}
async function capture(p, name) {
    fs.mkdirSync(browserOutput, { recursive: true }); await p.waitForTimeout(100);
    const file = path.join(browserOutput, name + ".png"); await p.screenshot({ path: file });
    const stats = await sharp(file).stats(); assert.ok(stats.channels.some(x => x.stdev > 10), "nonblank canvas");
    const issues = await p.evaluate(() => {
        const panel = window.__manualTestPreview.panel, rects = [], issues = [];
        for (const [key, node] of Object.entries(panel.buttons)) {
            if (!node.visible || !node.mouseEnabled || key.startsWith("option_")) continue;
            const p = node.localToGlobal(new Laya.Point());
            if (p.x < -1 || p.y < -1 || p.x + node.width > Laya.stage.width + 1 ||
                p.y + node.height > Laya.stage.height + 1) issues.push("outside " + key);
            rects.push({ key, x: p.x, y: p.y, w: node.width, h: node.height });
        }
        for (let i = 0; i < rects.length; i++) for (const b of rects.slice(i + 1)) {
            const a = rects[i];
            if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 &&
                Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1) issues.push(a.key + "/" + b.key);
        }
        return issues;
    });
    assert.deepEqual(issues, [], name + " hit areas"); return file;
}
module.exports = { url, state, ready, click, act, choose, fill, capture, browserOutput };
