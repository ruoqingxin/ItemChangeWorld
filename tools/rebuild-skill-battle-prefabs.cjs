const fs = require("node:fs");
const path = require("node:path");

const dir = path.join(__dirname, "../assets/ui/prefab/module/skillBattle");
const mapperType = "3593fc26-337e-42e3-92dc-1b9c2bb8f988";
let nextId = 1;
const id = prefix => `sbr${String(nextId++).padStart(3, "0")}${prefix}`;

const labels = {
    start: ["overlayBrand", "currency", "resultTitle", "resultDetail", "section", "overlayMessage",
        "choiceTitle", "reportBody", "page"],
    battle: ["brand", "round", "upgrades", "enemyName", "enemyBlock", "enemyHp", "intent", "interrupt",
        "event", "playerName", "durability", "playerHp", "playerBlock", "qi", "previewTitle", "preview",
        "overlayBrand", "currency", "resultTitle", "resultDetail", "section", "overlayMessage",
        "choiceTitle", "reportBody", "page", ...Array.from({ length: 6 }, (_, i) => `lootSlot${i}`)],
    settlement: ["overlayBrand", "currency", "resultTitle", "resultDetail", "section", "overlayMessage",
        "choiceTitle", "reportBody", "page", ...Array.from({ length: 6 }, (_, i) => `lootSlot${i}`)],
};
const buttonGroups = {
    start: ["previousPage", "nextPage", "newRun", "reset", "resetYes", "resetNo", "report", "summary",
        "actions", "olderReport", "newerReport", "reportClose", ...Array.from({ length: 6 }, (_, i) => `warehouse${i}`)],
    battle: ["battleReport", "loot", "skip", "cancel", "confirm", "continue", "extract", "hub", "lootClose",
        "report", "summary", "actions", "olderReport", "newerReport", "reportClose", "previousPage", "nextPage",
        ...Array.from({ length: 4 }, (_, i) => `skill${i + 1}`), ...Array.from({ length: 5 }, (_, i) => `pouch${i}`),
        ...Array.from({ length: 3 }, (_, i) => `upgrade${i}`)],
    settlement: ["lootClose", "hub", "report", "summary", "actions", "olderReport", "newerReport", "reportClose",
        "previousPage", "nextPage"],
};

function text(name, x = 30, y = 0, width = 660, height = 56) {
    return { "_$id": id("txt"), "_$type": "GTextField", name, x, y, width, height, text: "",
        zOrder: 1, fontSize: 22, color: "#e3e8de", align: "center", valign: "middle", wordWrap: true };
}
function button(name, index) {
    const p = buttonPosition(name, index);
    const label = text(`${name}Text`, name.startsWith("pouch") ? 32 : 0, 0,
        name.startsWith("pouch") ? p.width - 36 : p.width, p.height);
    if (name.startsWith("pouch")) label.fontSize = 18;
    return { "_$id": id("btn"), "_$type": "GWidget", name, ...p, "_$child": [label] };
}
function buttonPosition(name, index) {
    const size = { width: 176, height: 54 };
    if (name.startsWith("skill")) {
        const i = Number(name.slice(5)) - 1;
        return { x: 454 + i * 190, y: 614, width: 180, height: 76 };
    }
    if (name.startsWith("pouch")) {
        const i = Number(name.slice(5));
        return { x: 454 + i * 122, y: 530, width: 112, height: 68 };
    }
    if (name.startsWith("upgrade")) return { x: 80 + Number(name.slice(7)) * 390, y: 386, width: 360, height: 76 };
    if (name.startsWith("warehouse")) {
        const i = Number(name.slice(9));
        return { x: 170 + (i % 3) * 320, y: 366 + Math.floor(i / 3) * 100, width: 290, height: 76 };
    }
    const positions = {
        battleReport: [1034, 24], loot: [1034, 88], skip: [1034, 152],
        cancel: [1060, 530], confirm: [1060, 530],
        continue: [800, 530], extract: [1000, 530], hub: [800, 614],
        lootClose: [1000, 614], newRun: [450, 560], reset: [650, 560],
        resetYes: [440, 560], resetNo: [640, 560],
        previousPage: [340, 568], nextPage: [540, 568],
        report: [80, 560], summary: [420, 560], actions: [610, 560],
        olderReport: [80, 614], newerReport: [270, 614], reportClose: [1034, 614],
    };
    const [x, y] = positions[name] || [80 + (index % 3) * 390, 560 + Math.floor(index / 3) * 58];
    return { x, y, ...size };
}
function label(name, index, role) {
    const isOverlay = ["overlayBrand", "currency", "resultTitle", "resultDetail", "section", "overlayMessage",
        "choiceTitle", "reportBody", "page"].includes(name) || name.startsWith("lootSlot");
    let x = 30, y = 24 + index * 48, width = 660, height = 44;
    if (role === "battle" && !isOverlay) {
        const positions = {
            brand: [24, 12, 360, 52], round: [420, 16, 270, 46], upgrades: [704, 16, 300, 46],
            enemyName: [720, 128, 430, 50], enemyBlock: [900, 184, 220, 42],
            enemyHp: [720, 224, 430, 42], intent: [410, 232, 280, 46], interrupt: [410, 280, 280, 42],
            event: [390, 342, 500, 44], playerName: [120, 412, 430, 46],
            durability: [30, 476, 390, 40], playerHp: [30, 516, 390, 40],
            playerBlock: [30, 554, 390, 38], qi: [30, 594, 390, 38],
            previewTitle: [454, 466, 500, 36], preview: [454, 486, 500, 42],
        };
        [x, y, width, height] = positions[name] || [30, y, 660, 44];
    } else if (isOverlay) {
        const positions = {
            overlayBrand: [24, 16, 420, 48], currency: [960, 20, 296, 38],
            resultTitle: [290, 72, 700, 58], resultDetail: [250, 136, 780, 112],
            section: [150, 264, 980, 38], overlayMessage: [190, 490, 900, 40],
            choiceTitle: [250, 326, 780, 48], reportBody: [240, 190, 800, 330],
            page: [570, 530, 140, 38],
        };
        [x, y, width, height] = positions[name] || (name.startsWith("lootSlot")
            ? [220 + Number(name.slice(8)) * 145, 390, 130, 84] : [30, y, 660, 44]);
    }
    if (name === "resultDetail") height = 112;
    if (name === "reportBody") height = 280;
    return { "_$id": id("lbl"), "_$type": "GTextField", name, x, y, width,
        height, text: "", zOrder: 1,
        fontSize: name === "brand" || name === "resultTitle" ? 32 : 22, color: "#e3e8de",
        align: name === "brand" || name === "section" ? "left"
            : name === "currency" ? "right" : "center",
        valign: "middle", wordWrap: true };
}
function makeView(viewName, role) {
    nextId = 1;
    const children = [];
    const refs = [];
    const add = node => { children.push(node); refs.push({ "_$ref": node._$id }); (node._$child || []).forEach(child => refs.push({ "_$ref": child._$id })); };
    const result = { "_$id": id("res"), "_$type": "GWidget", name: "result", x: 0, y: 0, width: 1280, height: 720, visible: false };
    add(result);
    labels[role].forEach((name, i) => add(label(name, i, role)));
    if (role === "battle") {
        [["player", 250, 350], ["enemy", 970, 300]].forEach(([name, x, y]) => add({ "_$id": id("actor"), "_$type": "GWidget", name, x, y, width: 1, height: 1 }));
        add({ "_$id": id("num"), "_$type": "GTextField", name: "numbers", x: 770, y: 260, width: 220, height: 60, text: "", fontSize: 28 });
        [["enemyHpBar", 720, 226], ["playerHpBar", 30, 516]].forEach(([name, x, y]) => add({ "_$id": id("bar"), "_$type": "GWidget", name, x, y, width: 430, height: 8 }));
        for (let i = 0; i < 5; i++) add({
            "_$id": id("ico"),
            "_$type": "GImage",
            name: `pouchIcon${i}`,
            x: 458 + i * 122,
            y: 536,
            width: 24,
            height: 24,
        });
    }
    buttonGroups[role].forEach((name, i) => add(button(name, i)));
    if (role === "battle") for (let i = 0; i < 6; i++) add(label(`lootSlot${i}`, 30 + i, role));
    const prefab = { "_$ver": 1, "_$id": id("root"), "_$type": "GWidget", name: viewName, width: 1280, height: 720,
        "_$comp": [{ "_$type": mapperType, scriptPath: "../src/script/games/ui/components/ElementMapper.ts",
            adapter: null, elements: refs, mapperType: 2 }], "_$child": children };
    return prefab;
}

for (const [viewName, role] of [["SkillBattleStartView", "start"], ["SkillBattleBattleView", "battle"], ["SkillBattleSettlementView", "settlement"]]) {
    fs.writeFileSync(path.join(dir, `${viewName}.lh`), `${JSON.stringify(makeView(viewName, role), null, 4)}\n`, "utf8");
}

const wrapper = {
    "_$ver": 1,
    "_$id": "skillbattle-root",
    "_$type": "GWidget",
    name: "SkillBattleView",
    width: 1280,
    height: 720,
    "_$comp": [{
        "_$type": mapperType,
        scriptPath: "../src/script/games/ui/components/ElementMapper.ts",
        adapter: null,
        elements: [],
        mapperType: 2,
    }],
    "_$child": [
        { "_$id": "skillbattle-bg", "_$type": "GWidget", name: "battleBackground", width: 1280, height: 720 },
        {
            "_$id": "skillbattle-content",
            "_$type": "GWidget",
            name: "battleContent",
            width: 1280,
            height: 720,
            mouseThrough: true,
            "_$child": [
                { "_$id": "skillbattle-header", "_$type": "GWidget", name: "battleHeader", width: 1280, height: 88, mouseThrough: true },
                { "_$id": "skillbattle-stage", "_$type": "GWidget", name: "battleStage", x: 0, y: 88, width: 1280, height: 354, mouseThrough: true },
                { "_$id": "skillbattle-status", "_$type": "GWidget", name: "battleStatus", x: 0, y: 442, width: 1280, height: 178, mouseThrough: true },
                { "_$id": "skillbattle-actions", "_$type": "GWidget", name: "battleActions", x: 0, y: 620, width: 1280, height: 100, mouseThrough: true },
            ],
        },
        { "_$id": "skillbattle-overlay", "_$type": "GWidget", name: "battleOverlay", width: 1280, height: 720, visible: false },
    ],
};
fs.writeFileSync(path.join(dir, "SkillBattleView.lh"), `${JSON.stringify(wrapper, null, 4)}\n`, "utf8");
