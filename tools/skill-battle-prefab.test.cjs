const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const { createPrefabResolver } = require("./ui-prefab.cjs");
const prefabs = createPrefabResolver();
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
    const prefab = prefabs.expand("ui/prefab/module/" + file + ".lh");
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
            const backdrop = parent === prefab && ["screenBackground", "mapBackdropArea"].includes(node.name);
            if (backdrop) {
                assert.ok(x <= 0 && x + node.width >= parent.width && y === 0 && node.height === parent.height,
                    `${file}: extended background must cover the authored page`);
            } else {
                assert.ok(x >= 0 && y >= 0 && x + node.width <= parent.width && y + node.height <= parent.height,
                    `${file}: ${node.name} exceeds ${parent.name}`);
            }
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
    assert.ok(prefab._$child.every(n => ["adapter", "screenBackground", "mapBackdropArea"].includes(n.name)),
        `${file}: only independent backgrounds may sit outside the adapter`);
    assert.equal(prefab._$child.filter(n => n.name === "adapter").length, 1, `${file}: one content adapter`);
    const adapter = nodes.get("adapter"), mapper = prefab._$comp.find(c => c.scriptPath?.endsWith("/ElementMapper.ts"));
    assert.equal(mapper.adapter._$ref, adapter._$id, `${file}: adapter must actually be bound`);
    assert.deepEqual(adapter.relations, [
        { _$type: "Relation", target: { _$ref: prefab._$id }, data: [1, 0, 2, 0] },
    ], `${file}: native Width/Height relations, not the runtime-only Size shorthand`);
    assert.equal(mapper.mapperType, type, `${file}: fullscreen pages and masked popups must be distinct`);
    assert.ok(nodes.has(content), `${file}: missing ${content}`);
    for (const ref of references) assert.ok(ids.has(ref), `${file}: unresolved reference ${ref}`);
    for (const name of ["resetYes","resetNo","olderReport","newerReport"]) {
        if (type === 4) assert.ok(!nodes.has(name), `${file}: embedded popup control ${name}`);
    }
    if (nodes.has("inventoryRoot")) {
        assert.deepEqual(nodes.get("inventoryRoot").relations[0].data, [1, 0, 2, 0]);
        assert.deepEqual(nodes.get("bagArea").relations[0].data, [6, 0, 13, 0]);
        assert.deepEqual(nodes.get("sourceArea").relations[0].data, [9, 0, 13, 0]);
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
        assert.equal(nodes.get("screenBackground")._$type,"GWidget","Map uses viewport-sized repeated drawing, not cover stretching");
        const ground=nodes.get("mapGroundTexture");
        assert.equal(ground.visible,false,"Texture source must not render a second image");
        assert.equal(ground.src,"ui/texture/expedition/ancient-sect-ground.png");
        const image=fs.readFileSync(path.join(root,"assets",ground.src));
        assert.deepEqual([image.readUInt32BE(16),image.readUInt32BE(20)],[768,768],"Keep approved texture at native resolution");
        const meta=JSON.parse(fs.readFileSync(path.join(root,"assets",ground.src+".meta"),"utf8"));
        assert.deepEqual(meta.importer,{textureType:2,sRGB:true,premultiplyAlpha:true});
        assert.equal(nodes.get("expViewport").height,430);
        assert.deepEqual(nodes.get("expeditionRoot").relations[0].data, [1, 0, 2, 0]);
        assert.deepEqual(nodes.get("expViewport").relations[0].data, [1, 0, 13, 0]);
        assert.deepEqual(nodes.get("nodeActionArea").relations[0].data, [9, 0, 13, 0]);
        assert.deepEqual(nodes.get("mapActionsArea").relations[0].data, [1, 0, 16, 0]);
        assert.ok(nodes.get("nodeActionArea")._$child.some(n=>n.name==="expUse"));
        for(let i=1;i<=32;i++) {
            const icon=nodes.get(`expNode${i}Icon`); assert.deepEqual([icon.width,icon.height],[104,104]);
        }
    }
    if (type !== 4) assert.deepEqual(nodes.get(content).relations[0].data, [6, 0, 13, 0],
        `${file}: native centered dialog contents inside a fluid adapter`);
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
const shared = [
    "inventory/InventoryPanel", "inventory/InventoryCarry", "inventory/InventoryBag",
    "inventory/InventorySource", "inventory/InventoryItem", "dialog/PagedReportPanel", "choice/ChoiceSlots",
];
for (const name of shared) {
    const data = prefabs.read(`ui/prefab/common/${name}.lh`);
    assert.equal(data._$type, "GWidget", name);
    assert.ok(!data._$comp?.some(c => c.scriptPath?.endsWith("/ElementMapper.ts")),
        `${name}: fragments inherit the owning page's adapter and mapper, not a second page lifecycle`);
    assert.ok(!data._$child.some(c => c.name === "adapter"), `${name}: no nested fullscreen adapter`);
}
const references = data => {
    const result = [];
    function visit(node) {
        if (node._$prefab) result.push(prefabs.prefabPath(node._$prefab));
        (node._$child || []).forEach(visit);
    }
    visit(data);
    return result;
};
for (const name of ["Start", "Inventory", "Settlement"]) {
    const file = `ui/prefab/module/skillBattle/SkillBattle${name}View.lh`;
    assert.ok(references(prefabs.read(file)).includes("ui/prefab/common/inventory/InventoryPanel.lh"),
        `${name}: use a native shared storage prefab, not an inline copy`);
    const mapper = prefabs.read(file)._$comp.find(c => c.scriptPath?.endsWith("/ElementMapper.ts"));
    assert.ok(mapper.elements.some(e => Array.isArray(e._$ref) && e._$ref.length >= 4),
        `${name}: native references must cross storage, region and item scopes`);
}
const panelRefs = references(prefabs.read("ui/prefab/common/inventory/InventoryPanel.lh"));
for (const name of ["InventoryCarry", "InventoryBag", "InventorySource"])
    assert.ok(panelRefs.includes(`ui/prefab/common/inventory/${name}.lh`), `Shared storage composes ${name}`);
const itemRefs = [
    ...panelRefs, ...references(prefabs.read("ui/prefab/common/inventory/InventorySource.lh")),
].filter(file => file === "ui/prefab/common/inventory/InventoryItem.lh");
assert.equal(itemRefs.length, 117, "One item prefab supplies 60 carried items, 56 source items and the drag ghost");
for (const [names, common] of [
    [["Report", "BuildInfo"], "dialog/PagedReportPanel"],
    [["Build", "Trial"], "choice/ChoiceSlots"],
]) {
    for (const name of names)
        assert.ok(references(prefabs.read(`ui/prefab/module/skillBattle/SkillBattle${name}View.lh`))
            .includes(`ui/prefab/common/${common}.lh`), `${name}: shared ${common}`);
}
console.log(`Skill battle UI: ${files.length} independent 1280x720 pages/popups; ${shared.length} native common prefabs, scoped bindings, regions, grids and assets verified.`);
