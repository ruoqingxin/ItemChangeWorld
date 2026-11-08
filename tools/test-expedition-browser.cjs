// Uses the real Laya panel, Chromium and actual mouse input at every viewport.
const { chromium } = require("playwright");
const sharp = require("sharp");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const output = path.join(__dirname, "../bin/skill-battle-browser");
fs.mkdirSync(output, { recursive: true });
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18094";
const legacyUrl = `${url}${url.includes("?") ? "&" : "?"}legacy=1`;
const key = "nowchange.skill-expedition.new-rules.v4";

async function main() {
    let browser;
    try {
        browser = await chromium.launch({ headless: true, channel: "chromium" });
    } catch (error) {
        // Windows development machines can use the installed Edge when the
        // optional Playwright Chromium download is unavailable.
        if (process.platform !== "win32") throw error;
        browser = await chromium.launch({ headless: true, channel: "msedge" });
    }
    let checks = 0;
    try {
        for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
            const context = await browser.newContext({ viewport });
            const page = await context.newPage(), errors = [], failed = [];
            page.on("pageerror", error => errors.push(error.message));
            page.on("response", response => { if (response.status() >= 400) failed.push(response.url()); });
            const ready = () => page.waitForFunction(() => !!window.__skillBattlePreview);
            await page.goto(legacyUrl); await ready();
            const prefabBinding = await page.evaluate(() => {
                const { view, panel } = window.__skillBattlePreview;
                const required = ["result", "newRun", "reset", "warehouse0", "report", "resultTitle", "reportBody"];
                const excluded = ["enemy", "player", "numbers", "skill1", "pouch0", "enemyHpBar"];
                return {
                    rootMatchesView: panel.root === view.view,
                    missing: required.filter(name => !view.getElement(name, false)),
                    duplicatedPageNodes: excluded.filter(name => view.getElement(name, false)),
                    hasDynamicPanelChild: view.view.getChildIndex(panel) >= 0,
                };
            });
            assert.equal(prefabBinding.rootMatchesView, true, "Controller must bind the UIManager prefab root");
            assert.deepEqual(prefabBinding.missing, [], "All controls must exist in the authored prefab");
            assert.deepEqual(prefabBinding.duplicatedPageNodes, [], "Start View must omit battle-only nodes");
            assert.equal(prefabBinding.hasDynamicPanelChild, false, "No runtime panel may be attached to the prefab");
            const read = () => page.evaluate(() => {
                const { panel, manager, expedition } = window.__skillBattlePreview;
                return { state: manager.state, save: expedition.snapshot, busy: panel.presenter.busy,
                    display: panel.presenter.display, message: panel.presenter.message,
                    notice: panel.notice, title: panel.resultTitle.text, result: panel.result.visible,
                    visible: Object.entries(panel.buttons).filter(([, b]) => {
                        if (!b.mouseEnabled) return false;
                        for (let node = b; node; node = node.parent) if (!node.visible) return false;
                        return true;
                    }).map(([k]) => k),
                };
            });
            const click = async (key, count = 1) => {
                const overlay = await page.evaluate(key =>
                    window.__skillBattlePreview.panel.overlayButtons.includes(key), key);
                if (overlay) await page.waitForTimeout(270);
                await page.waitForFunction(key => {
                    const button = window.__skillBattlePreview.panel.buttons[key];
                    return !!button && button.visible && button.mouseEnabled;
                }, key, { timeout: 1500 });
                const pos = await page.evaluate(key => {
                    const p = window.__skillBattlePreview.panel, b = p.buttons[key];
                    if (!b || !b.visible || !b.mouseEnabled) throw new Error(`Unavailable control: ${key}`);
                    const point = b.localToGlobal(new Laya.Point(b.width / 2, b.height / 2));
                    const transform = Laya.stage._canvasTransform;
                    return {
                        x: transform.a * point.x + transform.c * point.y + transform.tx,
                        y: transform.b * point.x + transform.d * point.y + transform.ty,
                    };
                }, key);
                await page.mouse.click(pos.x, pos.y, { clickCount: count });
            };
            const screenshot = async name => {
                const overflow = await page.evaluate(() => {
                    const p = window.__skillBattlePreview.panel;
                    return Object.values(p.labels).filter(t => {
                        let inResult = false;
                        for (let node = t; node && node !== p; node = node.parent) {
                            if (!node.visible) return false;
                            if (node === p.result) inResult = true;
                        }
                        if (p.result.visible !== inResult || !t.text) return false;
                        return t.textWidth > t.width + 1 || t.textHeight > t.height + 2;
                    }).map(t => ({ name: t.name, text: t.text, width: t.width, height: t.height,
                        textWidth: t.textWidth, textHeight: t.textHeight }));
                });
                assert.deepEqual(overflow, [], `Text overflow at ${name}`);
                const file = path.join(output, `E-${name}-${viewport.width}.png`);
                await page.screenshot({ path: file });
                const { data } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
                assert.ok(new Set(data).size > 70, "Laya canvas must contain nonblank content");
                checks++;
            };
            const reload = async () => { await page.reload(); await ready(); };
            const act = async (id, slot, skip = true) => {
                await click(`skill${id}`);
                if (slot !== undefined) await click(`pouch${slot}`);
                await click("confirm");
                assert.equal((await read()).busy, true);
                if (skip) await click("skip");
                await page.waitForFunction(() => !window.__skillBattlePreview.panel.presenter.busy);
                checks++;
            };
            const win = async () => {
                for (let turn = 0; turn < 100; turn++) {
                    const r = await read();
                    if (r.state.phase !== "player_input") { assert.equal(r.state.phase, "victory"); return; }
                    const id = await page.evaluate(() => {
                        const { manager, expedition } = window.__skillBattlePreview, s = manager.state;
                        for (const id of [1, 3]) {
                            const p = manager.previewAction({ type: "skill", skillId: id });
                            if (p.ok && p.state.phase === "victory") return id;
                        }
                        const intent = expedition.setup.enemy.intents[s.enemyIntentIndex];
                        return s.swordQi >= 2 ? 3 : intent.damage ? 2 : 1;
                    });
                    await act(id);
                }
                throw new Error("Route did not terminate within 100 turns");
            };
            const choose = async (excludeCounter = false) => {
                const choices = (await read()).save.run.pendingUpgradeChoices;
                const id = excludeCounter ? choices.find(id => id !== 1) : choices.includes(5) ? 5 : choices[0];
                await click(`upgrade${choices.indexOf(id)}`, 2);
                assert.equal((await read()).save.run.phase, "decision");
                assert.equal((await read()).save.run.upgradeIds.length, (await read()).save.run.encounterIndex + 1);
                checks++;
            };
            const reset = async () => {
                await click("reset");
                assert.equal((await read()).title, "确认重置测试档");
                await click("resetYes");
                assert.equal((await read()).title, "散修据点");
                checks++;
            };
            const startNewRun = async (seed = 42) => {
                await page.evaluate(seed => {
                    window.__originalStageTwoRandom = Math.random;
                    Math.random = () => seed / 0x100000000;
                }, seed);
                await click("newRun");
                let current = await read();
                if (current.save.run.build.activeSkills.length === 0) {
                    const candidates = current.save.run.build.startCandidates;
                    const startIndex = candidates.indexOf(1);
                    assert.ok(startIndex >= 0, `Seed ${seed} must include the slash starter`);
                    await click(`warehouse${startIndex}`);
                    await page.evaluate(() => {
                        const expedition = window.__skillBattlePreview.expedition;
                        for (const id of [3, 2]) {
                            if (!expedition.build.activeSkills.some(skill => skill.skillId === id))
                                expedition.borrowActive(id);
                        }
                    });
                    await click("newRun");
                    await page.waitForFunction(() =>
                        !!window.__skillBattlePreview.panel?.presenter);
                    current = await read();
                }
                await page.evaluate(() => { Math.random = window.__originalStageTwoRandom; });
                assert.equal(current.save.run.build.activeSkills.length, 3);
                assert.equal(current.state.phase, "player_input");
                checks++;
            };
            assert.equal((await read()).title, "散修据点");
            assert.equal((await read()).state, null);
            assert.equal((await read()).save.profile.pouchSlots.filter(Boolean).length, 3);
            assert.ok(!(await read()).visible.some(key => key.startsWith("encounter")));
            checks += 3;
            await screenshot("hub");
            const initialProfile = (await read()).save.profile;
            await click("reset");
            const resetState = await read();
            assert.equal(resetState.title, "确认重置测试档");
            assert.ok(resetState.visible.includes("resetNo"), JSON.stringify(resetState.visible));
            await click("resetNo");
            assert.deepEqual((await read()).save.profile, initialProfile); checks++;
            await startNewRun();
            const initial = (await read()).state;
            await click("build");
            assert.equal((await read()).title, "借法构筑");
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.panel.canManageBuild()), false);
            await screenshot("build-readonly");
            await click("reportClose");
            assert.equal((await read()).state.phase, "player_input");
            await click("skill3");
            assert.match((await read()).message, /剑势/);
            assert.ok(!(await read()).visible.includes("confirm")); checks++;
            await click("skill1");
            assert.deepEqual((await read()).state, initial);
            await click("pouch0");
            assert.deepEqual((await read()).state, initial);
            await screenshot("fire-preview");
            assert.deepEqual((await read()).state, initial);
            await click("cancel");
            assert.deepEqual((await read()).state, initial); checks += 2;
            await click("pouch2");
            assert.match((await read()).message, /满/);
            assert.deepEqual((await read()).state, initial); checks++;
            await click("skill1"); await click("pouch0"); await click("confirm", 2);
            const committed = (await read()).state;
            assert.equal(committed.revision, 1);
            assert.equal(committed.weaponDurability, 44);
            assert.equal(committed.pouchSlots[0], null);
            let moving = false;
            for (let frame = 0; frame < 10; frame++) {
                await page.waitForTimeout(40);
                moving ||= await page.evaluate(() => window.__skillBattlePreview.panel.player.y !== 608);
            }
            assert.ok(moving, "The actual Laya attack must animate");
            checks += 4;
            await reload();
            assert.deepEqual((await read()).state, committed);
            assert.deepEqual((await read()).display, committed);
            assert.equal((await read()).busy, false); checks += 3;
            const lootControl = await page.evaluate(() => {
                const panel = window.__skillBattlePreview.panel;
                const button = panel.buttons.loot;
                return { visible: button?.visible, enabled: button?.mouseEnabled,
                    result: panel.result?.visible, title: panel.resultTitle?.text,
                    screen: panel.screen, overlay: panel.overlayButtons };
            });
            assert.equal(lootControl.visible && lootControl.enabled, true, JSON.stringify(lootControl));
            await click("loot");
            assert.equal((await read()).title, "本局战利品");
            assert.ok(!(await read()).visible.includes("extract"));
            await screenshot("empty-loot");
            await click("lootClose");
            await act(1, 1, false);
            const earth = (await read()).state;
            assert.equal(earth.weaponDurability, 38);
            assert.equal(earth.pouchSlots[1], null); checks += 2;
            await win();
            let r = await read();
            assert.equal(r.save.run.phase, "reward");
            assert.equal(r.save.run.loot.length, 1);
            assert.equal(r.save.profile.currency, 0);
            assert.equal(r.save.profile.warehouse.length, 0);
            assert.ok(!r.visible.includes("extract") && !r.visible.includes("continue"));
            checks += 5;
            await screenshot("upgrade");
            await page.evaluate(() => {
                const expedition = window.__skillBattlePreview.expedition;
                expedition.activeCandidates();
                expedition.awardDaoyun(30);
            });
            await click("build");
            assert.equal((await read()).title, "借法构筑");
            const buildControl = await page.evaluate(() => {
                const panel = window.__skillBattlePreview.panel;
                return { reportVisible: panel.buttons.report?.visible,
                    reportEnabled: panel.buttons.report?.mouseEnabled,
                    candidates: panel.expedition.build.pendingActiveCandidateIds,
                    phase: panel.expedition.run.phase };
            });
            assert.equal(buildControl.reportVisible && buildControl.reportEnabled, true,
                JSON.stringify(buildControl));
            await click("report");
            assert.equal((await read()).save.run.build.skillPoints, 2);
            await click("reportClose");
            await click("build");
            await click("upgrade0");
            assert.equal((await read()).save.run.build.passiveIds.length, 1);
            const beforeStrengthen = (await read()).save.run.build.activeSkills[0];
            await click("upgrade0");
            assert.equal((await read()).save.run.build.activeSkills[0].level, beforeStrengthen.level + 1);
            checks += 5;
            await screenshot("build");
            await click("reportClose");
            const choices = r.save.run.pendingUpgradeChoices;
            await reload();
            assert.deepEqual((await read()).save.run.pendingUpgradeChoices, choices); checks++;
            await choose();
            const decision = (await read()).save;
            await screenshot("decision");
            await reload();
            assert.deepEqual((await read()).save, decision); checks++;
            await click("extract", 2);
            await page.waitForFunction(() => window.__skillBattlePreview.panel?.screen === "start");
            r = await read();
            assert.equal(r.save.run.phase, "extracted");
            assert.equal(r.save.profile.warehouse.length, 1);
            assert.equal(r.save.profile.weaponDurability, 38);
            assert.equal(r.save.profile.pouchSlots.filter(Boolean).length, 1);
            assert.deepEqual(r.save.run.upgradeIds, []); checks += 5;
            await screenshot("warehouse");
            await click("warehouse0", 2);
            assert.equal((await read()).save.profile.currency, 15);
            assert.equal((await read()).save.profile.warehouse.length, 0); checks += 2;
            await reload();
            assert.equal((await read()).save.profile.currency, 15);
            await startNewRun();
            assert.equal((await read()).state.weaponDurability, 38);
            assert.equal((await read()).state.pouchSlots.filter(Boolean).length, 1);
            assert.equal((await read()).state.player.hp, 50); checks += 4;
            await win(); await choose(true); await click("continue");
            assert.equal((await read()).state.encounterId, 2);
            assert.ok(!(await read()).visible.includes("extract")); checks += 2;
            // Complete an action, then close the UI before the animation finishes.
            await click("skill1"); await click("confirm");
            const interrupted = (await read()).state;
            await page.evaluate(() => window.__skillBattlePreview.close());
            await page.waitForTimeout(400);
            await page.evaluate(() => window.__skillBattlePreview.reopen());
            assert.deepEqual((await read()).state, interrupted);
            assert.deepEqual((await read()).display, interrupted); checks += 2;
            // Remaining medicine can be consumed at most once and advances the enemy.
            await click("pouch2"); await click("confirm"); await click("skip");
            assert.equal((await read()).state.pouchSlots[2], null); checks++;
            for (let turn = 0; turn < 100 && (await read()).state.phase === "player_input"; turn++) await act(2);
            r = await read();
            assert.equal(r.state.phase, "defeat");
            assert.equal(r.save.run.phase, "failed");
            assert.equal(r.save.run.loot.length, 0);
            assert.equal(r.save.profile.warehouse.length, 0);
            assert.equal(r.save.profile.currency, 15);
            assert.equal(r.save.profile.weaponDurability, 0);
            assert.equal(r.save.profile.pouchSlots.filter(Boolean).length, 0);
            checks += 7;
            await screenshot("failed");
            await reload();
            assert.equal((await read()).save.run.phase, "failed");
            assert.equal((await read()).save.profile.currency, 15); checks += 2;
            await reset();
            await startNewRun();
            await win(); await choose(); await click("continue");
            await win(); await choose(); await click("continue");
            await screenshot("third-battle");
            await win();
            r = await read();
            assert.equal(r.save.run.phase, "extracted");
            assert.deepEqual(r.save.profile.warehouse.map(row => row.itemId), [2701, 2702, 2703, 2704]);
            assert.equal(new Set(r.save.profile.warehouse.map(row => row.itemUid)).size, 4);
            assert.equal(r.save.run.pendingUpgradeChoices.length, 0);
            assert.equal(r.save.profile.settledRunIds.length, 1);
            checks += 5;
            await screenshot("complete");
            await reload(); // Final settlement must not be replayed by page startup.
            assert.equal((await read()).save.profile.warehouse.length, 4); checks++;
            await screenshot("full-warehouse");
            for (let i = 0; i < 3; i++) await click("warehouse0");
            assert.equal((await read()).save.profile.currency, 80);
            assert.equal((await read()).save.profile.warehouse.length, 1);
            assert.deepEqual((await read()).save.profile.collectionIds, []);
            assert.ok((await read()).visible.includes("warehouse0")); checks += 4;
            await screenshot("scroll-ready");
            const beforeCollection = (await read()).save;
            await page.evaluate(() => {
                window.__originalSetItem = Storage.prototype.setItem;
                Storage.prototype.setItem = () => { throw new Error("quota exceeded"); };
            });
            await click("warehouse0");
            assert.deepEqual((await read()).save, beforeCollection);
            assert.match((await read()).notice, /quota exceeded/); checks += 2;
            await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; });
            await click("warehouse0", 2);
            assert.deepEqual((await read()).save.profile.collectionIds, [1]);
            assert.equal((await read()).save.profile.warehouse.length, 0);
            assert.deepEqual((await read()).save.run.report.collectionUnlockIds, [1]);
            assert.deepEqual((await read()).save.run.allowedUpgradeIds, [1, 2, 5, 6]);
            checks += 4;
            await screenshot("collection-unlocked");
            await click("report");
            assert.equal((await read()).title, "战斗记录");
            await screenshot("statistics");
            for (let i = 0; i < 8 && (await read()).visible.includes("nextPage"); i++) {
                await click("nextPage"); await screenshot(`statistics-page-${i + 2}`);
            }
            await click("actions"); await screenshot("action-log");
            await click("nextPage"); await screenshot("action-log-page-2");
            await click("reportClose");
            await reload();
            assert.equal((await read()).save.profile.currency, 80); checks++;
            assert.deepEqual((await read()).save.profile.collectionIds, [1]); checks++;
            // Set only the next run's RNG seed; all progression remains actual mouse input.
            await startNewRun(11);
            assert.equal((await read()).save.run.seed, 11);
            assert.equal((await read()).save.history.length, 1);
            await win();
            const unlockedRun = (await read()).save.run;
            const unlockedChoices = unlockedRun.pendingUpgradeChoices;
            assert.ok(unlockedRun.allowedUpgradeIds.includes(3) && unlockedRun.allowedUpgradeIds.includes(4));
            assert.ok(unlockedChoices.every(id => unlockedRun.allowedUpgradeIds.includes(id)));
            assert.equal(new Set(unlockedChoices).size, unlockedChoices.length); checks += 3;
            await screenshot("unlocked-choices");
            await reload();
            assert.deepEqual((await read()).save.run.pendingUpgradeChoices, unlockedChoices); checks++;
            await click("upgrade0");
            await click("continue"); await act(2);
            assert.equal((await read()).state.swordQi, 1); checks++;
            const beforeResumedAction = (await read()).state.revision;
            await click("skill1");
            assert.ok((await read()).visible.includes("confirm"));
            await screenshot("resumed-battle");
            await click("confirm"); await click("skip");
            assert.equal((await read()).state.revision, beforeResumedAction + 1); checks++;
            // A storage exception must leave the action and inventory untouched.
            const beforeFailure = await read();
            await page.evaluate(() => {
                window.__originalSetItem = Storage.prototype.setItem;
                Storage.prototype.setItem = () => { throw new Error("quota exceeded"); };
            });
            await click("skill1"); await click("confirm");
            assert.deepEqual((await read()).state, beforeFailure.state);
            assert.deepEqual((await read()).save, beforeFailure.save);
            assert.match((await read()).message, /存档未成功/); checks += 3;
            await screenshot("save-error");
            await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; });
            await reload();
            assert.deepEqual((await read()).state, beforeFailure.state); checks++;
            // Malformed storage must not be silently replaced by new starter resources.
            await page.evaluate(key => localStorage.setItem(key, "{broken"), key);
            await reload();
            assert.equal((await read()).title, "存档无法载入");
            assert.equal(await page.evaluate(key => localStorage.getItem(key), key), "{broken");
            checks += 2;
            await screenshot("corrupt-save");
            await reset();
            assert.deepEqual(errors, []);
            assert.deepEqual(failed, []);
            checks += 2;
            await context.close();
        }
        console.log(`${checks} browser checks passed across desktop and two mobile viewports.`);
        console.log(`Screenshots: ${output}`);
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
