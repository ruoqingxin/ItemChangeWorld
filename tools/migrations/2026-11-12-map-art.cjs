const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
const art = "ui/atlas/module/expedition/handpainted/";
const mapFile = path.join(root, "assets/ui/prefab/module/expedition/SkillBattleMapView.lh");
const sourceFile = path.join(root, "assets/ui/prefab/common/inventory/InventorySource.lh");
const map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
const source = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
const nodes = new Map();
const collect = node => {
    if (node.name) nodes.set(node.name, node);
    (node._$child || []).forEach(collect);
};
collect(map);
const mapper = map._$comp.find(c => c.scriptPath?.endsWith("ElementMapper.ts"));
const image = (name, x, y, width, height, file, extra = {}) => ({
    _$id: `map_art_${name}`, _$type: "GImage", name, x, y, width, height,
    mouseEnabled: false, autoSize: false, src: art + file, ...extra,
});
const add = (parent, node, index = parent._$child?.length || 0) => {
    if (nodes.has(node.name)) return;
    (parent._$child ||= []).splice(index, 0, node);
    nodes.set(node.name, node);
    mapper.elements.push({ _$ref: node._$id });
};
const replacements = {
    "panel-64.png": "map-panel.png", "slot-32.png": "map-slot.png",
    "avatar-frame-80.png": "map-avatar-frame.png",
    "button-normal-64x48.png": "map-button-normal.png",
    "button-hover-64x48.png": "map-button-hover.png",
    "button-pressed-64x48.png": "map-button-pressed.png",
    "button-disabled-64x48.png": "map-button-disabled.png",
};
for (const node of nodes.values()) {
    if (!node.src?.startsWith("ui/atlas/common/foundation/")) continue;
    const file = replacements[path.posix.basename(node.src)];
    assert.ok(file, `Unmapped map foundation: ${node.src}`);
    node.src = art + file;
}
for (const [name, file] of [
    ["mapClockGlyph", "map-icon-clock.png"],
    ["mapAvatarPlaceholder", "map-player-portrait.png"],
    ["expStorageActionIcon", "map-icon-inventory.png"],
    ["expBuildActionIcon", "map-icon-build.png"],
    ["expAbandonActionIcon", "map-icon-exit.png"],
]) Object.assign(nodes.get(name), { _$type: "GImage", autoSize: false, src: art + file });
// Keep the painted portrait inside its frame, with the frame drawn over its edges.
nodes.get("mapAvatarFrame").zOrder = 1;
Object.assign(nodes.get("mapAvatarPlaceholder"), { x: 16, y: 26, width: 52, height: 52 });
for (const key of ["Hp", "Mp", "Stamina", "Weight"]) {
    const fill = nodes.get(`map${key}Fill`);
    Object.assign(fill, { _$type: "GImage", autoSize: false,
        src: `${art}map-meter-${key.toLowerCase()}.png` });
    let track = nodes.get(`map${key}Track`);
    if (!track) {
        const area = nodes.get("mapPlayerArea");
        track = image(`map${key}Track`, fill.x, fill.y, fill.width, fill.height, "map-meter-track.png");
        add(area, track, area._$child.indexOf(fill));
    } else Object.assign(track, { _$type: "GImage", autoSize: false, src: art + "map-meter-track.png" });
}
nodes.get("expPlayer").height = 160;
add(nodes.get("expPlayer"), image("expPlayerAvatar", 30, 90, 56, 70, "map-player-traveler.png"));
add(nodes.get("expeditionRoot"), image("mapRouteTexture", 0, 0, 64, 32, "map-route-dash.png",
    { visible: false }));
const findSource = node => node.name === "expSearchSpinner" ? node :
    (node._$child || []).map(findSource).find(Boolean);
const spinner = findSource(source);
assert.ok(spinner, "Shared source spinner must exist");
spinner._$child = [image("expSearchSpinnerArt", 22, 22, 44, 44, "inventory-search-spinner.png",
    { anchorX: 0.5, anchorY: 0.5 })];
for (const [file, data] of [[mapFile, map], [sourceFile, source]])
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
console.log("Updated map artwork bindings and shared source search spinner; no gameplay or save changes.");
