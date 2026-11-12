const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const sharp = require("sharp");
const root = path.resolve(__dirname, ".."), build = path.join(root, "bin/gameplay-tests/script");
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
const { ExpeditionRunConfigUtils: Config } = require(path.join(build, "module/expedition/utils/ExpeditionRunConfigUtils.js"));
const { BuildConfigUtils: Build } = require(path.join(build, "module/build/utils/BuildConfigUtils.js"));
const { ExpeditionRules: Rules } = require(path.join(build, "module/expedition/utils/ExpeditionRules.js"));
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
function layouts(count, version) { return Array.from({ length: count }, (_, i) => {
    const seed = i+1, initial = Rules.start(config, profile, seed, `layout-${seed}`, version);
    const map = Rules.apply(config, profile, initial, { type: "enter" }, 1000, seed).state.map;
    return { seed, map };
}); }
const fixtures = layouts(512, 2), legacy = layouts(64, 1);
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
            const geometry = await page.evaluate(fixtures => {
                const { panel, trial } = window.__skillBattlePreview, state = trial.inventory, issues = [];
                const original = JSON.stringify(state), height = panel.expeditionNodes.expViewport.height;
                for (const {seed,map} of fixtures) {
                    const positions = panel.mapPositions({...state,map});
                    const values = map.nodes.map(n => ({...positions.get(n.id),id:n.id,kind:n.kind}));
                    for (const [i,a] of values.entries()) {
                        const size = ({normal:104,elite:144,boss:192})[a.kind] || 104;
                        if (a.y-58-(size-104)*0.75 < panel.mapBandTop-22 || a.y+102>height)
                            issues.push([seed,"clipped",a.id]);
                        for (const b of values.slice(i+1))
                            if (Math.abs(a.x-b.x)<116 && Math.abs(a.y-b.y)<116)issues.push([seed,"overlap",a.id,b.id]);
                    }
                }
                return {issues,untouched:original===JSON.stringify(trial.inventory)};
            }, [...fixtures,...legacy]);
            assert.deepEqual(geometry.issues, [], `${name}: 512 new and 64 existing-v4 maps fit without overlapping hit areas`);
            assert.ok(geometry.untouched, "Layout never changes the authoritative state");
            let captured = false, variedRoutes = 0, checkedRoutes = 0;
            for (const fixture of [...fixtures.slice(0,64),...legacy.slice(0,16)]) {
                const result = await page.evaluate(fixture => {
                    const { panel, trial } = window.__skillBattlePreview;
                    window.__branchOriginal ||= structuredClone(trial.data.save.state);
                    trial.data.save.state.map = fixture.map;
                    trial.data.save.state.node = 1;
                    trial.data.save.state.revealed = [...fixture.map.present];
                    const stateBefore = JSON.stringify(trial.data.save.state);
                    panel.selectedNode = null; panel.refresh();
                    const missing = fixture.map.edges.filter(([a,b]) => {
                        const route = panel.mapRoutes.get(`${a}:${b}`);
                        const reverse = panel.mapRoutes.get(`${b}:${a}`);
                        const points = panel.mapPositions(trial.inventory), p = points.get(a), q = points.get(b);
                        return !route || route.length !== 2 || !reverse || reverse.length !== 2 ||
                            route[0].x !== p.x || route[0].y !== p.y || route[1].x !== q.x || route[1].y !== q.y ||
                            reverse[0] !== route[1] || reverse[1] !== route[0];
                    });
                    const routes = fixture.map.edges.map(([a,b]) => panel.mapRoutes.get(`${a}:${b}`));
                    const bentDashes = panel.expeditionNodes.expLines.graphics.cmds.filter(cmd => {
                        const m = cmd.matrix;
                        return !m || !routes.some(([p,q]) => {
                            const dx=q.x-p.x,dy=q.y-p.y,length=Math.hypot(dx,dy);
                            return Math.abs(m.a*dy-m.b*dx)/length<0.0001 &&
                                Math.abs((m.tx-p.x)*dy-(m.ty-p.y)*dx)/length<0.0001;
                        });
                    }).length;
                    const legWidths = [0,1,2].map(leg =>
                        new Set(fixture.map.nodes.filter(n => n.x > leg*8 && n.x < (leg+1)*8).map(n => n.y)).size);
                    const own = panel.expeditionNodes.expPlayer;
                    const nodes = fixture.map.nodes.map(n => panel.buttons[`expNode${n.id}`]);
                    const positions = fixture.map.nodes.map(n => {
                        const button = panel.buttons[`expNode${n.id}`];
                        return { id:n.id,x:button.x+58,y:button.y+52,lane:n.y,logicalX:n.x };
                    });
                    const clips = fixture.map.nodes.filter(n => {
                        const button = panel.buttons[`expNode${n.id}`];
                        const icon = button.getChildAt(n.kind === "transit" ? 0 : 2);
                        return button.y+icon.y < panel.mapBandTop-22 ||
                            button.y+icon.y+icon.height > panel.expeditionNodes.expViewport.height;
                    });
                    const overlaps = positions.flatMap((a,i) => positions.slice(i+1)
                        .filter(b => Math.abs(a.x-b.x)<116 && Math.abs(a.y-b.y)<116).map(b => [a.id,b.id]));
                    const variation = [0,1,2].map(leg => {
                        const main = fixture.map.nodes.filter(n => n.x>leg*8 && n.x<(leg+1)*8 && n.mainOrder>=0)
                            .map(n => positions.find(p => p.id===n.id).y);
                        return Math.max(...main)-Math.min(...main);
                    });
                    panel.refresh();
                    const stable = positions.every(p => panel.buttons[`expNode${p.id}`].y+52===p.y);
                    if (legWidths[0] === 4)
                        panel.scroller.posX = 112+4*242-panel.scroller.viewWidth/2;
                    return { missing, bentDashes, legWidths, clips: clips.map(n => n.id),overlaps,variation,stable,
                        height:panel.expeditionNodes.expViewport.height,
                        untouched:JSON.stringify(trial.data.save.state)===stateBefore,
                        spread:Math.max(...positions.map(p=>p.y))-Math.min(...positions.map(p=>p.y)),
                        visible: nodes.every(n => n.visible), passive: !own.mouseEnabled };
                }, fixture);
                assert.deepEqual(result.missing, [], `${name}/seed${fixture.seed}: every logical edge uses its two endpoints directly`);
                assert.equal(result.bentDashes, 0, `${name}/seed${fixture.seed}: every rendered dash follows a direct edge`);
                assert.deepEqual(result.clips, [], `${name}/seed${fixture.seed}: top-lane enemies stay below the header`);
                assert.deepEqual(result.overlaps, [], `${name}/seed${fixture.seed}: node hit areas do not overlap`);
                variedRoutes += result.variation.filter(range => range>8).length;
                checkedRoutes += result.variation.length;
                assert.ok(result.variation.some(range => range>24),
                    `${name}/seed${fixture.seed}: individual node heights vary (${result.variation}, height ${result.height})`);
                assert.ok(result.stable && result.untouched, "Refresh keeps heights stable without altering saved map data");
                assert.ok(result.visible && result.passive);
                if (!captured && result.legWidths[0] === 4) {
                    assert.ok(result.spread>380, "Node positions use the expanded vertical area");
                    await page.waitForTimeout(160);
                    const image = await page.screenshot({ path: path.join(output, `${name}-four-routes.png`) });
                    const stats = await sharp(image).stats();
                    assert.ok(stats.channels.slice(0,3).every(c => c.stdev > 15));
                    captured = true;
                }
            }
            assert.ok(variedRoutes/checkedRoutes>0.95, "Main routes are not laid out as uniform horizontal rows");
            assert.ok(captured, "Render a four-lane first segment");
            await page.evaluate(() => {
                const { trial, panel } = window.__skillBattlePreview;
                trial.data.save.state = window.__branchOriginal; delete window.__branchOriginal; panel.refresh();
            });
            const snapshot = () => {
                const {trial,panel} = window.__skillBattlePreview;
                return { map:trial.inventory.map, positions:[...panel.mapPositions(trial.inventory)] };
            };
            const savedLayout = await page.evaluate(snapshot);
            await click(page, "expStorage", touch);
            await page.waitForFunction(() => window.__skillBattlePreview.panel.pageRole === "inventory");
            await click(page, "invToggle", touch);
            await page.waitForFunction(() => window.__skillBattlePreview.panel.pageRole === "map");
            assert.deepEqual(await page.evaluate(snapshot), savedLayout, "Inventory return preserves every node's height and map data");
            await page.reload();
            await page.waitForFunction(() => window.__skillBattlePreview?.panel?.opened && window.__skillBattlePreview.view.isOpened);
            if (!await page.evaluate(() => window.__skillBattlePreview.panel.pageRole === "map"))
                await click(page, "invToggle", touch);
            assert.deepEqual(await page.evaluate(snapshot), savedLayout, "Reload restores the same node heights without rewriting the map");
            assert.deepEqual(errors, []);
            await context.close();
            console.log(`PASS branch layout ${name}: real third/fourth-route input, 576 geometry/80 render fixtures, stable heights across refresh/inventory/reload, expanded vertical area, every edge drawn, no clipping/overlapping hit areas or save mutation.`);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
