const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const files = [
    ["skillBattle/SkillBattleStartView", 4, "inventoryRoot"],
    ["skillBattle/SkillBattleInventoryView", 4, "inventoryRoot"],
    ["skillBattle/SkillBattleBuildView", 4, "candidateArea"],
    ["skillBattle/SkillBattleBattleView", 4, "battleActionsArea"],
    ["skillBattle/SkillBattleSettlementView", 4, "inventoryRoot"],
    ["expedition/SkillBattleMapView", 4, "expeditionRoot"],
    ["skillBattle/SkillBattleConfirmView", 2, "dialogArea"],
    ["skillBattle/SkillBattleReportView", 1, "reportDialogArea"],
    ["skillBattle/SkillBattleBuildInfoView", 1, "reportDialogArea"],
    ["skillBattle/SkillBattleTrialView", 4, "candidateArea"],
    ["skillBattle/SkillBattleTrialResultView", 4, "trialResultArea"],
];
for (const [file, type, content] of files) {
    const prefab = JSON.parse(fs.readFileSync(path.join(root, "assets/ui/prefab/module", file + ".lh"), "utf8"));
    const nodes = new Map(), ids = new Set(), references = [], positions = new Map();
    function walk(node, parent, px = 0, py = 0) {
        assert.ok(!ids.has(node._$id), `${file}: duplicate ID ${node._$id}`);
        ids.add(node._$id);
        assert.ok(!nodes.has(node.name), `${file}: duplicate name ${node.name}`);
        nodes.set(node.name, node);
        const x = node.x || 0, y = node.y || 0;
        positions.set(node.name, { x: px + x, y: py + y });
        if (parent) {
            assert.ok([x,y,node.width,node.height].every(Number.isFinite), `${file}: invalid dimensions ${node.name}`);
            assert.ok(x >= 0 && y >= 0 && x + node.width <= parent.width && y + node.height <= parent.height,
                `${file}: ${node.name} exceeds ${parent.name}`);
        }
        for (const child of node._$child || []) walk(child, node, px + x, py + y);
    }
    function refs(value) {
        if (!value || typeof value !== "object") return;
        if (value._$ref) references.push(value._$ref);
        Object.values(value).forEach(refs);
    }
    walk(prefab); refs(prefab);
    assert.deepEqual([prefab.width,prefab.height,prefab.scaleX || 1,prefab.scaleY || 1], [1280,720,1,1], file);
    assert.equal(prefab._$child.length, 1, `${file}: content must be under the adapter`);
    const adapter = nodes.get("adapter"), mapper = prefab._$comp.find(c => c.scriptPath?.endsWith("/ElementMapper.ts"));
    assert.equal(mapper.adapter._$ref, adapter._$id, `${file}: adapter must actually be bound`);
    assert.equal(mapper.mapperType, type, `${file}: fullscreen pages and masked popups must be distinct`);
    assert.ok(nodes.has(content), `${file}: missing ${content}`);
    for (const ref of references) assert.ok(ids.has(ref), `${file}: unresolved reference ${ref}`);
    for (const name of ["resetYes","resetNo","olderReport","newerReport"]) {
        if (type === 4) assert.ok(!nodes.has(name), `${file}: embedded popup control ${name}`);
    }
    if (nodes.has("inventoryRoot")) {
        for (const name of ["expeditionRoot","candidateArea","reportBody"])
            assert.ok(!nodes.has(name), `${file}: must not contain the ${name} page`);
        for (const name of ["equipmentArea","battleItemsArea","safeItemsArea","bagItemsArea","sourceItemsArea","sourcePagesArea","actionsArea"])
            assert.ok(nodes.has(name), `${file}: missing semantic parent ${name}`);
        for (const [prefix,count,cols] of [
            ["invCell_battle_",5,5],["invCell_safe_",2,2],["invCell_bag_",48,8],["invSourceCell",56,8],
        ]) {
            const origin = positions.get(prefix+"0");
            for (let i=0; i<count; i++) {
                const node = nodes.get(prefix+i), position = positions.get(prefix+i);
                assert.deepEqual([node.width,node.height], [54,54], `${file}: uniform cell dimensions`);
                assert.deepEqual([position.x,position.y], [origin.x+i%cols*56,origin.y+Math.floor(i/cols)*56],
                    `${file}: uniform 56px pitch`);
            }
        }
        for (const [name,rows] of [["invWeapon",3],["invContainer",2]]) {
            const node = nodes.get(name); assert.deepEqual([node.width,node.height], [110,rows*56-2]);
        }
        for (const key of ["invWeapon","invContainer","invHeld",
            ...Array.from({length:60},(_,i)=>`invItem${i}`),...Array.from({length:56},(_,i)=>`invList${i}`)]) {
            const n=nodes.get(key);
            assert.equal(n._$child[2]._$type,"GImage",`${file}: stable item icon child index`);
            assert.equal(nodes.get(key+"Selection").mouseEnabled,false,`${file}: independent inert selection frame`);
            if (/^inv(?:Item|List)\d+$/.test(key)) assert.equal(n.visible,false,`${file}: pool must not stack in the editor`);
        }
        const bottom=positions.get("invSourceCell55").y+54;
        for (const name of ["invPrev","invNext","invPage"])
            assert.ok(positions.get(name).y>=bottom,`${file}: pagination clears all seven rows`);
    }
    if (file.endsWith("SkillBattleStartView"))
        assert.ok(!nodes.has("warehouse0"), "Production start is preparation, not a trial/configuration stack");
    if (file.endsWith("SkillBattleBuildView"))
        assert.ok(!nodes.has("inventoryRoot")&&!nodes.has("expeditionRoot"), "Build owns no storage or map subtree");
    if (file.endsWith("SkillBattleMapView")) {
        assert.ok(!nodes.has("inventoryRoot")&&!nodes.has("warehouse0"), "Map owns no other full page");
        assert.equal(nodes.get("expViewport").height,430);
        assert.ok(nodes.get("nodeActionArea")._$child.some(n=>n.name==="expUse"));
        for(let i=1;i<=32;i++) {
            const icon=nodes.get(`expNode${i}Icon`); assert.deepEqual([icon.width,icon.height],[104,104]);
        }
    }
    if (file.endsWith("SkillBattleBattleView")) {
        for(const name of ["reportBody","resultTitle","lootSlot0","inventoryRoot","expeditionRoot"])
            assert.ok(!nodes.has(name),`Battle must not carry ${name}`);
        for(let i=0;i<5;i++)assert.equal(nodes.get(`pouchQuality${i}`).src,"ui/atlas/module/inventory/quality-1.png");
    }
}
for(let quality=1;quality<=6;quality++){
    const name=`quality-${quality}.png`,file=path.join(root,"assets/ui/atlas/module/inventory",name);
    assert.deepEqual(fs.readFileSync(file),fs.readFileSync(path.join(root,"art/reference/cultivation/frames",name)));
    const meta=JSON.parse(fs.readFileSync(file+".meta","utf8"));
    assert.deepEqual(meta.importer.sizeGrid,[8,8,8,8,0]);
}
for(const name of ["start","transit","enemy-normal","enemy-elite","enemy-boss","supply",
    "search","borrow","insight","recovery","extract","battle-loot"]) {
    const meta=JSON.parse(fs.readFileSync(path.join(root,`assets/ui/image/expeditionNodes/node-${name}.png.meta`),"utf8"));
    assert.equal(meta.importer.textureType,2);assert.equal(meta.importer.sRGB,true);assert.equal(meta.importer.premultiplyAlpha,true);
}
for(const role of ["Start","Inventory","Build","Battle","Settlement"]) {
    const source=fs.readFileSync(path.join(root,`src/script/module/skillBattle/view/SkillBattle${role}View.ts`),"utf8");
    assert.match(source,/SkillBattleUISession\.createPanel\(/);
    assert.doesNotMatch(source,/getExpedition\(/,"Formal pages must not instantiate the legacy save");
}
const mapSource=fs.readFileSync(path.join(root,"src/script/module/expedition/view/SkillBattleMapView.ts"),"utf8");
assert.match(mapSource,/SkillBattleUISession\.createPanel\(/);
assert.doesNotMatch(mapSource,/getExpedition\(/);
console.log(`Skill battle UI: ${files.length} independent 1280x720 pages/popups; adapters, regions, grids, bindings and assets verified.`);
