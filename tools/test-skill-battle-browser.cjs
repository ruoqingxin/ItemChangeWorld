// Requires playwright (Chromium channel) and sharp through NODE_PATH.
const { chromium } = require("playwright");
const sharp = require("sharp");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const output = path.join(__dirname, "../bin/skill-battle-browser");
fs.mkdirSync(output, { recursive: true });
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18094";

async function main() {
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    let checks = 0;
    try {
        for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
            const page = await browser.newPage({ viewport });
            const errors = [];
            const failedResources = [];
            page.on("pageerror", error => errors.push(error.message));
            page.on("response", response => {
                if (response.status() >= 400) failedResources.push(response.url());
            });
            await page.goto(url);
            await page.waitForFunction(() => !!window.__skillBattlePreview);
            const read = () => page.evaluate(() => ({
                state: window.__skillBattlePreview.manager.state,
                display: window.__skillBattlePreview.panel.presenter.display,
                busy: window.__skillBattlePreview.panel.presenter.busy,
                message: window.__skillBattlePreview.panel.presenter.message,
                result: window.__skillBattlePreview.panel.result.visible,
            }));
            const click = async (x, y, count = 1) => {
                const scale = Math.min(viewport.width / 720, viewport.height / 1280);
                await page.mouse.click((viewport.width - 720 * scale) / 2 + x * scale,
                    (viewport.height - 1280 * scale) / 2 + y * scale, { clickCount: count });
            };
            const select = id => click(106 + (id - 1) * 169, 982);
            const skip = () => click(598, 898);
            const confirm = () => click(458, 1220);
            const action = async (id, skipAnimation = true) => {
                await select(id); await confirm();
                if (skipAnimation) await skip();
                await page.waitForFunction(() => !window.__skillBattlePreview.panel.presenter.busy);
            };
            const initial = (await read()).state;
            await select(3);
            assert.match((await read()).message, /剑势/);
            await confirm();
            assert.deepEqual((await read()).state, initial);
            await select(1); await click(120, 1220);
            assert.deepEqual((await read()).state, initial);
            checks += 2;
            await select(1);
            await page.screenshot({ path: path.join(output, `preview-${viewport.width}.png`) });
            await confirm();
            const committed = (await read()).state;
            await confirm(); await select(2);
            assert.deepEqual((await read()).state, committed);
            assert.equal((await read()).busy, true);
            const startY = await page.evaluate(() => window.__skillBattlePreview.panel.player.y);
            await page.waitForTimeout(65);
            const movedY = await page.evaluate(() => window.__skillBattlePreview.panel.player.y);
            assert.notEqual(startY, movedY, "Attack lunge must actually animate");
            await skip();
            assert.deepEqual((await read()).display, committed);
            checks += 3;
            await action(1, false);
            await action(3);
            let state = await read();
            assert.equal(state.state.phase, "victory");
            assert.equal(state.state.player.hp, 38);
            assert.equal(state.result, true);
            await page.screenshot({ path: path.join(output, `victory-${viewport.width}.png`) });
            checks++;
            await click(584, 805); // Guard encounter from the result surface.
            for (let i = 0; i < 7; i++) await action(1);
            state = await read();
            assert.equal(state.state.phase, "defeat");
            assert.equal(state.result, true);
            await page.screenshot({ path: path.join(output, `defeat-${viewport.width}.png`) });
            checks++;
            await click(360, 694); // Replay.
            assert.equal((await read()).state.player.hp, 50);
            await click(360, 108); // Rabbit.
            await page.screenshot({ path: path.join(output, `rabbit-${viewport.width}.png`) });
            await action(2);
            await action(1);
            await select(4); await confirm();
            const interrupted = (await read()).state;
            assert.equal(interrupted.player.hp, 50);
            assert.equal(interrupted.enemyIntentIndex, 3);
            await page.evaluate(() => window.__skillBattlePreview.close());
            await page.waitForTimeout(700);
            await page.evaluate(() => window.__skillBattlePreview.reopen());
            assert.deepEqual((await read()).state, interrupted);
            assert.deepEqual((await read()).display, interrupted);
            assert.equal((await read()).busy, false);
            checks += 2;
            await click(584, 108);
            await action(2);
            await action(1, false); // Enemy stone armor.
            assert.equal((await read()).display.enemy.block, 6);
            await select(1);
            const preview = await page.evaluate(() => window.__skillBattlePreview.panel.presenter.selection.preview);
            assert.equal(preview.blockAbsorbed, 6);
            assert.equal(preview.enemyHpLoss, 0);
            checks++;
            const screenshot = path.join(output, `guardian-${viewport.width}.png`);
            await page.screenshot({ path: screenshot });
            const { data } = await sharp(screenshot).raw().toBuffer({ resolveWithObject: true });
            assert.ok(new Set(data).size > 70, "Rendered canvas must contain nonblank scene and text");
            assert.deepEqual(errors, []);
            assert.deepEqual(failedResources, []);
            checks += 2;
            await page.close();
        }
        console.log(`${checks} browser checks passed across desktop and two mobile viewports.`);
        console.log(`Screenshots: ${output}`);
    } finally {
        await browser.close();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
