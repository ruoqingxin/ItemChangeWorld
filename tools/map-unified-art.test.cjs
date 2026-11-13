const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { check } = require("./import-map-unified-art.cjs");
const { componentBounds } = require("./map-node-art-bounds.cjs");
const root = path.resolve(__dirname, "..");
const art = path.join(root, "assets/ui/atlas/module/expedition/handpainted");
const reference = path.join(root, "art/reference/expedition/map-unified-2026-11-12");

async function pixels(file) {
    return sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
function bounds({ data, info }) {
    let left = info.width, top = info.height, right = -1, bottom = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * 4 + 3] < 32) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    return [left, top, right, bottom];
}
function whiteRatio({ data }) {
    let white = 0, total = 0;
    for (let at = 0; at < data.length; at += 4) {
        if (data[at + 3] < 180) continue;
        total++;
        if (data[at] > 220 && data[at + 1] > 220 && data[at + 2] > 200) white++;
    }
    assert.ok(total > 100);
    return white / total;
}
function eyeSpacing({ data }) {
    const red = (x, y) => {
        const at = (y * 256 + x) * 4;
        return Math.max(0, data[at] - Math.max(data[at + 1], data[at + 2]) * 1.3) * data[at + 3] / 255;
    };
    // Compare the red eye centers, excluding the very different helmet silhouettes.
    let peak = 0, row = 0;
    for (let y = 130; y < 205; y++) {
        let sum = 0;
        for (let x = 78; x < 178; x++) sum += red(x, y);
        if (sum > peak) { peak = sum; row = y; }
    }
    assert.ok(peak > 100, "Both red eyes must remain readable");
    const centers = [[78, 128], [128, 178]].map(([left, right]) => {
        let total = 0, weighted = 0;
        for (let y = row - 3; y <= row + 3; y++) for (let x = left; x < right; x++) {
            const weight = red(x, y);
            total += weight; weighted += x * weight;
        }
        assert.ok(total > 0, "Each eye has a measurable center");
        return weighted / total;
    });
    return centers[1] - centers[0];
}
async function main() {
    await check();
    const sheets = {
        panels: path.join(reference, "panels.png"),
        nodes: path.join(reference, "nodes.png"),
        icons: path.join(reference, "icons.png"),
    };
    const normal = fs.readFileSync(path.join(art, "map-panel.png"));
    for (const name of ["map-header-panel", "map-player-panel", "map-button-normal", "map-toolbar-normal"])
        assert.deepEqual(fs.readFileSync(path.join(art, name + ".png")), normal,
            "Approved panels and buttons share exactly the same emerald and fine gold material");
    const originalHp = await sharp(sheets.icons).extract({ left: 0, top: 384, width: 688, height: 384 })
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.ok(whiteRatio(await pixels(path.join(art, "map-icon-hp.png"))) < whiteRatio(originalHp) * 0.4,
        "The HP icon no longer has the large white candy-like highlight");
    for (const stem of ["map-button", "map-toolbar"]) {
        let normal, outline;
        for (const state of ["normal", "hover", "pressed", "disabled"]) {
            const probe = await pixels(path.join(art, `${stem}-${state}.png`)), box = bounds(probe);
            if (!normal) normal = box;
            assert.deepEqual(box, normal, `${stem}: no state changes the visible outer bounds`);
            const alpha = Buffer.from(probe.data.filter((_, index) => index % 4 === 3));
            if (!outline) outline = alpha;
            assert.deepEqual(alpha, outline, `${stem}: all states share the exact same alpha silhouette`);
        }
    }
    const rawGate = await sharp(sheets.nodes).extract({ left: 0, top: 0, width: 688, height: 512 })
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Rebuild the same crop before portal toning so only the intentional material change differs.
    const [l, t, r, b] = bounds(rawGate);
    const before = await sharp(sheets.nodes).extract({ left: l, top: t, width: r - l + 1, height: b - t + 1 })
        .resize(224, 224, { fit: "inside" }).png().toBuffer();
    const m = await sharp(before).metadata();
    const baseline = await sharp({ create: { width: 256, height: 256, channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: before, left: Math.round((256 - m.width) / 2), top: 240 - m.height }])
        .raw().toBuffer();
    const gate = await pixels(path.join(root, "assets/ui/image/expeditionNodes/clean/node-start.png"));
    const center = (180 * 256 + 128) * 4;
    const light = data => data[center] + data[center + 1] + data[center + 2];
    assert.ok(light(gate.data) < light(baseline) * 0.85, "The entrance portal is dimmer than its unedited source");
    assert.ok(gate.data[center + 3] >= baseline[center + 3], "Portal toning does not erase its alpha");
    const actor = await pixels(path.join(art, "map-player-traveler.png")), feet = bounds(actor);
    assert.ok(feet[1] > 0 && feet[3] < 148 && feet[3] >= 144, "The full character is aligned to the ground ring");
    const enemyMasses = [], faceSpacings = [];
    for (const kind of ["normal", "elite", "boss"]) {
        const image = await pixels(path.join(root, `assets/ui/image/expeditionNodes/node-enemy-${kind}.png`));
        assert.deepEqual([image.info.width, image.info.height], [256, 256], "All enemies use the requested 256px canvas");
        const box = componentBounds(image.data, 256, 256);
        const span = Math.max(box.width, box.height);
        const [min, max] = { normal: [150, 162], elite: [180, 196], boss: [210, 225] }[kind];
        assert.ok(span >= min && span <= max, `Optically balanced solid subject: ${kind}/${span}`);
        enemyMasses.push(box.count);
        faceSpacings.push(eyeSpacing(image));
        const clean = await pixels(path.join(root, `assets/ui/image/expeditionNodes/clean/node-enemy-${kind}.png`));
        assert.deepEqual([clean.info.width, clean.info.height], [256, 256]);
        assert.notDeepEqual(image.data, clean.data, "Map atmosphere and clean UI variants are separate");
        const hud = await pixels(path.join(root, `assets/ui/image/expeditionNodes/hud/node-enemy-${kind}.png`));
        assert.deepEqual([hud.info.width, hud.info.height], [256, 256]);
        const hudBody = componentBounds(hud.data, 256, 256);
        assert.ok(Math.abs(hudBody.width - box.width) <= 8 && Math.abs(hudBody.height - box.height) <= 3,
            `${kind}: the new HUD subject matches map subject size without aspect distortion`);
        assert.ok(Math.abs(hudBody.left + hudBody.width / 2 - box.left - box.width / 2) <= 0.5,
            `${kind}: HUD and map subjects share their horizontal center`);
        assert.equal(hudBody.top + hudBody.height, box.top + box.height,
            `${kind}: HUD and map subjects share their solid foot anchor`);
        assert.ok(Math.abs(eyeSpacing(hud) / eyeSpacing(image) - 1) < 0.09,
            `${kind}: faces retain matching optical scale, without including helmets or effects`);
    }
    assert.ok(enemyMasses[0] < enemyMasses[1] && enemyMasses[1] < enemyMasses[2],
        "Visual mass follows ordinary < elite < boss; do not enlarge the ordinary face to match their helmets");
    for (const spacing of faceSpacings.slice(1))
        assert.ok(Math.abs(faceSpacings[0] / spacing - 1) < 0.06,
            "The ordinary face matches elite/boss facial scale within 6%, without counting helmets or horns");
    const report = JSON.parse(fs.readFileSync(path.join(reference, "import.json"), "utf8"));
    for (const entry of report.files.filter(entry => entry.file.includes("/expeditionNodes/") ||
        entry.name.startsWith("map-transit-stone")))
        assert.deepEqual(entry.size, [256, 256], `All node variants use 256px: ${entry.name}`);
    const mapNodes = report.files.filter(entry => entry.file.startsWith("assets/ui/image/expeditionNodes/node-"));
    assert.equal(mapNodes.length, 12);
    for (const entry of mapNodes) {
        const image = await pixels(path.join(root, entry.file));
        const box = bounds(image);
        assert.ok(box[3] >= 236 && box[3] <= 239,
            `${entry.name}: the stronger visible edge stays close to the shared soft-effect baseline`);
        let left = 256, right = -1, top = 256, bottom = -1;
        for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
            if (!image.data[(y * 256 + x) * 4 + 3]) continue;
            left = Math.min(left, x); right = Math.max(right, x);
            top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        assert.equal(bottom, 239, `${entry.name}: exactly 16 fully transparent bottom rows`);
        assert.ok(left >= 8 && right <= 247 && top >= 16, `${entry.name}: effects stay inside the safe envelope`);
        assert.ok(Math.abs((left + right) / 2 - 127.5) <= 0.5, `${entry.name}: horizontally centered`);
        if (["node-search", "node-supply"].includes(entry.name)) {
            const subject = componentBounds(image.data, 256, 256);
            assert.ok(subject.width >= 230, `${entry.name}: small packages are enlarged inside the canvas`);
            assert.ok(subject.top + subject.height >= 232, `${entry.name}: no stray neighboring sprite below the package`);
        }
    }
    const prefab = JSON.parse(fs.readFileSync(path.join(root,
        "assets/ui/prefab/module/expedition/SkillBattleMapView.lh"), "utf8")), nodes = new Map();
    const visit = node => { nodes.set(node.name, node); (node._$child || []).forEach(visit); };
    visit(prefab);
    for (const [i, kind] of ["normal", "elite", "boss"].entries())
        assert.equal(nodes.get(`mapKillIcon${i}`).src, `ui/image/expeditionNodes/hud/node-enemy-${kind}.png`,
            "Only the top counters use the new dedicated no-atmosphere artwork");
    assert.deepEqual(["x", "y", "width", "height"].map(key => nodes.get("nodeActionArea")[key]), [1000, 219, 248, 282],
        "The operation panel retains its prefab-authored placement");
    assert.ok(nodes.get("mapNoticeSkin").src.endsWith("/map-notice-panel.png"), "Use the supplied dedicated notice panel");
    console.log("PASS unified map style: approved shared material, all 256px nodes, consistent subject padding, clean HUD variants, aligned states and unchanged operation panel.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
