const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const directory = path.join(__dirname, "../assets/ui/prefab/module/skillBattle");
const views = {
    "SkillBattleStartView.lh": {
        required: ["result", "newRun", "reset", "warehouse0", "report", "reportBody", "resultTitle"],
        buttons: ["newRun", "reset", "resetYes", "resetNo", "report", "summary", "actions",
            "olderReport", "newerReport", "reportClose", "previousPage", "nextPage", "build",
            ...Array.from({ length: 6 }, (_, i) => `warehouse${i}`)],
        excluded: ["enemy", "player", "numbers", "skill1", "pouch0", "enemyHpBar", "lootSlot0"],
    },
    "SkillBattleBattleView.lh": {
        required: ["result", "enemy", "player", "numbers", "skill1", "pouch0", "pouchIcon0",
            "battleReport", "enemyHpBar", "playerHpBar", "upgrade0", "continue", "extract", "lootSlot0"],
        buttons: ["battleReport", "loot", "skip", "cancel", "confirm", "continue", "extract", "hub",
            "lootClose", "report", "summary", "actions", "olderReport", "newerReport", "reportClose",
            "previousPage", "nextPage", "build", ...Array.from({ length: 4 }, (_, i) => `skill${i + 1}`),
            ...Array.from({ length: 5 }, (_, i) => `pouch${i}`), ...Array.from({ length: 3 }, (_, i) => `upgrade${i}`)],
        excluded: ["newRun", "warehouse0", "reset"],
    },
    "SkillBattleSettlementView.lh": {
        required: ["result", "lootClose", "hub", "lootSlot0", "report", "reportBody", "resultTitle"],
        buttons: ["lootClose", "hub", "report", "summary", "actions", "olderReport", "newerReport",
            "reportClose", "previousPage", "nextPage", "build"],
        excluded: ["enemy", "player", "numbers", "skill1", "pouch0", "enemyHpBar", "warehouse0", "newRun"],
    },
};

const allFiles = Object.keys(views);
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
    if (nodes.has("inventoryRoot")) {
        const cells = [...nodes].filter(([name]) => /^inv(?:EquipCell_(?:weapon|container)_\d+|SourceCell\d+|Cell_(?:battle|safe|bag)_\d+)$/.test(name));
        for (const [name,node] of cells)
            assert.deepEqual([node.width,node.height],[54,54],`${file} ${name} must use the shared 56px pitch`);
        for (const [prefix,count,cols,panelName] of [
            ["invCell_battle_",5,5,"invLeftPanel"],["invCell_safe_",2,2,"invLeftPanel"],
            ["invCell_bag_",48,8,"invBagPanel"],["invSourceCell",56,8,"invRightPanel"],
        ]) {
            const origin = nodes.get(prefix+"0"), panel = nodes.get(panelName);
            for (let i=0;i<count;i++) {
                const cell = nodes.get(prefix+i);
                assert.deepEqual([cell.x,cell.y],[origin.x+i%cols*56,origin.y+Math.floor(i/cols)*56],
                    `${file} ${prefix}${i} shared pitch`);
                assert.ok(cell.x>=panel.x && cell.y>=panel.y &&
                    cell.x+cell.width<=panel.x+panel.width && cell.y+cell.height<=panel.y+panel.height,
                    `${file} ${prefix}${i} stays inside its panel`);
            }
        }
        const left = nodes.get("invLeftPanel"), bag = nodes.get("invBagPanel"), right = nodes.get("invRightPanel");
        assert.ok(left.x+left.width<=bag.x && bag.x+bag.width<=right.x,`${file} storage panels must not overlap`);
        for (const [space,key,rows] of [["weapon","invWeapon",3],["container","invContainer",2]]) {
            const slot = nodes.get(key);
            assert.deepEqual([slot.width,slot.height],[110,rows*56-2],`${file} ${space} actual footprint`);
            for (let i=0;i<2*rows;i++) {
                const cell = nodes.get(`invEquipCell_${space}_${i}`);
                assert.deepEqual([cell.x,cell.y],[slot.x+i%2*56,slot.y+Math.floor(i/2)*56],
                    `${file} ${space} cell ${i}`);
            }
        }
        for (const key of ["invWeapon","invContainer","invHeld",
            ...Array.from({length:60},(_,i)=>`invItem${i}`),...Array.from({length:56},(_,i)=>`invList${i}`)]) {
            const n=nodes.get(key),outline=nodes.get(key+"Selection");
            assert.ok(outline && outline.mouseEnabled===false,`${file} ${key} independent selection outline`);
            assert.equal(n._$child[2]._$type,"GImage",`${file} ${key} retains the item icon index`);
            if (!["invWeapon","invContainer"].includes(key))
                assert.equal(n._$child[0].src,"ui/atlas/module/inventory/quality-1.png",`${file} ${key} default quality frame`);
        }
        for (const key of ["invGhost",...Array.from({length:48},(_,i)=>`invDragCell${i}`)])
            assert.equal(nodes.get(key).src,"ui/atlas/module/inventory/quality-1.png",
                `${file} ${key} must not restore the old circular feedback frame`);
    }

    assert.equal(prefab.width, 1280, `${file} design width`);
    assert.equal(prefab.height, 720, `${file} design height`);
    assert.deepEqual(outOfBounds, [], `${file} nodes must use finite in-bounds landscape coordinates`);
    assert.equal(ids.size, allIds.length, `${file} has duplicate Laya node IDs`);
    assert.ok(prefab["_$comp"]?.some(component =>
        component.scriptPath?.endsWith("/ElementMapper.ts")),
    `${file} must use ElementMapper`);
    for (const ref of refs) assert.ok(ids.has(ref), `${file} has an unresolved ElementMapper reference ${ref}`);
    viewNodeCounts[file] = names.size;

    const expectations = views[file];
    for (const name of expectations.required)
        assert.ok(names.has(name), `${file} is missing prefab node ${name}`);
    for (const name of expectations.excluded)
        assert.ok(!names.has(name), `${file} must not contain unused node ${name}`);
    for (const name of expectations.buttons)
        assert.ok(nodes.get(name)?._$child?.length > 0, `${file} button ${name} must retain its prefab label child`);
    if (file === "SkillBattleBattleView.lh") {
        const cancel = nodes.get("cancel"), confirm = nodes.get("confirm");
        assert.notDeepEqual([cancel.x, cancel.y, cancel.width, cancel.height],
            [confirm.x, confirm.y, confirm.width, confirm.height],
            "cancel and confirm must not occupy the same hit area");
        assert.ok(nodes.get("enemyHpBar").x + nodes.get("enemyHpBar").width <= nodes.get("build").x,
            "enemy HP bar must not overlap the action toolbar");
        for (let index = 0; index < 5; index++)
            assert.equal(nodes.get(`pouchIcon${index}`).autoSize, false, "icons must keep authored dimensions");
        for (let index = 0; index < 5; index++)
            assert.equal(nodes.get(`pouchQuality${index}`).src,"ui/atlas/module/inventory/quality-1.png",
                "battle item icons retain a quality frame");
        assert.ok(nodes.get("pouch4").x + nodes.get("pouch4").width <= confirm.x,
            "pouch hit areas must not overlap confirm");
    }
    viewNames.push([...names].sort().join("|"));
}

assert.equal(new Set(viewNames).size, Object.keys(views).length, "each view must have a distinct node tree");
for (const role of ["Start", "Battle", "Settlement"]) {
    const source = fs.readFileSync(path.join(__dirname,
        `../src/script/module/skillBattle/view/SkillBattle${role}View.ts`), "utf8");
    assert.match(source, /SkillBattleUISession\.createPanel\(/, `${role} production view must use the shared new-kernel panel factory`);
    assert.doesNotMatch(source, /getExpedition\(/, `${role} must not initialize the legacy save or rules`);
}
for(let quality=1;quality<=6;quality++){
    const name=`quality-${quality}.png`,file=path.join(__dirname,"../assets/ui/atlas/module/inventory",name);
    const reference=path.join(__dirname,"../art/reference/cultivation/frames",name);
    assert.deepEqual(fs.readFileSync(file),fs.readFileSync(reference),`${name} must use the supplied original PNG`);
    const meta=JSON.parse(fs.readFileSync(file+".meta","utf8"));
    assert.deepEqual(meta.importer.sizeGrid,[8,8,8,8,0],`${name} nine-slice borders`);
}
const sessionSource = fs.readFileSync(path.join(__dirname,
    "../src/script/module/skillBattle/view/SkillBattleUISession.ts"), "utf8");
assert.match(sessionSource, /new NewBuildPanel\(/, "default factory must use the new construction panel");
assert.match(sessionSource, /static previewSingleTrial = false/, "production entry must default to stage two");
const buildPanel = fs.readFileSync(path.join(__dirname,
    "../src/script/module/skillBattle/view/NewBuildPanel.ts"), "utf8");
assert.match(buildPanel, /extends NewBattlePanel/, "construction must retain the existing battle projection");
assert.doesNotMatch(buildPanel, /SkillBattleFormulaUtils|ExpeditionManager|stoneItemUid/);
const newPanel = fs.readFileSync(path.join(__dirname,
    "../src/script/module/skillBattle/view/NewBattlePanel.ts"), "utf8");
assert.doesNotMatch(newPanel, /SkillBattleFormulaUtils|ExpeditionManager|stoneItemUid/);
assert.match(newPanel, /"skill1", "skill2", "skill3", "skill4", "upgrade0"/,
    "two universal actions and three borrowed active slots must remain distinct");
const panelSource = fs.readFileSync(path.join(__dirname,
    "../src/script/module/skillBattle/view/SkillBattlePanel.ts"), "utf8");
const resizeBlock = panelSource.slice(panelSource.indexOf("resizeTo("), panelSource.indexOf("private continueNext"));
assert.doesNotMatch(resizeBlock, /this\.root\.scale\(/, "runtime layout must not scale the SkillBattle root");
assert.match(resizeBlock, /this\.root\.scaleX\s*=\s*1/, "runtime layout must pin root scaleX to 1");
assert.match(resizeBlock, /this\.root\.scaleY\s*=\s*1/, "runtime layout must pin root scaleY to 1");
assert.match(panelSource, /bind\("build", \(\) => this\.openBuild\(\)\)/,
    "every role view must bind the authored build button");
assert.match(panelSource, /combatButtons = \["battleReport", "loot", "build"/,
    "loot and build must remain visible in the combat action chrome");
for (const action of ["claimActiveCandidate", "skipActiveChoice", "replaceActive", "strengthenActive", "claimPassive"])
    assert.match(panelSource, new RegExp(`this\\.expedition\\.${action}\\(`),
        `build panel must wire ${action}`);

const mapDirectory = path.join(__dirname, "../assets/ui/prefab/module/expedition");
const mapPrefab = JSON.parse(fs.readFileSync(path.join(mapDirectory, "SkillBattleMapView.lh"), "utf8"));
const mapNames = new Set(), mapIds = new Set(), mapRefs = [], mapOutOfBounds = [];
const visitMap = (node, parentWidth = mapPrefab.width, parentHeight = mapPrefab.height) => {
    if (!node || typeof node !== "object") return;
    if (node.name) mapNames.add(node.name);
    if (node._$id) {
        assert.ok(!mapIds.has(node._$id), `Map prefab has duplicate node ID ${node._$id}`);
        mapIds.add(node._$id);
    }
    if (node._$ref) mapRefs.push(node._$ref);
    if (node.name && node.name !== "SkillBattleMapView") {
        const x = node.x ?? 0, y = node.y ?? 0, width = node.width ?? 0, height = node.height ?? 0;
        const left = x - width * (node.anchorX || 0), top = y - height * (node.anchorY || 0);
        if (left < 0 || top < 0 || left + width > parentWidth || top + height > parentHeight)
            mapOutOfBounds.push(node.name);
    }
    for (const child of node._$child || []) visitMap(child, node.width || parentWidth, node.height || parentHeight);
};
visitMap(mapPrefab);
assert.equal(mapPrefab.width, 1280);
assert.equal(mapPrefab.height, 720);
assert.deepEqual(mapOutOfBounds, []);
for (const name of ["mapBackground", "mapTint", "mapTopBar", "mapStatusPanel", "mapArea", "mapEdges",
    "mapNodes", "mapInfoPanel", "mapTitle", "mapTimer", "mapLife", "mapDurability", "mapBuild",
    "mapSupplies", "mapProgress", "nodeType", "nodeTitle", "nodeDetail", "nodeHint", "mapNotice",
    "mapLegend", "mapConfirm", "mapCancel", "mapBuildButton"])
    assert.ok(mapNames.has(name), `Map prefab is missing ${name}`);
for (const name of ["mapConfirm", "mapCancel", "mapBuildButton"]) {
    const node = (() => {
        let found;
        const find = value => {
            if (value?.name === name) found = value;
            for (const child of value?._$child || []) find(child);
        };
        find(mapPrefab);
        return found;
    })();
    assert.ok(node?._$child?.length > 0, `Map button ${name} must retain its label child`);
}
for (const ref of mapRefs) assert.ok(mapIds.has(ref), `Map prefab has unresolved ref ${ref}`);
const mapPanelSource = fs.readFileSync(path.join(__dirname,
    "../src/script/module/expedition/view/SkillBattleMapPanel.ts"), "utf8");
for (const action of ["enterMapNode", "extractMap", "expireMap", "mapCanEnter"])
    assert.match(mapPanelSource, new RegExp(`this\\.expedition\\.${action}\\(`),
        `Map panel must wire ${action}`);
assert.match(mapPanelSource, /dashedLine\(/, "Map routes must use the authored dashed route style");
console.log(`Skill battle prefabs: distinct role-based nodes verified (${Object.entries(viewNodeCounts)
    .map(([file, count]) => `${file}: ${count}`).join(", ")}, SkillBattleMapView: ${mapNames.size}).`);
