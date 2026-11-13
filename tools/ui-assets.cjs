const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createPrefabResolver } = require("./ui-prefab.cjs");
const root = path.resolve(__dirname, "..");
const assets = path.join(root, "assets");
const ui = path.join(assets, "ui");
const write = process.argv.includes("--write");
const referencesOnly = process.argv.includes("--references-only");
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const relative = file => path.relative(assets, file).replaceAll("\\", "/");
const files = walk(ui), uuidMap = new Map();
assert.equal(JSON.parse(fs.readFileSync(path.join(root, "settings/EditorSettings.json"), "utf8")).textureType, 2,
    "New images must default to sprite textures in the IDE");
for (const file of [...files, ...walk(path.join(root, "src"))].filter(file => file.endsWith(".meta"))) {
    const meta = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!meta.uuid) continue;
    assert.ok(!uuidMap.has(meta.uuid), `Duplicate asset UUID: ${file}`);
    uuidMap.set(meta.uuid, file.slice(0, -5));
}
const depMap = {};
const prefabs = createPrefabResolver();
for (const file of files.filter(file => file.endsWith(".lh")).sort()) {
    const prefab = JSON.parse(fs.readFileSync(file, "utf8")), deps = new Set(), ids = new Set();
    const visit = value => {
        if (typeof value === "string" && value.startsWith("ui/")) {
            assert.ok(fs.existsSync(path.join(assets, value)), `${relative(file)} missing ${value}`);
            deps.add(value);
        } else if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object") {
            if (value._$id) {
                assert.ok(!ids.has(value._$id), `${relative(file)} duplicate node ${value._$id}`);
                ids.add(value._$id);
            }
            if (value._$uuid) {
                const target = uuidMap.get(value._$uuid);
                assert.ok(target && fs.existsSync(target), `${relative(file)} missing UUID ${value._$uuid}`);
                if (target.startsWith(assets + path.sep)) deps.add(relative(target));
            }
            if (value._$prefab) deps.add(prefabs.prefabPath(value._$prefab));
            if (value.scriptPath) {
                assert.ok(fs.existsSync(path.resolve(assets, value.scriptPath)), `Missing script ${value.scriptPath}`);
                const meta = JSON.parse(fs.readFileSync(path.resolve(assets, value.scriptPath) + ".meta", "utf8"));
                assert.equal(value._$type, meta.uuid, `Script UUID mismatch in ${relative(file)}`);
            }
            Object.values(value).forEach(visit);
        }
    };
    visit(prefab);
    const expandedIds = new Set(), expandedRefs = [];
    const checkExpanded = value => {
        if (!value || typeof value !== "object") return;
        if (value._$id) {
            assert.ok(!expandedIds.has(value._$id), `${relative(file)} duplicate expanded node ${value._$id}`);
            expandedIds.add(value._$id);
        }
        if (value._$ref) expandedRefs.push(value._$ref);
        Object.values(value).forEach(checkExpanded);
    };
    checkExpanded(prefabs.expand(relative(file)));
    for (const ref of expandedRefs) assert.ok(expandedIds.has(ref), `${relative(file)} unresolved node ${ref}`);
    // Include runtime-switched icons, which are deliberately not all in the hierarchy.
    const dynamicDirectory = file.includes(`${path.sep}expedition${path.sep}`)
        ? "ui/atlas/module/expedition/" : file.includes(`${path.sep}skillBattle${path.sep}`)
            ? "ui/atlas/module/skillBattle/" : null;
    if (dynamicDirectory) for (const image of files.filter(candidate =>
        relative(candidate).startsWith(dynamicDirectory) && candidate.endsWith(".png"))) deps.add(relative(image));
    if (file.includes(`${path.sep}skillBattle${path.sep}`)) for (const image of files.filter(candidate =>
        (relative(candidate).startsWith("ui/atlas/module/inventory/") ||
            relative(candidate).startsWith("ui/texture/inventory/") ||
            relative(candidate).startsWith("ui/image/naxu/") ||
            relative(candidate).startsWith("ui/image/expeditionNodes/")) && candidate.endsWith(".png"))) deps.add(relative(image));
    if (relative(file) === "ui/prefab/module/expedition/SkillBattleMapView.lh")
        for (const image of files.filter(candidate =>
            relative(candidate).startsWith("ui/image/expeditionNodes/") && candidate.endsWith(".png"))) deps.add(relative(image));
    depMap[relative(file)] = [...deps].sort();
}
function checkCycles(file, stack = []) {
    assert.ok(!stack.includes(file), `Cyclic UI dependency: ${[...stack, file].join(" -> ")}`);
    for (const dependency of depMap[file] || []) {
        if (dependency.endsWith(".lh")) checkCycles(dependency, [...stack, file]);
    }
}
for (const file of Object.keys(depMap)) checkCycles(file);
for (const file of files.filter(file => /\.(png|lh)$/.test(file))) {
    assert.ok(fs.existsSync(file + ".meta"), `Missing asset metadata: ${relative(file)}`);
    if (!referencesOnly) assert.doesNotMatch(relative(file), /segment_\d|source_original|generatedRoute|\/ui\/|拷贝/,
        `Unorganized runtime asset ${relative(file)}`);
}
const output = path.join(ui, "ui-deps.json");
if (write) fs.writeFileSync(output, JSON.stringify(depMap, null, 2) + "\n");
else assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")), depMap,
    "UI dependency map is stale; run node tools/ui-assets.cjs --write");
console.log(`UI assets: ${Object.keys(depMap).length} prefabs, ${files.filter(file => file.endsWith(".png")).length} images; UUIDs, bindings, paths and dependency map verified.`);
