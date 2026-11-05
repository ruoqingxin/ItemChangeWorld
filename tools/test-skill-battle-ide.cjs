const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");

async function main() {
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = [], failed = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("response", response => { if (response.status() >= 400) failed.push(new URL(response.url()).pathname); });
        await page.goto(process.env.SKILL_BATTLE_IDE_URL || "http://127.0.0.1:18092");
        await page.waitForFunction(() => {
            const find = node => {
                if (node.presenter && node.expedition && node.buttons) return node;
                for (let i = 0; i < node.numChildren; i++) {
                    const result = find(node.getChildAt(i));
                    if (result) return result;
                }
            };
            window.__acceptancePanel = window.Laya?.stage && find(Laya.stage);
            return !!window.__acceptancePanel?.resultTitle.text;
        });
        const read = () => page.evaluate(() => ({
            save: window.__acceptancePanel.expedition.snapshot,
            state: window.__acceptancePanel.presenter.display,
            busy: window.__acceptancePanel.presenter.busy,
            title: window.__acceptancePanel.resultTitle.text,
        }));
        const click = async key => {
            await page.waitForTimeout(270);
            const pos = await page.evaluate(key => {
                const b = window.__acceptancePanel.buttons[key];
                if (!b?.visible || !b.mouseEnabled) throw new Error(`Unavailable: ${key}`);
                const p = b.localToGlobal(new Laya.Point(b.width / 2, b.height / 2));
                const rect = document.querySelector("canvas").getBoundingClientRect();
                return { x: rect.x + p.x * rect.width / Laya.stage.width,
                    y: rect.y + p.y * rect.height / Laya.stage.height };
            }, key);
            await page.mouse.click(pos.x, pos.y);
        };
        const act = async id => {
            await click(`skill${id}`); await click("confirm"); await click("skip");
            await page.waitForFunction(() => !window.__acceptancePanel.presenter.busy);
        };
        assert.equal((await read()).title, "散修据点");
        await click("newRun");
        await click("skill1"); await click("pouch0"); await click("confirm"); await click("skip");
        await act(1); await act(1);
        let r = await read();
        assert.equal(r.save.run.phase, "reward");
        assert.equal(r.state.weaponDurability, 45);
        assert.equal(r.state.player.hp, 38);
        await page.screenshot({ path: path.join(__dirname, "../bin/skill-battle-browser/D-ide-upgrade.png") });
        await click("upgrade0");
        await click("continue");
        r = await read();
        assert.equal(r.save.run.encounterIndex, 1);
        assert.equal(r.state.player.hp, 38);
        assert.equal(r.state.weaponDurability, 45);
        assert.equal(r.state.pouchSlots[0], null);
        assert.equal(r.state.pouchSlots.filter(Boolean).length, 2);
        await page.screenshot({ path: path.join(__dirname, "../bin/skill-battle-browser/D-ide-carry.png") });
        const committed = r.save;
        await page.reload();
        await page.waitForFunction(() => {
            const find = node => {
                if (node.presenter && node.expedition && node.buttons) return node;
                for (let i = 0; i < node.numChildren; i++) {
                    const child = find(node.getChildAt(i)); if (child) return child;
                }
            };
            window.__acceptancePanel = window.Laya?.stage && find(Laya.stage);
            return !!window.__acceptancePanel?.presenter.display;
        });
        assert.deepEqual((await read()).save, committed);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(__dirname, "../bin/skill-battle-browser/D-ide-mobile.png") });
        assert.deepEqual(errors, []);
        const known = ["/ui/ui-deps.json", "/u3d/u3d-deps.json"];
        assert.ok(failed.every(name => known.includes(name)), JSON.stringify(failed));
        console.log("IDE: actual mouse supply use, upgrade choice, continuation, reload and mobile resize passed.");
        console.log(`Known existing resource failures: ${[...new Set(failed)].join(", ") || "none"}`);
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
