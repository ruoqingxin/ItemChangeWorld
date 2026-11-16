const { chromium } = require("playwright");
const sharp = require("sharp");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { run } = require("./evaluate-manual-gameplay.cjs");
const output = path.join(path.resolve(process.env.MANUAL_GAMEPLAY_OUTPUT ||
    path.resolve(__dirname, "../bin/manual-gameplay-v3")), "browser");
const url = process.env.MANUAL_TEST_URL || "http://127.0.0.1:18126";

async function click(p, key) {
    const pt = await p.evaluate(key => {
        const b = window.__manualTestPreview.panel.buttons[key];
        if (!b?.visible || !b.mouseEnabled) throw new Error("Inactive: " + key);
        const pos = b.localToGlobal(new Laya.Point(b.width / 2, b.height / 2));
        const rect = document.querySelector("canvas").getBoundingClientRect();
        return { x: rect.left + pos.x * rect.width / Laya.stage.width,
            y: rect.top + pos.y * rect.height / Laya.stage.height };
    }, key);
    await p.mouse.click(pt.x, pt.y);
}
async function main() {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    const results = [];
    try {
        const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        const errors = [];
        p.on("pageerror", e => errors.push(e.message));
        p.on("response", r => { if (r.status() >= 400) errors.push(r.url()); });
        await p.goto(url + "/?manualTest=1");
        await p.waitForFunction(() => window.__manualTestPreview?.panel?.opened);
        const cases = [
            [0, "adaptive"], [1, "responses"], [2, "arrays"],
            [3, "responses"], [4, "body"], [5, "arrays"], [5, "cycles"],
            [3, "guardArray"], [3, "guideArray"], [3, "triad"],
            [1, "harvest"], [3, "responses", "burst"],
        ];
        for (const [star, policy, style = "assault"] of cases) {
            const rank = star ? 6 : 0;
            const battle = run({ star, rank }, style, policy, "horizon");
            // Draft setup and command selection are automated. Every commit still uses
            // the rendered native confirmation button and the real manager/rules.
            await p.evaluate(({ star, rank, style }) => {
                const panel = window.__manualTestPreview.panel;
                Object.assign(panel.session.draft, { star, rank, style,
                    player: { hp: 1000000, mp: 300, attack: 100, defense: 40 },
                    enemy: { hp: 1000000, mp: 300, attack: 100, defense: 20 } });
                panel.render();
            }, { star, rank, style });
            await click(p, "restart");
            for (const [i, t] of battle.trace.entries()) {
                await p.evaluate(a => {
                    const panel = window.__manualTestPreview.panel;
                    panel.selected = a; panel.revision = panel.session.state.revision; panel.render();
                }, t.action);
                await click(p, "confirm");
                const actual = await p.evaluate(() => {
                    const s = window.__manualTestPreview.session.state;
                    return { damage: s.totals.damage, hp: s.player.hp, mp: s.player.mp,
                        body: s.body.map(x => x.kind), energy: s.energy,
                        sky: s.sky.map(g => ({ id: g.id, kinds: g.members.map(x => x.kind),
                            ages: g.members.map(x => x.age) })),
                        orbit: s.orbit, finisherUsed: s.finisherUsed };
                });
                assert.deepEqual(actual, { damage: t.damage, hp: t.hp, mp: t.mp,
                    body: t.body, energy: t.energy, sky: t.sky, orbit: t.orbit, finisherUsed: t.finisherUsed },
                    `${star}/${rank} ${policy} step ${i}`);
                if (t.round === 4 && t.ap === 1 || i === battle.trace.length - 1 ||
                    ["finish", "release"].includes(t.action.branch)) {
                    const suffix = style === "assault" ? "" : "-" + style;
                    const file = path.join(output, `${star}-${rank}-${policy}${suffix}-r${t.round}.png`);
                    await p.screenshot({ path: file });
                    const stats = await sharp(file).stats();
                    assert.ok(stats.channels.some(x => x.stdev > 10), "nonblank native view");
                }
            }
            results.push({ star, rank, policy, style, steps: battle.trace.length, damage: battle.damage });
            console.log(`Replayed ${star}/${rank} ${policy} ${style}: ${battle.trace.length} actions / ${battle.damage} damage`);
        }
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(output, "replay-results.json"), JSON.stringify(results, null, 2));
    } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
