const assert = require("node:assert/strict");
const {load} = require("./config-fixture.cjs");
const {QingmingRules: R} = load("module/skillBattle/utils/QingmingRules.js");
const {QingmingConfig: C} = load("module/skillBattle/utils/QingmingConfig.js");
const {WeaponTrialRules: W} = load("module/skillBattle/utils/WeaponTrialRules.js");
const {WeaponTrialConfig: T} = load("module/manualTest/utils/WeaponTrialConfig.js");
const {RogueTestManager: Manager} = load("module/manualTest/manager/RogueTestManager.js");
let groups = 0;
const test = (name, fn) => { fn(); groups++; console.log("PASS 武器 " + name); };
function start(passive = "echo", patch = {}) {
    const d = T.defaults();
    // 武器单元覆盖共享核原有三行动路径；单行动完整时序由全装备专项覆盖。
    return R.start({...d, singleAction:false, combatTrial:undefined,armorTrial:undefined,accessoryTrial:undefined, battles: 1, enemyId: "patrol", ...patch,
        weaponTrial: {base: 1, quality: 6, passive, ...patch.weaponTrial},
        enemy: {hp: 10000, mp: 180, attack: 0, defense: 0, ...patch.enemy}});
}
function act(s, move, extra = {}) {
    const before = structuredClone(s), result = R.resolve(s, {move, ...extra});
    assert.deepEqual(s, before); assert.ok(result.ok, result.reason);
    R.validateState(result.state); return result.state;
}
function gift(s, ...keys) {
    for (const k of keys) {
        s.acquired.push(k);
        if (C.items[k].type === "core") s.core = k;
        else if (C.items[k].slot) s.mutations[C.items[k].slot] = k;
        else s.passives.push(k);
    }
}
test("十二底材六品质的档位与数值合法，重复主副和独立随机可重放", () => {
    const passives = new Set(); let duplicate = 0;
    for (let base = 1; base <= 12; base++) for (let quality = 1; quality <= 6; quality++) {
        const bands = [new Set(), new Set()];
        for (let seed = 1; seed <= 180; seed++) {
            const d = {base, quality}, roll = W.roll(d, seed);
            assert.deepEqual(roll, W.roll(d, seed));
            assert.equal(roll.main.attribute, W.bases[base - 1].attribute);
            const [lo, hi] = W.windows[quality - 1];
            for (const [i, table, stat] of [[0, W.main, roll.main], [1, W.secondary, roll.secondary]]) {
                assert.ok(stat.band >= lo && stat.band <= hi);
                const range = table[stat.attribute][stat.band - 1];
                assert.ok(stat.value >= range[0] && stat.value <= range[1]); bands[i].add(stat.band);
            }
            assert.equal(roll.maxDurability, W.bases[base - 1].durability + (quality - 1) * 4);
            passives.add(roll.passive); if (roll.main.attribute === roll.secondary.attribute) duplicate++;
        }
        for (const b of bands) assert.equal(b.size, W.windows[quality - 1][1] - W.windows[quality - 1][0] + 1);
    }
    assert.equal(passives.size, 8); assert.ok(duplicate > 2000);
});
test("护甲在护盾前结算，零伤害不变正伤害，正伤害至少一点", () => {
    assert.equal(W.armorDamage(100, 100, true), 50);
    assert.equal(W.armorDamage(0.1, 1000, true), 1);
    assert.equal(W.armorDamage(0, 0, true), 0);
    let s = start("echo", {enemy: {attack: 100, defense: 100}});
    s.player.defense = 100; s.player.shield = 10;
    const n = act(s, "basic");
    assert.equal(s.enemy.hp - n.enemy.hp, Math.round(s.player.attack / 2));
    // 普通巡山首轮两次80%攻击，先减甲为40再消耗10盾。
    const ended = act(s, "end"); assert.equal(ended.totals.taken, 70);
});
test("同属性合并后减半，角色基础不变，零耐久被动保持", () => {
    const seed = Array.from({length: 100}, (_, i) => i + 1).find(seed =>
        W.roll({base: 1, quality: 6}, seed).secondary.attribute === 4);
    const full = start("echo", {seed}), broken = start("echo", {seed, weaponTrial: {broken: true}});
    assert.equal(broken.player.attack - broken.setup.player.attack,
        Math.round((full.player.attack - full.setup.player.attack) / 2));
    assert.equal(broken.weapon.roll.benefit, full.weapon.roll.benefit);
    let s = act(act(broken, "basic"), "basic");
    assert.equal(s.totals.events.weaponProc, 1);
    assert.equal(s.totals.events.weaponDamage, broken.weapon.roll.benefit);
});
test("吸血只计本行动实际生命伤害，排除护盾溢出和回合末派生", () => {
    let s = start("leech"); s.player.hp -= 100;
    s.enemy.shield = 20;
    let n = act(s, "basic");
    assert.equal(n.player.hp - s.player.hp, Math.floor((s.player.attack - 20) * s.weapon.roll.benefit / 100));
    s = start("leech"); s.player.hp -= 100;
    gift(s, "swordcraft", "flyingEdge", "swordUnity");
    n = act(s, "edge");
    assert.equal(n.totals.events.weaponAttacks, 1);
    assert.equal(n.player.hp - s.player.hp, Math.floor(n.totals.damage * s.weapon.roll.benefit / 100));
    const beforeEnd = n.player.hp; n = act(n, "end"); assert.equal(n.player.hp, beforeEnd);
    s = start("leech"); s.player.hp -= 100; s.enemy.hp = 1;
    n = act(s, "basic"); assert.equal(n.player.hp, s.player.hp); assert.equal(n.totals.events.weaponHeal || 0, 0);
});
test("攻击按行动计数，防御不计，多段不重复，回蓝在敌阶段前发生", () => {
    let s = start("mana"); s.player.mp = 0;
    gift(s, "flyingEdge", "swordUnity");
    s = act(s, "basic"); s = act(s, "guard"); s = act(s, "basic");
    assert.equal(s.totals.events.weaponAttacks, 2);
    assert.equal(s.totals.events.weaponMana, s.weapon.roll.benefit);
    assert.equal(s.player.mp, 6 + s.weapon.roll.benefit);
});
test("叠锋不递归或吸血，击杀追加伤害只结算一次", () => {
    let s = start("echo"); s.weapon.attacks = 1; s.enemy.hp = s.player.attack + 1;
    s = act(s, "basic");
    assert.equal(s.phase, "complete"); assert.equal(s.reports.length, 1);
    assert.equal(s.weapon.kills, 1); assert.equal(s.totals.events.weaponProc, 1);
    assert.equal(s.totals.events.weaponDamage, 1);
    assert.equal(s.reports[0].events.weaponProc, 1);
});
test("破阵先削盾，削盾不能伤血，同一行动破盾只追加一次", () => {
    let s = start("break"); s.enemy.shield = 1;
    const n = act(s, "basic");
    assert.equal(n.totals.events.weaponShieldRemoved, 1);
    assert.equal(n.totals.events.weaponProc, 1); assert.equal(n.totals.events.enemyBreak, 1);
    assert.equal(n.totals.damage, s.player.attack + s.weapon.roll.benefit);
    s = start("break", {enemy: {defense: 200}}); s.enemy.shield = 1000; s.player.attack = 1;
    const blocked = act(s, "basic");
    assert.equal(blocked.totals.damage, 0); assert.equal(blocked.totals.events.weaponProc || 0, 0);
});
test("凝雷按净耗蓝计量，防御法术可以充能，退款抵扣，蓄能不无限囤积", () => {
    let s = start("thunder"); s.weapon.charge = s.weapon.roll.threshold - 4;
    let n = act(s, "wind"); assert.equal(n.totals.events.weaponProc, 1); assert.equal(n.weapon.charge, 0);
    s = start("thunder"); s.weapon.charge = 0;
    gift(s, "flyingEdge", "swordUnity", "swordSiphon"); s.flying = 2;
    s = act(s, "edge");
    assert.equal(s.weapon.charge, 2);
    s.weapon.charge = 1000;
    n = act(s, "wind");
    assert.equal(n.totals.events.weaponProc, 1);
    assert.equal(n.weapon.charge, n.weapon.roll.threshold - 1);
});
test("猎弱只在35%以下提高本体，派生不加成", () => {
    let s = start("execute"); s.enemy.hp = Math.floor(s.enemy.maxHp * .35);
    gift(s, "swordcraft", "flyingEdge", "swordUnity");
    const n = act(s, "edge");
    assert.equal(n.totals.events.weaponExecute, 1);
    assert.equal(n.totals.damage,
        Math.round(s.player.attack * .7 * (1 + s.weapon.roll.benefit / 100)) + Math.round(s.player.attack * .3) * 2);
});
test("嗜血与百战累计跨战，攻击蓄能每战重置，耐久按敌品质结算", () => {
    for (const passive of ["bloodthirst", "veteran"]) {
        let s = start(passive, {battles: 12, enemyId: null, enemy: {hp: 1}, weaponTrial: {broken: true}});
        const roll = structuredClone(s.weapon.roll), initialAttack = s.player.attack;
        for (let battle = 1; battle <= 7; battle++) {
            s = act(s, "basic"); assert.equal(s.weapon.kills, battle); assert.equal(s.weapon.durability, 0);
            if (s.phase === "reward") s = act(s, "choose", {choice: s.offers[0]});
            s = act(s, "next"); assert.equal(s.weapon.attacks, 0); assert.equal(s.weapon.charge, 0);
            assert.deepEqual(s.weapon.roll, roll);
            if (passive === "veteran") assert.equal(s.player.attack, initialAttack + Math.min(roll.benefit, Math.floor(battle / roll.threshold)));
        }
        if (passive === "bloodthirst") {
            s.player.hp -= 100; s.enemy.hp = 10000; s.enemy.maxHp = 10000;
            const n = act(s, "basic");
            assert.ok(n.player.hp > s.player.hp);
        }
    }
    for (const [enemyId, cost] of [["patrol", 2], ["gatekeeper", 3], ["tortoise", 5]]) {
        let s = start("echo", {enemyId, enemy: {hp: 1}});
        const durability = s.weapon.durability;
        s = act(s, "basic"); assert.equal(s.weapon.durability, durability - cost);
        assert.equal(R.resolve(s, {move: "basic"}).ok, false);
    }
});
test("耐久非零锁定本场完整贡献，下场减半不补满血蓝", () => {
    let s = start("echo", {battles: 12, enemyId: null, enemy: {hp: 1}, weaponTrial: {base: 11}});
    s.weapon.durability = 1; s.player.hp = 5;
    const hpMax = s.player.maxHp, beforeAttack = s.player.attack;
    s = act(s, "basic"); assert.equal(s.weapon.durability, 0); assert.equal(s.player.maxHp, hpMax);
    if (s.phase === "reward") s = act(s, "choose", {choice: s.offers[0]});
    s = act(s, "next"); assert.ok(s.player.maxHp < hpMax); assert.equal(s.player.hp, 5);
    assert.ok(s.player.attack <= beforeAttack);
});
test("不改变敌阵奖励随机流，原核默认关闭，设置拒绝保持上一局", () => {
    const d = C.defaults(), plain = R.start(d), weapon = R.start({...d, weaponTrial: {base: 1, quality: 1}});
    assert.deepEqual(plain.enemyPlan, weapon.enemyPlan); assert.equal(plain.rng, weapon.rng);
    assert.equal(plain.weapon, undefined); assert.equal(plain.setup.armorMitigation, undefined);
    const a = structuredClone(plain), b = structuredClone(weapon);
    R.rollOffers(a, false); R.rollOffers(b, false); assert.deepEqual(a.offers, b.offers); assert.equal(a.rng, b.rng);
    const manager = new Manager(); assert.ok(manager.start()); const before = structuredClone(manager.state);
    manager.draft.weaponTrial.quality = 7; assert.equal(manager.start(), false); assert.deepEqual(manager.state, before);
    const failed = start("break"); failed.player.mp = 0; failed.enemy.shield = 10;
    const result = R.resolve(failed, {move: "edge"}); assert.equal(result.ok, false); assert.equal(result.state, failed);
    assert.equal(result.state.enemy.shield, 10); assert.equal(result.state.weapon.attacks, 0);
});
console.log(`武器演练：${groups}组通过`);
