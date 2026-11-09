const { chromium } = require("playwright");
const sharp = require("sharp");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const output = path.join(__dirname, "../bin/skill-map-browser");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18094";

async function main() {
    fs.mkdirSync(output, { recursive: true });
    let browser;
    try {
        browser = await chromium.launch({ headless: true, channel: "chromium" });
    } catch (error) {
        if (process.platform !== "win32") throw error;
        browser = await chromium.launch({ headless: true, channel: "msedge" });
    }
    let checks = 0;
    try {
        for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 },
            { width: 844, height: 390 }, { width: 360, height: 640 }]) {
            const context = await browser.newContext({ viewport });
            const page = await context.newPage(), errors = [], failed = [];
            page.on("pageerror", error => errors.push(error.message));
            page.on("response", response => { if (response.status() >= 400) failed.push(response.url()); });
            await page.goto(url);
            await page.waitForFunction(() => !!window.__skillBattlePreview?.panel);

            const read = () => page.evaluate(() => {
                const preview = window.__skillBattlePreview, panel = preview.panel;
                return {
                    screen: panel.screen,
                    title: panel.labels?.resultTitle?.text || panel.labels?.mapTitle?.text || "",
                    selected: panel.selectedId || "",
                    state: preview.manager.state,
                    save: preview.expedition.snapshot,
                    map: preview.expedition.map,
                    notice: panel.notice || "",
                    labels: Object.fromEntries(Object.entries(panel.labels || {})
                        .map(([key, value]) => [key, value.text])),
                    visibleNodes: panel.nodeWidgets
                        ? [...panel.nodeWidgets].filter(([, node]) => node.visible).map(([id]) => id)
                        : [],
                };
            });
            const click = async key => {
                const overlay = await page.evaluate(key =>
                    !!window.__skillBattlePreview.panel.overlayButtons?.includes(key), key);
                if (overlay) await page.waitForTimeout(270);
                let available = false;
                for (let attempt = 0; attempt < 25 && !available; attempt++) {
                    available = await page.evaluate(key => {
                        const panel = window.__skillBattlePreview.panel;
                        const node = panel?.buttons?.[key] || panel?.nodeWidgets?.get(key);
                        return !!node && node.visible && node.mouseEnabled;
                    }, key);
                    if (!available) await page.waitForTimeout(100);
                }
                assert.ok(available, `Unavailable map control: ${key} ${JSON.stringify(await page.evaluate(key => {
                    const panel = window.__skillBattlePreview.panel;
                    const node = panel?.buttons?.[key] || panel?.nodeWidgets?.get(key);
                    return { panel: panel?.constructor?.name, screen: panel?.screen,
                        exists: !!node, visible: node?.visible, enabled: node?.mouseEnabled,
                        parentVisible: node?.parent?.visible };
                }, key))}`);
                const point = await page.evaluate(key => {
                    const panel = window.__skillBattlePreview.panel;
                    const node = panel.buttons?.[key] || panel.nodeWidgets?.get(key);
                    const value = node.localToGlobal(new Laya.Point(node.width / 2, node.height / 2));
                    const transform = Laya.stage._canvasTransform;
                    return {
                        x: transform.a * value.x + transform.c * value.y + transform.tx,
                        y: transform.b * value.x + transform.d * value.y + transform.ty,
                    };
                }, key);
                await page.mouse.click(point.x, point.y);
            };
            const screenshot = async name => {
                if ((await read()).screen === "map") {
                    const overflow = await page.evaluate(() => Object.values(
                        window.__skillBattlePreview.panel.labels || {}).filter(label =>
                        label.visible && label.text && (label.textWidth > label.width + 2 ||
                            label.textHeight > label.height + 3)).map(label => ({
                        name: label.name, text: label.text, width: label.width, height: label.height,
                        textWidth: label.textWidth, textHeight: label.textHeight,
                    })));
                    assert.deepEqual(overflow, [], `Map text overflow at ${name}`);
                }
                const file = path.join(output, `M-${name}-${viewport.width}.png`);
                await page.screenshot({ path: file });
                const { data } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
                assert.ok(new Set(data).size > 80, "Map screenshot must contain visible scene content");
                checks++;
            };
            const winBattle = async () => {
                for (let turn = 0; turn < 100; turn++) {
                    const state = (await read()).state;
                    if (state.phase !== "player_input") { assert.equal(state.phase, "victory"); return; }
                    const id = await page.evaluate(() => {
                        const { manager, expedition } = window.__skillBattlePreview;
                        const state = manager.state;
                        for (const id of [1, 3]) {
                            const preview = manager.previewAction({ type: "skill", skillId: id });
                            if (preview.ok && preview.state.phase === "victory") return id;
                        }
                        const intent = expedition.setup.enemy.intents[state.enemyIntentIndex];
                        return state.swordQi >= 2 ? 3 : intent.damage > 0 ? 2 : 1;
                    });
                    await click(`skill${id}`);
                    await click("confirm");
                    await click("skip");
                    await page.waitForFunction(() => !window.__skillBattlePreview.panel.presenter.busy);
                }
                throw new Error("Map battle did not terminate");
            };
            const finishBattle = async () => {
                await winBattle();
                assert.equal((await read()).save.run.phase, "reward");
                await click("upgrade0");
                assert.equal((await read()).save.run.phase, "decision");
                await click("continue");
                await page.waitForFunction(() => window.__skillBattlePreview.panel?.screen === "map");
                checks += 2;
            };

            await page.evaluate(() => {
                window.__originalRandom = Math.random;
                Math.random = () => 42 / 0x100000000;
            });
            await click("newRun");
            let current = await read();
            assert.equal(current.title, "起始借法");
            const startIndex = current.save.run.build.startCandidates.indexOf(1);
            assert.ok(startIndex >= 0);
            await click(`warehouse${startIndex}`);
            await page.evaluate(() => {
                const expedition = window.__skillBattlePreview.expedition;
                for (const id of [3, 2])
                    if (!expedition.build.activeSkills.some(skill => skill.skillId === id))
                        expedition.borrowActive(id);
                Math.random = window.__originalRandom;
            });
            await click("newRun");
            await page.waitForFunction(() => window.__skillBattlePreview.panel?.screen === "map");
            current = await read();
            assert.equal(current.map.currentNodeId, "start");
            assert.equal(current.visibleNodes.filter(id => id === "start" || id === "b1" ||
                id === "b2" || id === "borrow1" || id === "b3").length, 5);
            const initialRevealed = current.visibleNodes.length;
            checks += 3;
            await screenshot("initial");

            await click("b1");
            await page.waitForFunction(() => window.__skillBattlePreview.panel?.screen === "battle");
            assert.equal((await read()).save.run.map.battleCount, 1);
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.panel.buttons.skill4.visible), false);
            assert.equal(await page.evaluate(() =>
                window.__skillBattlePreview.manager.previewAction({ type: "skill", skillId: 4 }).ok), false);
            await screenshot("battle");
            checks += 2;

            await finishBattle();
            current = await read();
            assert.ok(current.map.resolvedIds.includes("b1"));
            assert.ok(current.visibleNodes.length >= initialRevealed);
            await screenshot("after-battle");
            checks += 2;

            if (viewport.width >= 1000) {
                await click("b2");
                await page.waitForFunction(() => window.__skillBattlePreview.panel?.screen === "battle");
                await finishBattle();
                await click("borrow1");
                await click("mapConfirm");
                current = await read();
                assert.equal(current.screen, "map");
                assert.ok(current.save.run.build.pendingActiveCandidateIds.length > 0);
                await screenshot("borrow-node");
                await click("mapBuildButton");
                await page.waitForFunction(() => window.__skillBattlePreview.panel?.screen === "start");
                await click("build");
                assert.equal((await read()).title, "借法构筑");
                await screenshot("borrow-build");
                await click("report");
                assert.equal((await read()).save.run.build.skillPoints, 2);
                await click("reportClose");
                await click("newRun");
                await page.waitForFunction(() => window.__skillBattlePreview.panel?.screen === "map");
                await click("b2");
                await click("mapConfirm");
                await click("b1");
                await click("mapConfirm");
                await click("extract-mid");
                await click("mapConfirm");
                assert.equal((await read()).labels.nodeTitle, "确认离开忆境");
                await screenshot("extract-confirm");
                await click("mapConfirm");
                await page.waitForFunction(() => window.__skillBattlePreview.panel?.screen === "settlement");
                current = await read();
                assert.equal(current.save.run.phase, "extracted");
                assert.equal(current.save.run.report.exitEncounter, 2);
                await screenshot("settled");
                checks += 7;
            }
            assert.deepEqual(errors, []);
            assert.deepEqual(failed, []);
            checks += 2;
            await context.close();
        }
        console.log(`${checks} map browser checks passed across desktop and mobile.`);
        console.log(`Screenshots: ${output}`);
    } finally {
        await browser.close();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
