const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const sourceDir = process.env.MAP_UI_SEGMENTS ||
    "C:/Users/Administrator/Downloads/segment_bundle_1188a1dd-1c32-4f8a-9860-1a583e8ada98";
const sourceSheet = path.join(sourceDir, "source_original.png");
const assetDir = path.join(root, "assets/ui/atlas/module/expedition");
const prefabFile = path.join(root, "assets/ui/prefab/module/expedition/SkillBattleMapView.lh");
const referenceFile = path.join(root, "art/reference/expedition/skill-map-ui-segment-source.png");
const segmentReferences = path.join(root, "art/reference/expedition/skill-map-ui-segments");
const reportDir = path.join(root, "output/imagegen/skill-map-ui");
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const rel = file => path.relative(root, file).replaceAll("\\", "/");
const assets = [
    { input: "segment_001.png", output: "map-ui-title-frame.png" },
    { input: "segment_002.png", output: "map-ui-footer-trim.png" },
    { input: "segment_003.png", output: "map-ui-header-trim.png" },
    { input: "segment_004.png", output: "map-ui-current-ring.png", canvas: 160, inset: 4 },
    { input: "segment_005.png", output: "map-ui-resource-strip.png" },
    { input: "segment_006.png", output: "map-ui-button.png" },
    { input: "segment_007.png", output: "map-ui-button-danger.png" },
    { input: "segment_008.png", output: "map-ui-icon-battle.png", canvas: 64, inset: 5 },
    { input: "segment_009.png", output: "map-ui-icon-spirit.png", canvas: 64, inset: 5 },
    { input: "segment_010.png", output: "map-ui-icon-guard.png", canvas: 64, inset: 5 },
    { input: "segment_011.png", output: "map-ui-icon-life.png", canvas: 64, inset: 5 },
];

function find(node, name) {
    if (node?.name === name) return node;
    for (const child of node?._$child || []) {
        const match = find(child, name);
        if (match) return match;
    }
    return null;
}

function addNode(parent, root, name, type, x, y, width, height, extra = {}) {
    let node = (parent._$child || []).find(child => child.name === name);
    if (!node) {
        const used = new Set();
        const collect = current => {
            if (current?._$id) used.add(current._$id);
            for (const child of current?._$child || []) collect(child);
        };
        collect(root);
        let id = `mapui_${name}`;
        for (let suffix = 2; used.has(id); suffix++) id = `mapui_${name}_${suffix}`;
        node = { "_$id": id, "_$type": type, name };
        parent._$child ||= [];
        parent._$child.push(node);
    }
    Object.assign(node, {
        "_$type": type, x, y, width, height, mouseEnabled: false, visible: true, ...extra,
    });
    return node;
}

function register(mapper, node) {
    mapper.elements ||= [];
    if (!mapper.elements.some(entry => entry._$ref === node._$id))
        mapper.elements.push({ "_$ref": node._$id });
}

function bindPrefab() {
    const prefab = JSON.parse(fs.readFileSync(prefabFile, "utf8"));
    const component = prefab._$comp.find(item => item.scriptPath?.endsWith("ElementMapper.ts"));
    assert.ok(component, "SkillBattleMapView must retain its ElementMapper");
    const header = find(prefab, "mapHeaderArea");
    const clock = find(prefab, "mapClockArea");
    const actions = find(prefab, "mapActionsArea");
    const exit = find(prefab, "mapExitArea");
    const mapRoot = find(prefab, "expeditionRoot");
    const mapContent = find(prefab, "expMapContent");
    const player = find(prefab, "expPlayer");
    assert.ok(header && clock && actions && exit && mapRoot && mapContent && player, "Map UI regions are missing");
    clock.height = 68;
    Object.assign(exit, { y: 80, height: 60 });
    for (const parent of [header, actions]) {
        const decorations = parent._$child.filter(node => ["mapTopTrim", "mapFooterTrim"].includes(node.name));
        parent._$child = parent._$child.filter(node => !decorations.includes(node));
        mapRoot._$child.push(...decorations);
    }

    const addImage = (parent, name, x, y, width, height, file) => {
        const background = /Frame|Strip|Trim/.test(name);
        const node = addNode(parent, prefab, name, "GImage", x, y, width, height,
            { src: `ui/atlas/module/expedition/${file}`, autoSize: false,
                zOrder: background ? -2 : 2 });
        register(component, node);
        return node;
    };
    const addText = (name, x, y, width, height) => {
        const node = addNode(header, prefab, name, "GTextField", x, y, width, height,
            { text: "", fontSize: 16, color: "#e8edf0", overflow: "shrink",
                mouseEnabled: false, zOrder: 3 });
        register(component, node);
        return node;
    };

    addImage(header, "mapTitleFrame", 0, 0, 760, 46, "map-ui-title-frame.png");
    addImage(header, "mapResourceStrip", 0, 42, 760, 46, "map-ui-resource-strip.png");
    const headerTrim = addImage(mapRoot, "mapTopTrim", 0, 102, 1280, 14, "map-ui-header-trim.png");
    headerTrim.zOrder = -1;
    headerTrim.relations = [{ "_$type": "Relation", target: { "_$ref": mapRoot._$id }, data: [1, 0] }];
    for (const [name, x, file] of [
        ["mapIconLife", 10, "map-ui-icon-life.png"],
        ["mapIconSpirit", 198, "map-ui-icon-spirit.png"],
        ["mapIconGuard", 386, "map-ui-icon-guard.png"],
        ["mapIconBattle", 574, "map-ui-icon-battle.png"],
    ]) addImage(header, name, x, 47, 36, 36, file);
    addImage(clock, "mapTimerFrame", 0, 0, 166, 68, "map-ui-button.png");
    const footerTrim = addImage(mapRoot, "mapFooterTrim", 0, 624, 1280, 69, "map-ui-footer-trim.png");
    footerTrim.zOrder = -1;
    footerTrim.relations = [{ "_$type": "Relation", target: { "_$ref": mapRoot._$id }, data: [1, 0, 16, 0] }];
    addImage(player, "expPlayerRing", 0, 0, 116, 116, "map-ui-current-ring.png");

    const stats = [
        ["expResources", 48, 138],
        ["expSpirit", 236, 142],
        ["expDurability", 424, 138],
        ["expWins", 612, 138],
    ];
    for (const [name, x, width] of stats) {
        const label = addText(name, x, 50, width, 28);
        label.valign = "middle";
    }

    const playerIndex = mapContent._$child.indexOf(player);
    if (playerIndex > 1) {
        mapContent._$child.splice(playerIndex, 1);
        mapContent._$child.splice(1, 0, player);
    }

    const buttons = [
        ["expUse", "map-ui-button.png", 20, 198, 208, 76],
        ["expStorage", "map-ui-button.png", 0, 80, 162, 60],
        ["expBuild", "map-ui-button.png", 178, 80, 162, 60],
        ["expAbandon", "map-ui-button-danger.png", 76, 0, 172, 60],
    ];
    for (const [name, file, x, y, width, height] of buttons) {
        const button = find(prefab, name);
        const skin = button?._$child?.find(child => child.name === `${name}Skin`);
        assert.ok(skin, `Missing skin for ${name}`);
        Object.assign(button, { x, y, width, height });
        skin.src = `ui/atlas/module/expedition/${file}`;
        skin.autoSize = false;
        skin.visible = true;
        skin.width = width;
        skin.height = height;
        const label = find(button, `${name}Text`);
        assert.ok(label, `Missing label for ${name}`);
        Object.assign(label, { x: 4, y: 2, width: width - 8, height: height - 4,
            align: "center", valign: "middle" });
    }

    const context = find(prefab, "expContextBackground");
    assert.ok(context, "Map action panel is missing");
    context._$type = "GWidget";
    delete context.src;
    context.mouseThrough = true;

    const clockText = find(prefab, "expClock");
    if (clockText) {
        clockText.x = 0;
        clockText.y = 16;
        clockText.width = 166;
        clockText.height = 36;
        clockText.align = "center";
        clockText.valign = "middle";
    }
    const title = find(prefab, "expTitle");
    if (title) {
        title.x = 16;
        title.y = 2;
        title.width = 680;
        title.height = 36;
        title.fontSize = 24;
        title.valign = "middle";
    }
    player.width = player.height = 116;

    fs.writeFileSync(prefabFile, JSON.stringify(prefab, null, 2) + "\n");
}

async function main() {
    if (process.argv.includes("--check")) return check();
    assert.ok(fs.existsSync(sourceSheet), `Missing source sheet: ${sourceSheet}`);
    fs.mkdirSync(assetDir, { recursive: true });
    fs.mkdirSync(path.dirname(referenceFile), { recursive: true });
    fs.mkdirSync(segmentReferences, { recursive: true });
    fs.mkdirSync(reportDir, { recursive: true });
    const sheetBytes = fs.readFileSync(sourceSheet);
    if (fs.existsSync(referenceFile)) {
        assert.equal(digest(fs.readFileSync(referenceFile)), digest(sheetBytes),
            "The preserved map UI reference differs from this segment bundle.");
    } else fs.copyFileSync(sourceSheet, referenceFile);

    const records = [];
    for (const entry of assets) {
        const input = path.join(sourceDir, entry.input);
        assert.ok(fs.existsSync(input), `Missing cut image: ${input}`);
        const sourceBytes = fs.readFileSync(input);
        const preserved = path.join(segmentReferences, entry.output);
        if (fs.existsSync(preserved)) assert.equal(digest(fs.readFileSync(preserved)), digest(sourceBytes));
        else fs.writeFileSync(preserved, sourceBytes);
        const metadata = await sharp(sourceBytes).metadata();
        assert.ok(metadata.width > 0 && metadata.height > 0);
        let bytes;
        if (entry.canvas) {
            const size = entry.canvas, inset = entry.inset || 0;
            const resized = await sharp(sourceBytes).ensureAlpha()
                .resize(size - inset * 2, size - inset * 2,
                    { fit: "inside", kernel: "lanczos3" }).png().toBuffer();
            const resizedMeta = await sharp(resized).metadata();
            bytes = await sharp({ create: { width: size, height: size, channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 } } })
                .composite([{ input: resized, left: Math.floor((size - resizedMeta.width) / 2),
                    top: Math.floor((size - resizedMeta.height) / 2) }])
                .png({ compressionLevel: 9 }).toBuffer();
        } else {
            bytes = await sharp(sourceBytes).ensureAlpha().png({ compressionLevel: 9 }).toBuffer();
        }
        const target = path.join(assetDir, entry.output);
        const metaFile = `${target}.meta`;
        const previous = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : {};
        fs.writeFileSync(target, bytes);
        fs.writeFileSync(metaFile, JSON.stringify({
            ...previous,
            uuid: previous.uuid || crypto.randomUUID(),
            importer: { ...previous.importer, textureType: 2, sRGB: true, premultiplyAlpha: true },
        }, null, 2) + "\n");
        const result = await sharp(bytes).metadata();
        assert.equal(result.channels, 4);
        const raw = await sharp(bytes).ensureAlpha().raw().toBuffer();
        assert.ok(raw.some((value, index) => index % 4 === 3 && value === 0),
            `${entry.output} has no transparent pixels`);
        records.push({ source: entry.input, original: rel(preserved), size: [metadata.width, metadata.height],
            file: rel(target), output_size: [result.width, result.height], sha256: digest(bytes) });
    }

    bindPrefab();
    fs.writeFileSync(path.join(reportDir, "segment-bundle-import.json"), JSON.stringify({
        source: "Downloads/segment_bundle_1188a1dd-1c32-4f8a-9860-1a583e8ada98",
        source_sheet_sha256: digest(sheetBytes),
        reference: rel(referenceFile),
        icon_canvas: "64x64 transparent, aspect-preserving, 5px inset",
        current_marker_canvas: "160x160 transparent, aspect-preserving, 4px inset; rendered at 116x116",
        map_nodes_and_ground: "Unchanged",
        assets: records,
    }, null, 2) + "\n");
    console.log(JSON.stringify({ assets: records.length, reference: rel(referenceFile),
        runtime_directory: "assets/ui/atlas/module/expedition", prefab: rel(prefabFile) }, null, 2));
}

async function check() {
    const report = JSON.parse(fs.readFileSync(path.join(reportDir, "segment-bundle-import.json"), "utf8"));
    assert.equal(digest(fs.readFileSync(referenceFile)), report.source_sheet_sha256);
    assert.equal(report.assets.length, assets.length);
    const prefab = JSON.parse(fs.readFileSync(prefabFile, "utf8"));
    const uuids = new Set();
    assert.equal(find(prefab, "mapClockArea").height, 68);
    for (const record of report.assets) {
        const file = path.join(root, record.file);
        const bytes = fs.readFileSync(file);
        const metadata = await sharp(bytes).metadata();
        assert.equal(digest(bytes), record.sha256, `Changed image: ${record.file}`);
        assert.deepEqual([metadata.width, metadata.height], record.output_size);
        assert.equal(metadata.channels, 4);
        const meta = JSON.parse(fs.readFileSync(`${file}.meta`, "utf8"));
        assert.ok(meta.uuid && !uuids.has(meta.uuid), `Invalid UUID: ${record.file}`);
        uuids.add(meta.uuid);
        assert.equal(meta.importer.textureType, 2);
        assert.equal(meta.importer.sRGB, true);
        assert.equal(meta.importer.premultiplyAlpha, true);
        assert.ok(fs.existsSync(path.join(root, record.original)), "Missing preserved segment");
    }
    for (const name of ["mapIconLife", "mapIconSpirit", "mapIconGuard", "mapIconBattle"])
        assert.deepEqual([find(prefab, name).width, find(prefab, name).height], [36, 36]);
    for (const name of ["expUse", "expStorage", "expBuild", "expAbandon"])
        assert.ok(find(prefab, `${name}Skin`).src.startsWith("ui/atlas/module/expedition/map-ui-"));
    assert.equal(find(prefab, "mapGroundTexture").src, "ui/texture/expedition/ancient-sect-ground.png");
    console.log("PASS map UI segments: 11 RGBA assets, sizes, hashes, import settings, source copies and prefab skins.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
