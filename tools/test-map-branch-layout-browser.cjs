const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const sharp = require("sharp");
const root = path.resolve(__dirname, ".."), build = path.join(root, "bin/skill-battle-tests/script");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18138";
const output = path.join(root, "bin/map-branch-layout-browser");
global.Laya = { Resource: class {}, Byte: class {
    constructor(buffer) { this.bytes = Buffer.from(buffer); this.pos = 0; }
    readUTFBytes(length) {
        const value = this.bytes.toString("utf8", this.pos, this.pos+length);
        this.pos += length; return value;
    }
} };
const ByteBuf = require(path.join(build, "config/bright/serialization/ByteBuf.js")).default;
const { Tables } = require(path.join(build, "config/schema.js"));
const { NewExpeditionConfigUtils: Config } = require(path.join(build, "module/skillBattle/newRules/NewExpeditionConfigUtils.js"));
const { NewBuildConfigUtils: Build } = require(path.join(build, "module/skillBattle/newRules/NewBuildConfigUtils.js"));
const { NewExpeditionRules: Rules } = require(path.join(build, "module/skillBattle/newRules/NewExpeditionRules.js"));
const bytes = fs.readFileSync(path.join(root, "assets/config/configbin.bin")), blocks = {};
let at = 4;
for (let i = 0; i < bytes.readInt32LE(0); i++) {
    const length = bytes.readInt32LE(at); at += 4;
    const key = bytes.toString("utf8", at, at+length); at += length;
    const size = bytes.readInt32LE(at); at += 4;
    blocks[key] = bytes.subarray(at, at+size); at += size;
}
assert.equal(at, bytes.length);
const config = Config.read(new Tables(name => new ByteBuf(new Uint8Array(blocks[name]))));
const profile = Build.profile(config.build);
const fixtures = Array.from({ length: 64 }, (_, i) => {
    const seed = i+1, initial = Rules.start(config, profile, seed, `layout-${seed}`);
    const map = Rules.apply(config, profile, initial, { type: "enter" }, 1000, seed).state.map;
    return { seed, map };
});
const proof = fixtures.find(({ map }) =>
    map.edges.filter(e => e.includes(2)).length === 5 &&
    new Set(map.nodes.filter(n => n.x > 0 && n.x < 8).map(n => n.y)).size === 4);
assert.ok(proof, "A four-way first fork is available for real-input checks");

async function click(page, key, touch) {
    const point = await page.evaluate(key => {
        const n = window.__skillBattlePreview.panel.buttons[key];
        if (!n?.visible || !n.mouseEnabled) throw Error(`Unavailable ${key}`);
        const p = n.localToGlobal(new Laya.Point(n.width/2, n.height/2));
        const r = document.querySelector("canvas").getBoundingClientRect();
        return { x: r.left+p.x*r.width/Laya.stage.width, y: r.top+p.y*r.height/Laya.stage.height };
    }, key);
    if (touch) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(80);
}

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, width, height, touch] of [
            ["desktop", 1280, 720, false], ["wide", 1560, 720, false], ["mobile", 844, 390, true],
        ]) {
            const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
            const page = await context.newPage(), errors = [];
            page.on("pageerror", e => errors.push(e.message));
            await page.addInitScript(seed => { crypto.getRandomValues = array => { array.fill(seed); return array; }; }, proof.seed);
            await page.goto(url);
            await page.waitForFunction(() => window.__skillBattlePreview?.panel?.opened && window.__skillBattlePreview.view.isOpened);
            await click(page, "invPrimary", touch); await click(page, "invPrimary", touch);
            while (await page.evaluate(() => !!window.__skillBattlePreview.trial.inventory.flow.pending)) {
                await click(page, "warehouse0", touch); await click(page, "newRun", touch);
            }
            await click(page, "expNode2", touch);
            await page.waitForFunction(() => !window.__skillBattlePreview.panel.movement);
            const targets = proof.map.edges.filter(e => e.includes(2)).map(e => e.find(id => id !== 2))
                .filter(id => id !== 1)
                .sort((a,b) => proof.map.nodes[a-1].y-proof.map.nodes[b-1].y);
            const target = targets[name === "desktop" ? 2 : 3];
            await click(page, `expNode${target}`, touch);
            await page.waitForFunction(() => !window.__skillBattlePreview.panel.movement);
            const arrival = await page.evaluate(() => {
                const { trial, panel } = window.__skillBattlePreview, state = trial.inventory;
                const node = state.map.nodes.find(n => n.id === state.node);
                return { id: state.node, stamina: state.stamina, phase: state.flow.phase,
                    locked: !node.enemy || state.map.present.filter(id => id !== state.node)
                        .every(id => !panel.buttons[`expNode${id}`].visible || !panel.buttons[`expNode${id}`].mouseEnabled) };
            });
            assert.equal(arrival.id, target, "Mouse/touch can enter the third/fourth route");
            assert.equal(arrival.stamina, config.rules.staminaMax-config.rules.moveCost*2);
            assert.equal(arrival.phase, "ready", "Route arrival never starts combat automatically");
            assert.ok(arrival.locked, "Enemy lock applies on the new routes too");
            let captured = false;
            for (const fixture of fixtures) {
                const result = await page.evaluate(fixture => {
                    const { panel, trial } = window.__skillBattlePreview;
                    window.__branchOriginal ||= structuredClone(trial.save.state);
                    trial.save.state.map = fixture.map;
                    trial.save.state.node = 1;
                    trial.save.state.revealed = [...fixture.map.present];
                    panel.selectedNode = null; panel.refresh();
                    const missing = fixture.map.edges.filter(([a,b]) => {
                        const route = panel.mapRoutes.get(`${a}:${b}`);
                        return !route || route.length < 4;
                    });
                    const legWidths = [0,1,2].map(leg =>
                        new Set(fixture.map.nodes.filter(n => n.x > leg*8 && n.x < (leg+1)*8).map(n => n.y)).size);
                    const own = panel.expeditionNodes.expPlayer;
                    const nodes = fixture.map.nodes.map(n => panel.buttons[`expNode${n.id}`]);
                    const clips = fixture.map.nodes.filter(n => {
                        const icon = panel.buttons[`expNode${n.id}`].getChildAt(2);
                        return n.enemy && n.x > 1.5 && n.y < 0 &&
                            panel.buttons[`expNode${n.id}`].y+icon.y+icon.height*0.12 < panel.mapBandTop-34;
                    });
                    if (legWidths[0] === 4)
                        panel.scroller.posX = 112+4*242-panel.scroller.viewWidth/2;
                    return { missing, legWidths, clips: clips.map(n => n.id),
                        visible: nodes.every(n => n.visible), passive: !own.mouseEnabled };
                }, fixture);
                assert.deepEqual(result.missing, [], `${name}/seed${fixture.seed}: every logical edge has a visible routed path`);
                assert.deepEqual(result.clips, [], `${name}/seed${fixture.seed}: top-lane enemies stay below the header`);
                assert.ok(result.visible && result.passive);
                if (!captured && result.legWidths[0] === 4) {
                    await page.waitForTimeout(160);
                    const image = await page.screenshot({ path: path.join(output, `${name}-four-routes.png`) });
                    const stats = await sharp(image).stats();
                    assert.ok(stats.channels.slice(0,3).every(c => c.stdev > 15));
                    captured = true;
                }
            }
            assert.ok(captured, "Render a four-lane first segment");
            await page.evaluate(() => {
                const { trial, panel } = window.__skillBattlePreview;
                trial.save.state = window.__branchOriginal; delete window.__branchOriginal; panel.refresh();
            });
            assert.deepEqual(errors, []);
            await context.close();
            console.log(`PASS branch layout ${name}: real third/fourth-route input, 64 seeds, every edge drawn, four-route screenshot, no header clipping.`);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
