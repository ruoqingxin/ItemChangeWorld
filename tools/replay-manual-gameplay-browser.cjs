const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { run } = require("./evaluate-manual-gameplay.cjs");
const { url, ready, state, click, capture, browserOutput } = require("./manual-run-browser-helpers.cjs");
async function main() {
    const browser = await chromium.launch({ headless: true, channel: "chromium" }), results = [];
    try {
        for (const [name, viewport] of [["desktop", { width: 1280, height: 720 }],
            ["wide", { width: 1920, height: 1080 }], ["mobile", { width: 844, height: 390 }]]) {
            const p = await browser.newPage({ viewport }), errors = [];
            p.on("pageerror", e => errors.push(e.message));
            p.on("response", r => { if (r.status() >= 400) errors.push(r.url()); });
            await p.goto(url + "/?manualTest=1&manualLegacy=1"); await ready(p);
            for (const [star, route] of [[0, "edge"], [3, "guide"], [5, "guard"]]) {
                const r = run({ star, rank: star ? 6 : 0 }, route, { trace: true });
                await p.evaluate(setup => {
                    const panel = window.__manualTestPreview.panel;
                    Object.assign(panel.session.draft, setup); panel.render();
                }, r.setup);
                await click(p, "restart");
                for (const [i, step] of r.trace.entries()) {
                    // Only command selection is injected. Every transaction is a real native click.
                    await p.evaluate(a => {
                        const panel = window.__manualTestPreview.panel;
                        panel.selected = a; panel.revision = panel.session.state.revision; panel.render();
                    }, step.action);
                    await click(p, "confirm");
                    const actual = await state(p), expected = step.state;
                    // Restart revision remains monotonic across scenarios; all gameplay state must match.
                    delete actual.revision;
                    const copy = JSON.parse(JSON.stringify(expected)); delete copy.revision;
                    assert.deepEqual(actual, copy, `${name}/${star}/${route}/step${i}`);
                    if (expected.phase === "reward" && [1, 3, 6].includes(expected.battle) ||
                        i === r.trace.length - 1) await capture(p, `${name}-replay-${star}-${route}-${expected.battle}-${expected.phase}`);
                }
                assert.equal(r.phase, "complete"); assert.equal(r.won, 12);
                results.push({ viewport: name, star, route, confirmations: r.trace.length, fights: r.won });
            }
            assert.deepEqual(errors, []); await p.close();
        }
        fs.mkdirSync(browserOutput, { recursive: true });
        fs.writeFileSync(path.join(browserOutput, "replay-results.json"), JSON.stringify(results, null, 2));
        console.log(JSON.stringify({ series: results.length, fights: results.reduce((n, r) => n + r.fights, 0),
            confirmations: results.reduce((n, r) => n + r.confirmations, 0) }));
    } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
