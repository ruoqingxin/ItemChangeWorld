const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const source = process.env.MAP_UI_BUNDLE ||
    "C:/Users/Administrator/Downloads/segment_bundle_02ef9c94-64df-4ea8-91c2-c8d2d6d277aa/新建文件夹";
const target = path.join(root, "assets/ui/atlas/module/expedition/handpainted");
const reference = path.join(root, "art/reference/expedition/map-ui-bundle-02ef9c94");
const prefix = "ui/atlas/module/expedition/handpainted/";
const definitions = [
    ["segment_001.png", "map-header-panel", [1024,81], [24,32,24,32,0]],
    ["segment_002.png", "map-player-panel", [300,122], [24,24,24,24,0]],
    ["map-panel.png", "map-panel", [96,96], [18,18,18,18,0]],
    ["segment_011.png", "map-button-normal", [128,48], [10,10,10,10,0]],
    ["segment_023.png", "map-icon-inventory", [128,128]],
    ["segment_024.png", "map-icon-build", [128,128]],
    ["segment_026.png", "map-icon-clock", [128,128]],
    ["segment_027.png", "map-icon-mp", [128,128]],
    ["segment_028.png", "map-icon-hp", [128,128]],
];
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const relative = file => path.relative(root, file).replaceAll("\\", "/");

async function writeAsset(name, bytes, grid) {
    const file = path.join(target, `${name}.png`);
    const metaFile = `${file}.meta`;
    const previous = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : {};
    const meta = { ...previous, uuid:previous.uuid || crypto.randomUUID(),
        importer:{ ...previous.importer, textureType:2, sRGB:true, premultiplyAlpha:true,
            ...(grid ? { sizeGrid:grid } : {}) } };
    fs.writeFileSync(file, bytes);
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2)+"\n");
    return { file:relative(file), sha256:hash(bytes), uuid:meta.uuid, grid };
}

async function main() {
    assert.ok(process.argv.includes("--write"), "Use --write");
    fs.mkdirSync(reference, {recursive:true});
    const files = [];
    for (const [input, name, size, grid] of definitions) {
        const original = fs.readFileSync(path.join(source,input));
        const archived = path.join(reference,input);
        if (fs.existsSync(archived)) assert.equal(hash(fs.readFileSync(archived)),hash(original));
        else fs.copyFileSync(path.join(source,input),archived);
        let image = sharp(original);
        if (size) image = image.resize(size[0],size[1],{fit:"contain",
            background:{r:0,g:0,b:0,alpha:0}});
        // Keep buttons edge-to-edge so their nine-slice center does not repeat empty padding.
        if (name === "map-button-normal") image = sharp(original).trim({threshold:4})
            .resize(128,48,{fit:"fill"});
        const bytes = await image.png().toBuffer();
        files.push({ source:input, source_sha256:hash(original), ...await writeAsset(name,bytes,grid) });
        if (name === "map-button-normal" || name === "map-panel") {
            const stem = name === "map-panel" ? "map-toolbar" : "map-button";
            if (stem === "map-toolbar") files.push(await writeAsset(`${stem}-normal`,bytes,grid));
            for (const [state,brightness,saturation] of [
                ["hover",1.12,1.04],["pressed",0.82,1],["disabled",0.66,0.3],
            ]) files.push(await writeAsset(`${stem}-${state}`,
                await sharp(bytes).modulate({brightness,saturation}).png().toBuffer(),grid));
        }
    }
    const prefabFile = path.join(root,"assets/ui/prefab/module/expedition/SkillBattleMapView.lh");
    const prefab = JSON.parse(fs.readFileSync(prefabFile,"utf8")), nodes = new Map();
    const collect = node => { nodes.set(node.name,node); (node._$child || []).forEach(collect); };
    collect(prefab);
    const bindings = {mapHeaderPanel:"map-header-panel",mapPlayerPanel:"map-player-panel",
        expStorageSkin:"map-toolbar-normal",expBuildSkin:"map-toolbar-normal"};
    for (const [name,file] of Object.entries(bindings)) nodes.get(name).src = `${prefix}${file}.png`;
    const mapper = prefab._$comp.find(c=>c.scriptPath?.endsWith("ElementMapper.ts"));
    for (const key of ["Hp","Mp"]) {
        const name = `map${key}Icon`;
        if (!nodes.has(name)) {
            const node = {_$id:`map_bundle_${name}`, _$type:"GImage", name, x:88,
                y:key==="Hp"?42:78,width:22,height:22,mouseEnabled:false,autoSize:false,
                src:`${prefix}map-icon-${key.toLowerCase()}.png`};
            nodes.get("mapPlayerArea")._$child.push(node);
            mapper.elements.push({_$ref:node._$id});
        }
    }
    for (const state of ["hover","pressed","disabled"]) {
        const name = `mapToolbarState${state}`;
        if (nodes.has(name)) continue;
        const node = {_$id:`map_bundle_${name}`, _$type:"GImage", name, width:64,height:64,
            mouseEnabled:false,autoSize:false,visible:false,src:`${prefix}map-toolbar-${state}.png`};
        nodes.get("mapHeaderArea")._$child.push(node);
        mapper.elements.push({_$ref:node._$id});
    }
    fs.writeFileSync(prefabFile,JSON.stringify(prefab,null,2)+"\n");
    fs.writeFileSync(path.join(reference,"import-report.json"),JSON.stringify({
        source, files, scope:"Map UI only; existing layout, terrain, nodes, gameplay and saves retained.",
    },null,2)+"\n");
    console.log(`Imported ${definitions.length} supplied images and button feedback variants; map bindings updated.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
