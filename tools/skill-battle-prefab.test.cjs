const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const directory = path.join(__dirname, "../assets/ui/prefab/module/skillBattle");
const views = {
    "SkillBattleStartView.lh": {
        required: ["result", "newRun", "reset", "warehouse0", "report", "reportBody", "resultTitle"],
        buttons: ["newRun", "reset", "resetYes", "resetNo", "report", "summary", "actions",
            "olderReport", "newerReport", "reportClose", "previousPage", "nextPage",
            ...Array.from({ length: 6 }, (_, i) => `warehouse${i}`)],
        excluded: ["enemy", "player", "numbers", "skill1", "pouch0", "enemyHpBar", "lootSlot0"],
    },
    "SkillBattleBattleView.lh": {
        required: ["result", "enemy", "player", "numbers", "skill1", "pouch0", "pouchIcon0",
            "battleReport", "enemyHpBar", "playerHpBar", "upgrade0", "continue", "extract", "lootSlot0"],
        buttons: ["battleReport", "loot", "skip", "cancel", "confirm", "continue", "extract", "hub",
            "lootClose", "report", "summary", "actions", "olderReport", "newerReport", "reportClose",
            "previousPage", "nextPage", ...Array.from({ length: 4 }, (_, i) => `skill${i + 1}`),
            ...Array.from({ length: 5 }, (_, i) => `pouch${i}`), ...Array.from({ length: 3 }, (_, i) => `upgrade${i}`)],
        excluded: ["newRun", "warehouse0", "reset"],
    },
    "SkillBattleSettlementView.lh": {
        required: ["result", "lootClose", "hub", "lootSlot0", "report", "reportBody", "resultTitle"],
        buttons: ["lootClose", "hub", "report", "summary", "actions", "olderReport", "newerReport",
            "reportClose", "previousPage", "nextPage"],
        excluded: ["enemy", "player", "numbers", "skill1", "pouch0", "enemyHpBar", "warehouse0", "newRun"],
    },
};

const allFiles = ["SkillBattleView.lh", ...Object.keys(views)];
const viewNames = [];
const viewNodeCounts = {};
for (const file of allFiles) {
    const prefab = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
    const ids = new Set();
    const allIds = [];
    const refs = [];
    const names = new Set();
    const nodes = new Map();
    const outOfBounds = [];
    const visit = node => {
        if (Array.isArray(node)) {
            node.forEach(visit);
            return;
        }
        if (!node || typeof node !== "object") return;
        if (node.name) { names.add(node.name); nodes.set(node.name, node); }
        if (node["_$id"]) {
            ids.add(node["_$id"]);
            allIds.push(node["_$id"]);
        }
        if (node["_$ref"]) refs.push(node["_$ref"]);
        Object.values(node).forEach(visit);
    };
    const validateBounds = (node, parentWidth = prefab.width, parentHeight = prefab.height) => {
        if (!node || typeof node !== "object") return;
        if (node.name && node !== prefab) {
            const x = node.x ?? 0, y = node.y ?? 0;
            const width = node.width ?? 0, height = node.height ?? 0;
            if ((node.x !== undefined && !Number.isFinite(node.x)) ||
                (node.y !== undefined && !Number.isFinite(node.y)) ||
                !Number.isFinite(x) || !Number.isFinite(y) ||
                !Number.isFinite(width) || !Number.isFinite(height) ||
                x < 0 || y < 0 || x + width > parentWidth || y + height > parentHeight) {
                outOfBounds.push(node.name);
            }
        }
        for (const key of ["scaleX", "scaleY"]) {
            if (node === prefab && node[key] != null && node[key] !== 1) {
                throw new Error(`${file} root must not be scaled (${key}=${node[key]})`);
            }
        }
        for (const child of node._$child || []) {
            validateBounds(child, node.width || parentWidth, node.height || parentHeight);
        }
    };
    visit(prefab);
    validateBounds(prefab);

    assert.equal(prefab.width, 1280, `${file} design width`);
    assert.equal(prefab.height, 720, `${file} design height`);
    assert.deepEqual(outOfBounds, [], `${file} nodes must use finite in-bounds landscape coordinates`);
    assert.equal(ids.size, allIds.length, `${file} has duplicate Laya node IDs`);
    assert.ok(prefab["_$comp"]?.some(component =>
        component.scriptPath?.endsWith("/ElementMapper.ts")),
    `${file} must use ElementMapper`);
    for (const ref of refs) assert.ok(ids.has(ref), `${file} has an unresolved ElementMapper reference ${ref}`);
    viewNodeCounts[file] = names.size;

    if (file === "SkillBattleView.lh") {
        for (const name of ["battleBackground", "battleContent", "battleHeader", "battleStage",
            "battleStatus", "battleActions", "battleOverlay"]) {
            assert.ok(names.has(name), `${file} is missing layout node ${name}`);
        }
        continue;
    }

    const expectations = views[file];
    for (const name of expectations.required)
        assert.ok(names.has(name), `${file} is missing prefab node ${name}`);
    for (const name of expectations.excluded)
        assert.ok(!names.has(name), `${file} must not contain unused node ${name}`);
    for (const name of expectations.buttons)
        assert.ok(nodes.get(name)?._$child?.length > 0, `${file} button ${name} must retain its prefab label child`);
    viewNames.push([...names].sort().join("|"));
}

assert.equal(new Set(viewNames).size, Object.keys(views).length, "each view must have a distinct node tree");
const panelSource = fs.readFileSync(path.join(__dirname,
    "../src/script/module/skillBattle/view/SkillBattlePanel.ts"), "utf8");
const resizeBlock = panelSource.slice(panelSource.indexOf("resizeTo("), panelSource.indexOf("private continueNext"));
assert.doesNotMatch(resizeBlock, /this\.root\.scale\(/, "runtime layout must not scale the SkillBattle root");
assert.match(resizeBlock, /this\.root\.scaleX\s*=\s*1/, "runtime layout must pin root scaleX to 1");
assert.match(resizeBlock, /this\.root\.scaleY\s*=\s*1/, "runtime layout must pin root scaleY to 1");
console.log(`Skill battle prefabs: distinct role-based nodes verified (${Object.entries(viewNodeCounts)
    .map(([file, count]) => `${file}: ${count}`).join(", ")}).`);
