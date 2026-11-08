const fs = require("node:fs");
const path = require("node:path");

const output = path.join(__dirname, "../assets/ui/prefab/module/expedition/SkillBattleMapView.lh");
const mapperType = "3593fc26-337e-42e3-92dc-1b9c2bb8f988";
let id = 1;
const nextId = prefix => `map${String(id++).padStart(3, "0")}_${prefix}`;
const refs = [];

function add(node) {
    refs.push({ "_$ref": node._$id });
    for (const child of node._$child || []) refs.push({ "_$ref": child._$id });
    return node;
}

function text(name, x, y, width, height, fontSize = 20, align = "left", color = "#ece9dc") {
    return add({
        "_$id": nextId("txt"), "_$type": "GTextField", name, x, y, width, height,
        text: "", fontSize, color, align, valign: "middle", wordWrap: true,
    });
}

function button(name, x, y, width, height, label) {
    const child = {
        "_$id": nextId("btn_txt"), "_$type": "GTextField", name: `${name}Text`, x: 0, y: 0,
        width, height, text: label, fontSize: 18, color: "#ece9dc", align: "center",
        valign: "middle", wordWrap: true,
    };
    return add({ "_$id": nextId("btn"), "_$type": "GWidget", name, x, y, width, height, "_$child": [child] });
}

const background = add({ "_$id": nextId("bg"), "_$type": "GImage", name: "mapBackground",
    x: 0, y: 0, width: 1280, height: 720, src: "ui/texture/lobby/xianxia_hub_bg_v1.png" });
const tint = add({ "_$id": nextId("tint"), "_$type": "GWidget", name: "mapTint", x: 0, y: 0,
    width: 1280, height: 720, alpha: 0.62 });
const topBar = add({ "_$id": nextId("top"), "_$type": "GWidget", name: "mapTopBar", x: 0, y: 0,
    width: 1280, height: 84 });
const statusPanel = add({ "_$id": nextId("status"), "_$type": "GWidget", name: "mapStatusPanel",
    x: 28, y: 108, width: 232, height: 470 });
const mapArea = add({ "_$id": nextId("area"), "_$type": "GWidget", name: "mapArea",
    x: 280, y: 102, width: 704, height: 522 });
const edges = add({ "_$id": nextId("edges"), "_$type": "GWidget", name: "mapEdges",
    x: 280, y: 102, width: 704, height: 522, mouseThrough: true });
const nodes = add({ "_$id": nextId("nodes"), "_$type": "GWidget", name: "mapNodes",
    x: 280, y: 102, width: 704, height: 522, mouseThrough: false });
const infoPanel = add({ "_$id": nextId("info"), "_$type": "GWidget", name: "mapInfoPanel",
    x: 1000, y: 108, width: 252, height: 470 });

const labels = [
    text("mapTitle", 40, 16, 560, 38, 30, "left", "#eadb9e"),
    text("mapSubtitle", 42, 50, 560, 24, 15, "left", "#aab4a7"),
    text("mapTimer", 1010, 18, 226, 42, 28, "right", "#eadb9e"),
    text("mapLife", 50, 134, 190, 30, 18, "left", "#ece9dc"),
    text("mapDurability", 50, 170, 190, 30, 18, "left", "#ece9dc"),
    text("mapBuild", 50, 218, 190, 106, 17, "left", "#8fc7ae"),
    text("mapSupplies", 50, 338, 190, 50, 17, "left", "#ece9dc"),
    text("mapProgress", 50, 406, 190, 64, 16, "left", "#d8bd7c"),
    text("nodeType", 1020, 132, 212, 28, 16, "left", "#8fc7ae"),
    text("nodeTitle", 1020, 170, 212, 54, 24, "left", "#eadb9e"),
    text("nodeDetail", 1020, 232, 212, 150, 16, "left", "#ece9dc"),
    text("nodeHint", 1020, 398, 212, 50, 15, "left", "#aab4a7"),
    text("mapNotice", 300, 632, 620, 44, 16, "center", "#d98c78"),
    text("mapLegend", 300, 580, 620, 34, 15, "center", "#aab4a7"),
];
const mapBuildButton = button("mapBuildButton", 1000, 590, 252, 54, "局内构筑");
const mapCancel = button("mapCancel", 826, 646, 148, 48, "取消");
const mapConfirm = button("mapConfirm", 1000, 652, 252, 48, "前往节点");

const prefab = {
    "_$ver": 1, "_$id": nextId("root"), "_$type": "GWidget", name: "SkillBattleMapView",
    width: 1280, height: 720,
    "_$comp": [{ "_$type": mapperType,
        scriptPath: "../src/script/games/ui/components/ElementMapper.ts",
        adapter: null, elements: refs, mapperType: 2 }],
    "_$child": [background, tint, topBar, statusPanel, mapArea, edges, nodes, infoPanel,
        ...labels, mapBuildButton, mapCancel, mapConfirm],
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(prefab, null, 2)}\n`, "utf8");
const meta = path.join(path.dirname(output), "SkillBattleMapView.lh.meta");
if (!fs.existsSync(meta)) fs.writeFileSync(meta,
    `${JSON.stringify({ uuid: "84eab53e-a22d-4d4e-b8b7-b56de3016a4c" }, null, 2)}\n`, "utf8");
