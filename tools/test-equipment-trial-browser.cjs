const {chromium} = require("playwright"), sharp = require("sharp"), assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path");
const {load, root} = require("./config-fixture.cjs");
const {QingmingRules: R} = load("module/skillBattle/utils/QingmingRules.js");
const {choose} = require("./evaluate-equipment-trial.cjs");
const out = path.join(root, "bin/equipment-trial/single-action/browser");
const url = process.env.MANUAL_TEST_URL || "http://127.0.0.1:18126/?manualTest=1";
const state = p => p.evaluate(() => window.__manualTestPreview.session.state);
async function click(p, key, popup = false) {
    const point = await p.evaluate(({key, popup}) => {
        const panel = window.__manualTestPreview.panel;
        const n = popup ? panel.popup.getElement(key) : panel.buttons[key];
        if (!n?.visible || !n.mouseEnabled) throw Error(`控件不可用 ${key}`);
        const a = n.localToGlobal(new Laya.Point(n.width / 2, n.height / 2));
        const r = document.querySelector("canvas").getBoundingClientRect();
        return {x: r.left + a.x * r.width / Laya.stage.width, y: r.top + a.y * r.height / Laya.stage.height};
    }, {key, popup});
    if (p.touchMode) await p.touchscreen.tap(point.x, point.y);
    else await p.mouse.click(point.x, point.y);
    await p.waitForTimeout(50);
}
async function menu(p, key, index) {
    await click(p, key);
    await p.waitForFunction(() => window.__manualTestPreview.panel.popup?.isOpened);
    await click(p, `btn_option${index}`, true);
    await p.waitForFunction(() => !window.__manualTestPreview.panel.popup);
}
async function equipment(p, slot, base) {
    await menu(p, "weapon", ["weapon", "armor", "accessory"].indexOf(slot));
    await menu(p, "weapon", base ? base + 3 : 3);
}
async function act(p, action) {
    const before = await state(p), expected = R.resolve(before, action);
    assert.ok(expected.ok, expected.reason);
    const key = action.move === "guide" ? `intent_${action.enemyAction || 1}` :
        action.move === "choose" ? `reward_${before.offers.indexOf(action.choice)}` :
        ({next: "nextBattle", heal: "heal", mana: "mana", end: "endTurn"})[action.move] || `move_${action.move}`;
    await click(p, key); assert.deepEqual(await state(p), before, "预览不改状态");
    await click(p, "confirm"); assert.deepEqual(await state(p), expected.state, "原生提交与规则核一致");
}
async function shot(p, name) {
    const buffer = await p.screenshot({path: path.join(out, name + ".png")});
    const stats = await sharp(buffer).stats();
    assert.ok(stats.channels.slice(0, 3).some(c => c.stdev > 12), "画布非空");
    const issues = await p.evaluate(() => {
        const panel = window.__manualTestPreview.panel, issues = [];
        for (const [key, n] of Object.entries(panel.labels)) {
            let visible = n.visible; for (let parent = n.parent; parent; parent = parent.parent) visible &&= parent.visible;
            if (!visible || !n.text) continue;
            n.textIns.typeset(true);
            if (n.textIns.textWidth > n.width + 3 || n.textIns.textHeight > n.height + 3)
                issues.push({key, text: n.text, size: [n.width, n.height], actual: [n.textIns.textWidth, n.textIns.textHeight]});
        }
        return issues;
    });
    assert.deepEqual(issues, [], "文字完整显示");
}
(async () => {
    await fs.mkdir(out, {recursive: true});
    const browser = await chromium.launch({headless: true, channel: "chromium"}), results = [];
    try {
        for (const [name, width, height, touch] of [["desktop", 1280, 720, false], ["wide", 1560, 720, false], ["mobile", 844, 390, true]]) {
            const context = await browser.newContext({viewport: {width, height}, hasTouch: touch, isMobile: touch});
            const p = await context.newPage(), errors = []; p.touchMode = touch;
            p.on("pageerror", e => errors.push(e.message));
            await p.addInitScript(() => localStorage.setItem("other-app", "keep"));
            await p.goto(url);
            await p.waitForFunction(() => window.__manualTestPreview?.panel?.opened);
            await shot(p, name + "-settings");
            await click(p, "weapon");
            await p.waitForFunction(() => window.__manualTestPreview.panel.popup?.isOpened);
            await shot(p, name + "-picker");
            await click(p, "btn_option4", true);
            await menu(p, "quality", 5); await menu(p, "weaponPassive", 4);
            await click(p, "restart");
            let s = await state(p);
            assert.equal(s.setup.singleAction,true);assert.equal(s.ap,1);assert.equal(s.intentions.length,1);
            assert.equal(s.weapon.roll.quality, 6); assert.equal(s.weapon.roll.passive, "echo");
            await act(p, {move: "basic"}); await act(p, {move: "basic"});
            assert.equal((await state(p)).totals.events.weaponProc, 1);
            await click(p, "tab_build"); await shot(p, name + "-equipment");
            for (const slot of ["weapon","armor","accessory"]) {
                for (let base = 1; base <= (slot === "weapon" ? 12 : 6); base++) {
                    await equipment(p, slot, base); await click(p, "restart");
                    s = await state(p); assert.equal(s[slot].roll.base, base);
                    const expected = R.start(s.setup); expected.revision = s.revision;
                    assert.deepEqual(s, expected);
                }
                for (let quality = 1; quality <= 6; quality++) {
                    await menu(p, "quality", quality-1); await click(p, "restart");
                    assert.equal((await state(p))[slot].roll.quality, quality);
                }
                await menu(p, "weaponPassive", slot === "weapon" ? 3 : slot === "armor" ? 3 : 2);
                await click(p, "restart");
                assert.equal((await state(p))[slot].roll.passive, slot === "weapon" ? "mana" : slot === "armor" ? "reflect" : "frugal");
                await click(p, "tab_build"); await shot(p, name + "-" + slot);
                await equipment(p, slot, 0); await click(p, "restart");
                assert.equal((await state(p))[slot], undefined);
            }
            await equipment(p,"armor",2);await menu(p,"quality",5);await menu(p,"weaponPassive",7);
            await click(p,"enemyPick");await p.waitForFunction(()=>window.__manualTestPreview.panel.popup?.isOpened);
            await click(p,"btn_enemy11",true);await click(p,"restart");
            assert.equal((await state(p)).foe.id,"breaker");
            await act(p,{move:"end"});
            assert.equal((await state(p)).totals.events.enemyShatter||0,0,"受击后新盾不被同次震盾削减");
            await shot(p,name+"-ward");
            await click(p,"enemyPick");await p.waitForFunction(()=>window.__manualTestPreview.panel.popup?.isOpened);
            await click(p,"btn_enemy0",true);await click(p,"battles_12");
            await menu(p, "preset", 0); await click(p, "restart");
            assert.equal((await state(p)).setup.player.attack, 100);
            await menu(p, "preset", 3);
            for (const [slot,base] of [["weapon",1],["armor",2],["accessory",1]]) {
                await equipment(p,slot,base);await menu(p,"quality",2);await menu(p,"weaponPassive",0);
            }
            await click(p, "restart");await click(p,"tab_pool");await shot(p,name+"-skills");
            const draftBefore = await p.evaluate(()=>window.__manualTestPreview.session.draft);
            await equipment(p,"armor",3);
            assert.deepEqual((await state(p)).setup,draftBefore,"修改草稿不改当前战斗");
            await equipment(p,"armor",2);
            let confirmations = 3;
            for (let i = 0; i < 400; i++) {
                s = await state(p);
                if (!["fighting", "reward", "between"].includes(s.phase)) break;
                let action;
                if (s.phase === "reward") action = {move: "choose", choice: s.offers[0]};
                else if (!s.potionUsed && s.potions.heal && s.player.hp <= s.player.maxHp * .65) action = {move: "heal"};
                else if (!s.potionUsed && s.potions.mana && s.player.mp <= s.player.maxMp * .5) action = {move: "mana"};
                else if (s.phase === "between") action = {move: "next"};
                else action = choose(s, "balanced");
                await act(p, action); confirmations++;
            }
            s = await state(p);
            assert.ok(["complete", "defeat"].includes(s.phase));
            await click(p, "tab_report"); await shot(p, name + "-result");
            assert.equal(await p.evaluate(() => localStorage.getItem("other-app")), "keep");
            assert.deepEqual(errors, []);
            results.push({name, phase: s.phase, battles: s.reports.length, confirmations, hp: s.player.hp, mp: s.player.mp,
                initial:s.setup.player,enemy:s.setup.enemy,durability:[s.weapon.durability,s.armor.durability,s.accessory.durability]});
            console.log(JSON.stringify(results.at(-1))); await context.close();
        }
        await fs.writeFile(path.join(out, "results.json"), JSON.stringify(results, null, 2));
    } finally { await browser.close(); }
})().catch(e => {console.error(e); process.exitCode = 1;});
