const assert = require("node:assert/strict");
const { config, tables, load } = require("./config-fixture.cjs");
const { MarketConfigUtils } = load("module/market/utils/MarketConfigUtils.js");
const { MarketRules } = load("module/market/utils/MarketRules.js");
const { InventoryRules } = load("module/inventory/utils/InventoryRules.js");
const { ExpeditionRules } = load("module/expedition/utils/ExpeditionRules.js");
const { ExpeditionRunManager } = load("module/expedition/manager/ExpeditionRunManager.js");
const { SkillBattleManager } = load("module/skillBattle/manager/SkillBattleManager.js");
const goods = MarketConfigUtils.read(tables), clone = structuredClone;
const bag = { space: "bag", x: 1, y: 0, rotated: true };
let checks = 0;
function test(name, body) { body(); checks++; console.log("通过", name); }
function session() {
    const data = new Map();
    const storage = { fail: false, getItem: key => data.get(key) ?? null,
        setItem(key, value) { if (this.fail) throw Error("写入失败"); data.set(key, value); },
        removeItem: key => data.delete(key) };
    const create = () => new ExpeditionRunManager(new SkillBattleManager(), storage, () => 1000, config);
    const manager = create(); manager.prepare(config, 733);
    return { manager, storage, create };
}
function sell(manager, uid) {
    const state = InventoryRules.bagProjection(config, manager.inventory).state;
    const item = uid ? state.items.find(row => row.uid === uid) : state.items.find(row => row.location.space === "bag");
    return manager.sellMarketItem(item.uid, item.location);
}
function fit(save, offer) {
    const template = config.templates.find(row => row.id === offer.itemId);
    for (const rotated of template.rotate ? [false, true] : [false])
        for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
            const to = { space: "bag", x, y, rotated };
            try {
                const state = ExpeditionRules.apply(config, save.state, { type: "buyMarketGoods", offer, to }, 1000, save.seed).state;
                return { to, state };
            } catch {}
        }
    throw Error("未找到背包落点：" + offer.itemId);
}
test("192件真实商品引用完整，零售价与限购1来自生成表", () => {
    assert.equal(goods.length, 192);
    assert.deepEqual(goods.map(row => row.itemId), config.templates.map(row => row.id));
    assert(goods.every(row => row.price === 0 && row.limitCount === 1 && row.enabled));
});
test("五类货架覆盖全部商品、多格不重叠且九页武器全部可达", () => {
    const state = ExpeditionRules.start(config, 733, "expedition_1000_733"), seen = new Set();
    for (const category of ["weapon", "armor", "accessory", "container", "material"]) {
        const shelf = MarketRules.shelf(config, state, goods, category, 733), cells = new Set();
        assert(shelf.length);
        if (category === "weapon") assert.equal(Math.max(...shelf.map(row => row.slot.page)) + 1, 9);
        for (const { offer, item, slot } of shelf) {
            assert(!seen.has(offer.id)); seen.add(offer.id);
            const t = config.templates.find(row => row.id === item.templateId);
            assert(slot.x + t.width <= 8 && slot.y + t.height <= 7);
            for (let y = slot.y; y < slot.y + t.height; y++) for (let x = slot.x; x < slot.x + t.width; x++) {
                const key = `${slot.page}:${x}:${y}`; assert(!cells.has(key)); cells.add(key);
            }
        }
    }
    assert.equal(seen.size, 192);
});
test("拖动预览不保存，落点购买入背包且装备与预览一致，限购读档保持", () => {
    const { manager, storage, create } = session(), before = manager.archive, text = storage.getItem(ExpeditionRunManager.key);
    const offer = goods[0], preview = MarketRules.preview(config, before.state, offer, 733);
    const command = { type: "buyMarketGoods", offer, to: bag };
    const expected = manager.previewMarketTrade(command).state;
    assert.deepEqual(manager.archive, before); assert.equal(storage.getItem(ExpeditionRunManager.key), text);
    manager.buyMarketGoods(offer.id, goods, bag);
    assert.deepEqual(manager.inventory, expected);
    const bought = manager.inventory.items.find(row => row.uid === preview.uid);
    assert.deepEqual(bought, { ...preview, location: bag });
    assert.equal(manager.inventory.bagColumns, 7);
    assert.equal(manager.inventory.wish, before.state.wish);
    assert.equal(manager.inventory.revision, before.state.revision + 1);
    assert.deepEqual(manager.inventory.items.filter(row => row.location.space === "warehouse"),
        before.state.items.filter(row => row.location.space === "warehouse"));
    const restored = create(); assert.equal(restored.error, "");
    assert.deepEqual(restored.archive, manager.archive);
    assert.throws(() => restored.buyMarketGoods(offer.id, goods, bag), /限购/);
});
test("背包拖入坊市出售按回收价到账，原物移除且重复出售拒绝", () => {
    const { manager, create } = session(), before = manager.archive;
    const item = InventoryRules.bagProjection(config, before.state).state.items.find(row => row.location.space === "bag");
    const price = config.templates.find(row => row.id === item.templateId).recyclePrice;
    manager.previewMarketTrade({ type: "sellMarketItem", uid: item.uid, from: item.location });
    assert.deepEqual(manager.archive, before);
    sell(manager, item.uid);
    const after = manager.archive;
    assert.equal(after.state.items.find(row => row.uid === item.uid).location.space, "consumed");
    assert.equal(after.state.wish, before.state.wish + price);
    assert.equal(after.state.revision, before.state.revision + 1);
    assert.throws(() => manager.sellMarketItem(item.uid, item.location), /背包/);
    assert.deepEqual(manager.archive, after); assert.deepEqual(create().archive, after);
});
test("重复购买、过期拖动和其他标签页覆盖均不增发物品", () => {
    const { manager, create, storage } = session(), other = create(), token = manager.token;
    manager.buyMarketGoods(goods[0].id, goods, bag, token);
    const text = storage.getItem(ExpeditionRunManager.key), before = manager.archive;
    assert.throws(() => manager.buyMarketGoods(goods[1].id, goods, bag, token), /过期/);
    assert.throws(() => manager.buyMarketGoods(goods[0].id, goods, bag), /限购/);
    assert.throws(() => other.buyMarketGoods(goods[1].id, goods, bag), /其他页面/);
    assert.deepEqual(manager.archive, before); assert.equal(storage.getItem(ExpeditionRunManager.key), text);
});
test("买卖保存失败均整笔回滚，重试只成交一次", () => {
    const { manager, storage } = session();
    const item = manager.inventory.items.find(row => row.location.space === "bag");
    let before = manager.archive, text = storage.getItem(ExpeditionRunManager.key);
    storage.fail = true;
    assert.throws(() => sell(manager, item.uid), /写入失败/);
    assert.deepEqual(manager.archive, before); assert.equal(storage.getItem(ExpeditionRunManager.key), text);
    storage.fail = false; sell(manager, item.uid);
    const catalog = [{ ...goods[0], price: 1 }];
    before = manager.archive; text = storage.getItem(ExpeditionRunManager.key); storage.fail = true;
    assert.throws(() => manager.buyMarketGoods(catalog[0].id, catalog, bag), /写入失败/);
    assert.deepEqual(manager.archive, before); assert.equal(storage.getItem(ExpeditionRunManager.key), text);
    storage.fail = false; manager.buyMarketGoods(catalog[0].id, catalog, bag);
    assert.equal(manager.inventory.wish, before.state.wish - 1);
    assert.equal(MarketRules.purchased(manager.inventory, catalog[0].id), 1);
});
test("松手时碰撞、越界、末行空格、非法目标和旋转均拒绝且不扣限购", () => {
    const { manager } = session(), before = manager.archive;
    for (const to of [
        { ...bag, x: 0 }, { ...bag, x: -1 }, { ...bag, x: 5 }, { ...bag, y: 1 },
        { ...bag, rotated: false }, { ...bag, rotated: "true" }, { space: "warehouse" },
        { space: "weapon" }, { space: "safe", x: 0, y: 0, rotated: false }, null,
    ]) {
        assert.throws(() => manager.buyMarketGoods(goods[0].id, goods, to));
        assert.deepEqual(manager.archive, before);
    }
});
test("无背包与负重超限拒绝购买，装备、斗法匣和仓库物品不能直接出售", () => {
    const { manager } = session(), before = manager.archive;
    const heavy = goods.find(row => config.templates.find(t => t.id === row.itemId).weight === 7);
    const reduced = { ...config, weight: { ...config.weight, base: 1 } };
    assert.throws(() => ExpeditionRules.apply(reduced, before.state, { type: "buyMarketGoods", offer: heavy, to: bag }, 1000, 733), /负重/);
    const noBag = clone(before.state);
    noBag.items.find(row => row.location.space === "container").location = { space: "warehouse" };
    assert.throws(() => ExpeditionRules.apply(config, noBag, { type: "buyMarketGoods", offer: goods[0], to: bag }, 1000, 733));
    for (const item of before.state.items.filter(row => row.location.space !== "bag")) {
        assert.throws(() => manager.sellMarketItem(item.uid, item.location), /背包/);
        assert.deepEqual(manager.archive, before);
    }
    const item = before.state.items.find(row => row.location.space === "bag");
    assert.throws(() => manager.sellMarketItem(item.uid, { ...item.location, x: 6 }), /来源/);
});
test("愿力不足、下架、缺少引用和非法售价数量均拒绝", () => {
    const { manager } = session(), before = manager.archive;
    for (const invalid of [
        { price: 1 }, { enabled: false }, { itemId: 101 }, { price: -1 },
        { price: 0.5 }, { limitCount: 0 }, { limitCount: -1 }, { id: 0 },
    ]) {
        const offer = { ...goods[0], ...invalid };
        assert.throws(() => manager.buyMarketGoods(offer.id, [offer], bag));
        assert.deepEqual(manager.archive, before);
    }
    assert.throws(() => manager.buyMarketGoods(99999, goods, bag));
    const original = tables.market_goods.getDataList()[0];
    for (const invalid of [{ item_id: 101 }, { price: -1 }, { limit_count: 0 }, { enabled: 2 }])
        assert.throws(() => MarketConfigUtils.read({
            item: tables.item, market_goods: { getDataList: () => [{ ...original, ...invalid }] },
        }));
});
test("局内买卖及绕过专用入口拒绝", () => {
    const { manager } = session(), item = manager.inventory.items.find(row => row.location.space === "bag");
    manager.inventoryCommand({ type: "enter" }); const before = manager.archive;
    assert.throws(() => manager.buyMarketGoods(goods[0].id, goods, bag), /局外/);
    assert.throws(() => manager.sellMarketItem(item.uid, item.location), /局外/);
    assert.throws(() => manager.mapCommand({ type: "buyMarketGoods", offer: goods[0], to: bag }), /专用入口/);
    assert.throws(() => manager.mapCommand({ type: "sellMarketItem", uid: item.uid, from: item.location }), /专用入口/);
    assert.deepEqual(manager.archive, before);
});
test("买入再出售不恢复限购，未来改价不改变成交重放", () => {
    const { manager, create } = session();
    manager.buyMarketGoods(goods[0].id, goods, bag);
    const uid = manager.inventory.items.find(row => row.uid.includes(":market:")).uid;
    sell(manager, uid);
    assert.equal(MarketRules.remaining(manager.inventory, goods[0]), 0);
    assert.throws(() => manager.buyMarketGoods(goods[0].id, goods.map(row => ({ ...row, price: 10 })), bag), /限购/);
    assert.deepEqual(create().archive, manager.archive);
});
test("全部192件可逐件拖入背包，满耐久、出售及限购完整重放", () => {
    const { manager } = session();
    const large = goods.find(row => row.itemId === 1211), first = fit(manager.archive, large);
    manager.buyMarketGoods(large.id, goods, first.to);
    const backpack = manager.inventory.items.find(row => row.uid.includes(":market:"));
    manager.inventoryCommand(InventoryRules.containerPlan(config, manager.inventory, backpack.uid));
    const save = manager.archive;
    for (const offer of goods.filter(row => row.id !== large.id)) {
        const next = fit(save, offer), command = { type: "buyMarketGoods", offer, to: next.to };
        save.state = next.state; save.commands.push({ at: 1000, command });
        const item = save.state.items.find(row => row.uid === `${save.runId}:market:${offer.id}:1`);
        assert.equal(item.location.space, "bag");
        if (item.equipment) assert.equal(item.durability, item.equipment.maxDurability);
        const sell = { type: "sellMarketItem", uid: item.uid, from: item.location };
        save.state = ExpeditionRules.apply(config, save.state, sell, 1000, 733).state;
        save.commands.push({ at: 1000, command: sell });
    }
    assert.equal(save.state.marketPurchases.length, 192);
    assert(save.state.marketPurchases.every(row => row.count === 1));
    ExpeditionRunManager.validate(save);
    const tampered = clone(save); tampered.state.marketPurchases[0].count = 2;
    assert.throws(() => ExpeditionRunManager.validate(tampered), /重放/);
});
console.log(`坊市：${checks}组背包买卖、落点、限购与存档边界通过`);
