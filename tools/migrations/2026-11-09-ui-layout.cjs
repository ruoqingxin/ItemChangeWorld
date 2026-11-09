// One-time, idempotent resource relocation. Keeps every existing asset UUID.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const moves = new Map();
const add = (from, to) => moves.set(`assets/${from}`, `assets/${to}`);
const mapNames = [
    "status_panel", "route_panel", "node_panel", "search_active", "borrow",
    "battle_inactive", "battle_active", "search_inactive", "elite_active",
    "boss_inactive", "boss_active", "exit", "recovery", "enlightenment",
    "elite_inactive", "back", "meter_track", "health_fill", "durability_fill",
    "timer", "supplies_fill", "unused_slice",
];
for (let index = 0; index < mapNames.length; index++) {
    const old = `ui/atlas/module/battleMap/segment_${String(index + 1).padStart(3, "0")}.png`;
    const name = mapNames[index];
    add(old, [1, 21].includes(index) ? `../art/reference/expedition/${name}.png`
        : [0, 2].includes(index) ? `ui/texture/expedition/${name}.png` : `ui/atlas/module/expedition/${name}.png`);
}
for (const name of ["route_panel", "unused_slice"])
    add(`ui/texture/expedition/${name}.png`, `../art/reference/expedition/${name}.png`);
for (const name of ["skill-1", "skill-2", "skill-3", "skill-4", "heal", "earth_stone", "fire_stone"]) {
    add(`ui/texture/skillBattle/${name}.png`, `ui/atlas/module/skillBattle/${name}.png`);
}
const chrome = path.join(root, "assets/ui/texture/skillBattle/ui");
if (fs.existsSync(chrome)) for (const name of fs.readdirSync(chrome).filter(name => name.endsWith(".png"))) {
    add(`ui/texture/skillBattle/ui/${name}`, name.startsWith("icon_")
        ? `ui/atlas/common/actions/${name}`
        : `ui/texture/skillBattle/${name}`);
}
for (let index = 1; index <= 7; index++) {
    add(`ui/image/itemQualityBg/ui_bg_djk_${index}.png`, `ui/atlas/common/itemQuality/quality_${index}.png`);
}
add("ui/texture/lobby/xianxia_hub_bg_v1.png", "ui/texture/common/hub_background.png");
add("ui/texture/lobby/xianxia_battle_bg_v1.png", "ui/texture/skillBattle/battle_background.png");
add("ui/atlas/module/battleMap/source_original.png", "../art/reference/expedition/source_original.png");
add("ui/generatedRoute/route_map_ui_2048.png", "../art/reference/expedition/route_map_ui_2048.png");
add("ui/texture/组 23 拷贝.png", "../art/reference/legacy/unnamed_ui.png");
for (const name of ["xianxia_hub_bg_1560x720", "xianxia_battle_bg_1560x720"]) {
    add(`ui/texture/lobby/${name}.png`, `../art/reference/backgrounds/${name}.png`);
}

const safe = relative => {
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(root + path.sep)) throw new Error(`Outside project: ${relative}`);
    return absolute;
};
const walk = directory => fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]) : [];
const rewrite = value => {
    if (typeof value === "string") {
        const target = moves.get(`assets/${value}`);
        return target?.startsWith("assets/ui/") ? target.slice(7) : value;
    }
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === "object")
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewrite(child)]));
    return value;
};
for (const [from, to] of moves) {
    const source = safe(from), target = safe(to);
    if (!fs.existsSync(source)) continue;
    if (fs.existsSync(target)) throw new Error(`Refuse overwrite: ${to}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(source, target);
    if (fs.existsSync(source + ".meta")) fs.renameSync(source + ".meta", target + ".meta");
    console.log(`${from} -> ${path.relative(root, target)}`);
}
for (const file of walk(safe("assets/ui/prefab")).filter(file => file.endsWith(".lh"))) {
    const before = JSON.parse(fs.readFileSync(file, "utf8"));
    const after = rewrite(before);
    // All role views cover the landscape canvas, not modal masks.
    if (after.width === 1280 && after.height === 720)
        for (const component of after._$comp || []) if (component.scriptPath?.endsWith("/ElementMapper.ts"))
            component.mapperType = 4;
    if (JSON.stringify(before) !== JSON.stringify(after)) fs.writeFileSync(file, JSON.stringify(after, null, 2) + "\n");
}
const panelFile = safe("src/script/module/expedition/view/SkillBattleMapPanel.ts");
let panel = fs.readFileSync(panelFile, "utf8").replaceAll("ui/atlas/module/battleMap/", "ui/atlas/module/expedition/");
for (let index = 0; index < mapNames.length; index++)
    panel = panel.replaceAll(`segment_${String(index + 1).padStart(3, "0")}.png`, `${mapNames[index]}.png`);
fs.writeFileSync(panelFile, panel);
