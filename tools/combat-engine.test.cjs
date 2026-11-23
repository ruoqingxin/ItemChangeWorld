const assert=require("node:assert/strict");
const {load}=require("./config-fixture.cjs");
const {RULES, POTIONS, BASES, TRAITS, SKILLS, MAIN, SUB, WINDOWS, rollItem, statsFromItems, activeTraits}=load("module/skillBattle/utils/CombatConfig.js");
const BUILDS=[{"code":"bleed","name":"放血省药","bases":["steelSword","scale","jade"],"traits":["gap","excess","frugal"],"skills":["rend","sunder","leech","sever","bloodpay"],"potions":[3,2]},{"code":"fire","name":"养火收火","bases":["bamboo","heart","pin"],"traits":["ember","barrier","hidden"],"skills":["ignite","detonate","firewind","firebreath","ashward"],"potions":[2,3]},{"code":"frost","name":"寒意择机","bases":["fan","scale","edge"],"traits":["hunt","nourish","alternate"],"skills":["frost","icebreak","frostheal","frostseal","sweep"],"potions":[3,2]},{"code":"thunder","name":"雷印调度","bases":["seal","heart","pin"],"traits":["edgeStack","store","meditate"],"skills":["spark","thunder","recall","thunderward","chain"],"potions":[2,3]},{"code":"guard","name":"守势转攻","bases":["steelSword","heavy","jade"],"traits":["vampire","store","hidden"],"skills":["iron","counter","shieldhit","leech","sunder"],"potions":[3,2]},{"code":"blood","name":"血蓝轮换","bases":["saber","heart","pin"],"traits":["vampire","excess","alternate"],"skills":["bloodrage","bloodcast","leech","convert","cleanse"],"potions":[3,2]}];
const {createBattle, playerAct, step, legal, usePotion, addStatus, takeStatus, layers, incoming, hitEnemy, giveShield, heal, armorDamage, attributes, skillCost, bloodCost, validate, intent}=load("module/skillBattle/utils/CombatEngine.js");

let passed = 0;
function test(name, body) {
  try { body(); passed++; } catch (error) { console.error(`失败：${name}`); throw error; }
}
const allCodes = SKILLS.map(x => x.code).filter(x => !["basic", "guard"].includes(x));
function fixture(codes = ["rend"], traitCodes = [], options = {}) {
  const build = { ...BUILDS[0], skills: codes, potions: [3, 2] };
  const items = traitCodes.map((code, i) => {
    const source = TRAITS.find(x => x.code === code);
    const base = BASES.find(x => x.slot === source.slot);
    return rollItem(base.code, 6, i + 42, code);
  });
  const enemy = { id: 999, name: "验算敌人", tier: 3, hp: 1000, mp: 100, a: 10, s: 10, armor: 0, speed: 0, pattern: ["strike"], healUses: 2, wardUses: 2, purifyUses: 2 };
  return createBattle(build, items, [{ ...enemy, ...(options.enemy ?? {}) }], options);
}
test("内容完整且代码唯一", () => {
  assert.equal(BASES.length, 24); assert.equal(TRAITS.length, 24); assert.equal(SKILLS.length - 2, 34);
  for (const rows of [BASES, TRAITS, SKILLS]) assert.equal(new Set(rows.map(x => x.code)).size, rows.length);
  for (let slot = 1; slot <= 3; slot++) assert.equal(TRAITS.filter(x => x.slot === slot).length, 8);
  for (const b of BUILDS) {
    assert.equal(RULES.activeSlots, 5);
    assert.equal(b.skills.length, RULES.activeSlots);
    assert.equal(new Set(b.skills).size, RULES.activeSlots);
    assert.equal(b.potions[0] + b.potions[1], 5);
    b.skills.forEach(code => assert.ok(allCodes.includes(code)));
  }
});
test("六品质全底材生成范围与固定结果", () => {
  for (const base of BASES) for (let q = 1; q <= 6; q++) for (let seed = 1; seed <= 48; seed++) {
    const item = rollItem(base.code, q, seed), window = WINDOWS[q - 1];
    assert.deepEqual(item, rollItem(base.code, q, seed));
    assert.ok(item.mainBand >= window[0] && item.mainBand <= window[1]);
    assert.ok(item.subBand >= window[0] && item.subBand <= window[1]);
    const main = MAIN[item.main][item.mainBand - 1], sub = SUB[item.sub][item.subBand - 1];
    assert.ok(item.mainValue >= main[0] && item.mainValue <= main[1]);
    assert.ok(item.subValue >= sub[0] && item.subValue <= sub[1]);
    assert.equal(TRAITS.find(x => x.code === item.trait.code).slot, item.slot);
  }
});
test("三部位极端属性预算及临时增幅保持两位数", () => {
  const caps = {};
  for (const stat of Object.keys(MAIN)) {
    const mainMax = Math.max(...MAIN[stat].map(([, high]) => high));
    const subMax = Math.max(...SUB[stat].map(([, high]) => high));
    caps[stat] = RULES.player[stat] + [1, 2, 3].reduce((sum, slot) =>
      sum + (BASES.some(base => base.slot === slot && base.main === stat) ? mainMax : 0) + subMax, 0);
  }
  assert.deepEqual(caps, { hp: 520, mp: 105, a: 62, s: 62, armor: 45, speed: 19 });
  const traitMax = code => Math.max(...TRAITS.find(row => row.code === code).p.map(([, high]) => high));
  assert.ok(caps.a + traitMax("veteran") + traitMax("opening") < 100);
  assert.ok(caps.s + traitMax("opening") < 100);
  assert.ok(caps.armor * (1 + SKILLS.find(row => row.code === "iron").effect.armorBonus) +
    traitMax("danger") + traitMax("fortify") < 100);
});
test("重复主副合并后零耐久减半，被动保留", () => {
  const item = rollItem("steelSword", 1, 1, "vampire");
  item.main = item.sub = "a"; item.mainValue = 3; item.subValue = 2; item.durability = 0;
  assert.equal(statsFromItems([item]).a, RULES.player.a + 3);
  assert.equal(activeTraits([item]).vampire.p, item.trait.p);
});
test("同名只取高收益，收益相同取低门槛", () => {
  const x = rollItem("steelSword", 3, 1, "bloodthirst"), y = structuredClone(x);
  x.trait.p = 10; x.trait.n = 6; y.trait.p = 12; y.trait.n = 9;
  assert.equal(activeTraits([x, y]).bloodthirst.n, 9);
  y.trait.p = 10; y.trait.n = 5;
  assert.equal(activeTraits([x, y]).bloodthirst.n, 5);
});
test("护甲比例减伤、魔法正常减伤、护盾可完全抵挡", () => {
  assert.equal(armorDamage(100, 100), 50); assert.equal(armorDamage(1, 100), 1);
  const st = fixture(); st.p.armor = 100; giveShield(st, 60);
  const out = incoming(st, st.enemies[0], 100, 2);
  assert.equal(out.loss, 0); assert.equal(out.absorbed, 50); assert.equal(st.p.shield, 10);
});
test("用药不占行动，血蓝共享一次，药不改变状态及被动", () => {
  const st = fixture(["rend"], ["hidden"]);
  st.p.hp -= 100; st.p.mp -= 20; addStatus(st, st.p, "burn", 1, 2);
  const before = structuredClone(st.p.statuses);
  assert.equal(usePotion(st, "hp"), true); assert.equal(usePotion(st, "mp"), false);
  assert.equal(st.metrics.playerActions, 0); assert.equal(st.p.hidden, 0);
  assert.deepEqual(st.p.statuses, before);
  playerAct(st, "rend");
  assert.equal(st.metrics.playerActions, 1);
  assert.equal(st.metrics.enemyActions, 1);
  assert.equal(st.potions[0], 2);
});
test("满资源不吞药，五格不能超装", () => {
  const st = fixture(); assert.equal(usePotion(st, "hp"), false); assert.equal(st.potions[0], 3);
  assert.throws(() => fixture(["rend"], [], { potions: [3, 3] }), /容量/);
});
test("六种药品都遵守单格单份、共享用药次数和资源守恒", () => {
  for (let i = 0; i < POTIONS.length; i++) {
    const counts = POTIONS.map((_, j) => i === j ? 1 : 0);
    const st = fixture(["rend"], [], { hp: 1, mp: 0, potions: counts });
    const dose = POTIONS[i];
    assert.equal(usePotion(st, dose.code), true);
    assert.equal(st.p.hp, 1 + dose.hp);
    assert.equal(st.p.mp, dose.mp);
    assert.equal(st.p.shield, dose.shield);
    assert.equal(st.metrics.dosesUsed, 1); assert.equal(st.metrics.playerActions, 0);
    assert.equal(usePotion(st, dose.code), false); validate(st);
  }
});
test("双恢复任一资源有缺口即可用，护盾药不受药引增幅", () => {
  const st = fixture(["rend"], ["medicine"], { mp: 0, potions: [0, 0, 0, 0, 1, 1] });
  assert.equal(usePotion(st, "dual"), true); assert.ok(st.p.mp > 9); assert.equal(st.p.hp, st.p.maxHp);
  playerAct(st, "rend"); usePotion(st, "ward"); assert.equal(st.p.shield, 45);
  assert.equal(st.metrics.dosesUsed, 2); validate(st);
});
test("快敌先攻击，死亡没有补药机会，同速玩家先", () => {
  const st = fixture(["rend"], [], { hp: 1, enemy: { speed: 20, a: 100 } });
  assert.equal(st.lost, true); assert.equal(usePotion(st, "hp"), false); assert.equal(st.metrics.playerActions, 0);
  const tied = fixture(["rend"], [], { enemy: { speed: 10 } });
  assert.equal(tied.metrics.enemyActions, 0);
});
test("双方群体每人一行动", () => {
  const one = fixture().enemies[0];
  const st = createBattle(BUILDS[0], [], [{ ...one, speed: 20 }, { ...one, speed: 5 }, { ...one, speed: 10 }], { potions: [0, 0] });
  assert.equal(st.metrics.enemyActions, 1);
  playerAct(st, "rend", 0);
  assert.equal(st.metrics.playerActions, 1);
  assert.equal(st.enemies[1].actions, 1); assert.equal(st.enemies[2].actions, 1);
  assert.equal(st.enemies[0].actions, 2);
});
test("多段只推进一次叠锋", () => {
  const st = fixture(["spin"], ["edgeStack"]);
  st.traits.edgeStack.n = 2; playerAct(st, "spin");
  assert.equal(st.p.counters.edgeStack, 1); assert.equal(st.metrics.procs.edgeStack ?? 0, 0);
});
test("群攻只触发一次固定次数收益", () => {
  const st = fixture(["sweep"], ["edgeStack"]);
  st.enemies.push({ ...structuredClone(st.enemies[0]), id: 1 });
  st.traits.edgeStack.n = 1; playerAct(st, "sweep");
  assert.equal(st.metrics.procs.edgeStack, 1);
});
test("吸血排除护盾与过量伤害，最终击杀仍回复", () => {
  const st = fixture(["leech"], [], { hp: 100, enemy: { hp: 5 } });
  playerAct(st, "leech"); assert.equal(st.won, true); assert.equal(st.p.hp, 102);
  const shield = fixture(["leech"], [], { hp: 100, enemy: { shield: 100 } });
  shield.enemies[0].shield = 100; playerAct(shield, "leech");
  assert.equal(shield.metrics.healing, 0);
});
test("普攻致胜回蓝，纯打盾不回蓝", () => {
  const st = fixture([], [], { mp: 0, enemy: { hp: 1 } });
  playerAct(st, "basic"); assert.equal(st.p.mp, 2); assert.equal(st.won, true);
  const shield = fixture([], [], { mp: 0 }); shield.enemies[0].shield = 100;
  playerAct(shield, "basic"); assert.equal(shield.p.mp, 0);
});
test("生命支付不能被护盾与护甲承担，濒死禁止支付", () => {
  const st = fixture(["convert"], [], { hp: 4, mp: 0 });
  giveShield(st, 50); assert.equal(legal(st, "convert", st.enemies[0]), false);
  st.p.hp = 101; assert.equal(bloodCost(st), 5); playerAct(st, "convert");
  assert.equal(st.metrics.paidLife, 5); assert.equal(st.p.mp, 12);
});
test("恢复技能次数上限，药不推进冷却", () => {
  const st = fixture(["convert"], [], { mp: 0 }); playerAct(st, "convert");
  assert.equal(legal(st, "convert", st.enemies[0]), false);
  st.p.hp -= 50; usePotion(st, "hp");
  assert.equal(legal(st, "convert", st.enemies[0]), false);
  for (let i = 0; i < 3; i++) playerAct(st, "basic");
  assert.equal(legal(st, "convert", st.enemies[0]), true);
  st.p.uses.convert = 3;
  assert.equal(legal(st, "convert", st.enemies[0]), false);
});
test("状态独立计时、满层不刷新、短时间优先消费", () => {
  const st = fixture(), e = st.enemies[0];
  addStatus(st, e, "burn", 4, 3, 1); addStatus(st, e, "burn", 4, 9, 3);
  assert.equal(layers(e, "burn"), 5);
  const used = takeStatus(e, "burn", 2);
  assert.deepEqual(used.map(x => x.ticks), [1, 1]);
  assert.equal(e.statuses.filter(x => x.power === 9).length, 1);
});
test("敌人防御只减直接伤害，不减流血灼烧", () => {
  const st = fixture(); const e = st.enemies[0]; e.guard = 0.4;
  assert.equal(hitEnemy(st, e, 10, 2, { dot: true }), 10);
  assert.equal(hitEnemy(st, e, 10, 2), 6);
});
test("已经过期的更强压制不能被后续弱压制续上", () => {
  const st = fixture(["sever"], [], { enemy: { pattern: ["guard"] } });
  st.enemies[0].suppress = 0.45; st.enemies[0].suppressUntil = -1;
  addStatus(st, st.enemies[0], "bleed", 2, 2);
  playerAct(st, "sever");
  assert.equal(st.enemies[0].suppress, 0.4);
});
test("新破甲当前一击不受益，后续才减甲", () => {
  const st = fixture(["sunder"], [], { enemy: { armor: 100, a: 0 } });
  playerAct(st, "sunder"); assert.equal(st.metrics.damage, 9);
  playerAct(st, "basic"); assert.equal(st.metrics.damage, 19);
});
test("破盾翻倍不能把翻倍带到生命", () => {
  const st = fixture(); const e = st.enemies[0]; e.shield = 30;
  assert.equal(hitEnemy(st, e, 20, 1, { shieldBonus: 2 }), 5);
  assert.equal(e.shield, 0);
});
test("混合前段击杀不结后段", () => {
  const st = fixture(["pierce"], [], { enemy: { hp: 1 } });
  playerAct(st, "pierce"); assert.equal(st.metrics.physicalDamage, 1); assert.equal(st.metrics.magicDamage, 0);
});
test("雷贯可提前选择保留雷印，净化对象在扣费前校验", () => {
  const st = fixture(["pierce"]); addStatus(st, st.enemies[0], "mark", 1);
  playerAct(st, "pierce", 0, { consumeMark: false });
  assert.equal(layers(st.enemies[0], "mark"), 1);
  const clean = fixture(["cleanse"], [], { hp: 100 }); addStatus(clean, clean.p, "burn", 1, 3);
  const before = JSON.stringify(clean);
  assert.throws(() => playerAct(clean, "cleanse", 0, { cleanseTypes: ["bleed"] }), /净化/);
  assert.equal(JSON.stringify(clean), before);
});
test("守反存活才反击，多段敌攻只反一次", () => {
  const st = fixture(["counter"], [], { enemy: { pattern: ["flurry"] } });
  playerAct(st, "counter"); assert.equal(st.metrics.procs.counter, 1);
  const dead = fixture(["counter"], [], { hp: 1, enemy: { a: 100 } });
  playerAct(dead, "counter"); assert.equal(dead.lost, true); assert.equal(dead.metrics.procs.counter ?? 0, 0);
});
test("满血空净化拒绝且不扣资源，受伤仍可选择只治疗", () => {
  const st = fixture(["cleanse"]); addStatus(st, st.p, "burn", 1, 3);
  const before = JSON.stringify(st);
  assert.throws(() => playerAct(st, "cleanse", 0, { cleanseTypes: [] }), /净化/);
  assert.equal(JSON.stringify(st), before);
  st.p.hp -= 30;
  playerAct(st, "cleanse", 0, { cleanseTypes: [] });
  assert.equal(st.metrics.playerActions, 1); assert.ok(st.metrics.healing > 0);
});
test("敌意图与实际行动共用缺蓝和限次回退", () => {
  for (const [code, key, limit] of [["mend","heals","healUses"],["ward","wards","wardUses"],["purify","purifies","purifyUses"]]) {
    const st=fixture(["rend"],[],{enemy:{pattern:[code]}}), e=st.enemies[0];
    assert.equal(intent(e,1),code);
    e[key]=e[limit]; assert.equal(intent(e,1),"strike");
    const hp=e.hp, shield=e.shield, mp=e.mp;
    playerAct(st,"guard");
    assert.equal(e.mp,mp); assert.equal(e.hp,hp); assert.equal(e.shield,shield);
    assert.ok(st.metrics.incoming>0);
  }
  const st=fixture(["rend"],[],{enemy:{pattern:["storm"],mp:0}});
  assert.equal(intent(st.enemies[0],1),"strike");
  playerAct(st,"guard"); assert.equal(st.enemies[0].mp,0); assert.ok(st.metrics.incoming>0);
});
test("护体在完整多段攻击后才产盾", () => {
  const st = fixture(["rend"], ["barrier"], { enemy: { a: 30, pattern: ["flurry"] } });
  playerAct(st, "rend");
  assert.equal(st.metrics.shieldAbsorbed, 0); assert.ok(st.p.shield > 0);
});
test("血饲来源及总护盾双上限，药品不能转盾", () => {
  const st = fixture(["leech"], ["excess"]);
  heal(st, 1000, true);
  assert.equal(st.p.shield, Math.floor(st.p.maxHp * st.traits.excess.p / 100));
  giveShield(st, 999); assert.equal(st.p.shield, Math.floor(st.p.maxHp * 0.3));
  const medicine = fixture(["leech"], ["excess"], { hp: 200 });
  usePotion(medicine, "hp"); assert.equal(medicine.p.shield, 0);
});
test("主动花盾不产生存锋，附伤不递归", () => {
  const st = fixture(["shieldhit"], ["store"]); giveShield(st, 60);
  const copy = structuredClone(st); copy.enemies[0].a = 0; playerAct(copy, "shieldhit");
  assert.equal(copy.p.stored, 0); assert.equal(copy.metrics.procs.store ?? 0, 0);
  incoming(st, st.enemies[0], 20); assert.ok(st.p.stored > 0);
  playerAct(st, "basic"); assert.equal(st.metrics.procs.store, 1);
});
test("伏雷只在主动攻击前爆炸，不消费藏锋", () => {
  const st = fixture(["mine"], ["hidden"], { enemy: { pattern: ["guard", "strike"] } });
  playerAct(st, "mine"); assert.equal(st.metrics.damage, 0); assert.equal(st.p.hidden, 1);
  playerAct(st, "guard"); assert.equal(st.metrics.procs.mine, 1); assert.equal(st.p.hidden, 2);
});
test("伏雷未触发按期消失", () => {
  const st = fixture(["mine"], [], { enemy: { pattern: ["guard"] } });
  playerAct(st, "mine"); playerAct(st, "guard"); assert.equal(st.enemies[0].mine, null);
});
test("寒意和下一攻压制相乘，覆盖所有段", () => {
  const st = fixture(["frostseal"], [], { enemy: { a: 100, pattern: ["flurry"] } });
  addStatus(st, st.enemies[0], "chill", 3);
  playerAct(st, "frostseal");
  const expected = armorDamage(55 * 0.55 * 0.94, st.p.armor) * 3;
  assert.equal(st.metrics.incoming, expected);
  assert.equal(st.enemies[0].suppress, 0);
});
test("消费状态不会再参与轮末伤害与转换", () => {
  const st = fixture(["firebreath"]); addStatus(st, st.enemies[0], "burn", 2, 5);
  playerAct(st, "firebreath");
  assert.equal(layers(st.enemies[0], "burn"), 0); assert.equal(st.metrics.dotDamage, 0);
});
test("换脉辅助保留，混合清空，低蓝减费必须先判断", () => {
  const st = fixture(["bloodcast", "icebreak", "sunder"], ["alternate"]);
  st.p.lastKind = 2; st.p.mp = 0;
  assert.equal(skillCost(st, "sunder"), 0); assert.equal(legal(st, "sunder", st.enemies[0]), true);
  playerAct(st, "guard"); assert.equal(st.p.lastKind, 2);
  st.p.mp = 10; playerAct(st, "icebreak"); assert.equal(st.p.lastKind, 0);
});
test("药引确实消耗一份，满血溢出不储存", () => {
  const st = fixture(["rend"], ["medicine"], { hp: 50 });
  const before = st.p.hp; usePotion(st, "hp");
  assert.equal(st.p.hp - before, Math.round(RULES.hpPotion * (1 + st.traits.medicine.p / 100)));
  assert.equal(st.potions[0], 2);
});
test("合律不计普攻、药、防御，节用限五次", () => {
  const st = fixture(["sunder", "leech", "spin"], ["harmony"]);
  playerAct(st, "basic"); assert.deepEqual(st.p.forms, []);
  playerAct(st, "sunder"); playerAct(st, "leech"); playerAct(st, "spin");
  assert.equal(st.metrics.procs.harmony, 1); assert.deepEqual(st.p.forms, []);
  const frugal = fixture(["leech"], ["frugal"], { enemy: { a: 0 } });
  for (let i = 0; i < 7; i++) playerAct(frugal, "leech");
  assert.equal(frugal.metrics.procs.frugal, 5);
});
test("探索成长计数保留，战斗计数归零，结算扣耐久一次", () => {
  const item = rollItem("steelSword", 6, 4, "veteran"), build = { ...BUILDS[0], skills: ["rend"] };
  const st = createBattle(build, [item], [{ ...fixture().enemies[0], hp: 1, maxHp: 1 }], { potions: [0, 0] });
  playerAct(st, "rend");
  assert.equal(st.items[0].kills, 1); assert.equal(st.items[0].durability, item.durability - 5);
  const next = createBattle(build, st.items, [1], { hp: st.p.hp, mp: st.p.mp, potions: [0, 0] });
  assert.equal(next.items[0].kills, 1); assert.deepEqual(next.p.counters, {});
  assert.equal(next.p.mp, st.p.mp);
});
test("五技能上限与非法操作拒绝，预览不改变原状态", () => {
  const five = fixture(allCodes.slice(0, 5));
  assert.equal(five.build.skills.length, 5);
  assert.ok(legal(five, "basic", five.enemies[0])); assert.ok(legal(five, "guard", five.enemies[0]));
  assert.throws(() => fixture(allCodes.slice(0, 6)), /超过5个/);
  assert.throws(() => fixture(allCodes), /超过5个/);
  const st = fixture(["rend"]), before = JSON.stringify(st);
  assert.throws(() => playerAct(st, "thunder"), /非法/);
  const next = step(st, { code: "rend", target: 0 });
  assert.equal(JSON.stringify(st), before); assert.equal(next.metrics.playerActions, 1);
});
test("治疗敌人的法力和次数有限，不存在无限自疗", () => {
  const st = fixture([], [], { enemy: { pattern: ["mend"], healUses: 2, a: 0 } });
  for (let i = 0; i < 8; i++) playerAct(st, "guard");
  assert.equal(st.enemies[0].heals, 2); assert.equal(st.enemies[0].mp, 88);
});
test("嗜血启动不追溯本次击杀，探索成长进入下一招", () => {
  const st = fixture(["rend"], ["bloodthirst"], { hp: 100, enemy: { hp: 1 } });
  st.traits.bloodthirst.n = 1;
  st.enemies.push({ ...structuredClone(st.enemies[0]), id: 1, hp: 100, maxHp: 100, a: 0 });
  playerAct(st, "rend"); assert.equal(st.metrics.healing, 0);
  playerAct(st, "rend", 1); assert.ok(st.metrics.healing > 0);
  const veteran = fixture(["rend"], ["veteran"], { enemy: { hp: 1 } });
  veteran.traits.veteran.n = 1; const before = attributes(veteran).a;
  playerAct(veteran, "rend"); assert.equal(attributes(veteran).a, before + 1);
});
test("余烬只给存活目标补新火，不参与本次引爆", () => {
  const st = fixture(["detonate"], ["ember"]);
  addStatus(st, st.enemies[0], "burn", 3, 3);
  playerAct(st, "detonate");
  assert.equal(st.metrics.procs.ember, 1);
  assert.equal(layers(st.enemies[0], "burn"), 1);
  assert.equal(st.enemies[0].statuses[0].ticks, 2);
});
test("反震和装备附伤不吸血、不继续推进叠锋", () => {
  const st = fixture(["rend"], ["edgeStack", "reflect"], { hp: 100 });
  st.traits.edgeStack.n = 1; playerAct(st, "rend");
  assert.equal(st.metrics.procs.edgeStack, 1); assert.equal(st.metrics.procs.reflect, 1);
  assert.equal(st.metrics.healing, 0);
  const leech = fixture(["leech"], ["edgeStack"], { hp: 100, enemy: { a: 0 } });
  leech.traits.edgeStack.n = 1; leech.traits.edgeStack.p = 100;
  playerAct(leech, "leech");
  assert.equal(leech.metrics.healing, Math.round(armorDamage(attributes(leech).a * 1.1, 0) * 0.3));
});
test("守危即时随血量切换，固守至下一次自己出招前", () => {
  const st = fixture([], ["danger"], { hp: 20 });
  const bonus = st.traits.danger.p;
  assert.equal(attributes(st).armor, st.p.armor + bonus);
  heal(st, 999); assert.equal(attributes(st).armor, st.p.armor);
  const fortify = fixture([], ["fortify"]);
  const before = fortify.metrics.incoming; playerAct(fortify, "guard");
  assert.equal(fortify.metrics.incoming - before, armorDamage(10 * 0.6, fortify.p.armor + fortify.traits.fortify.p));
  assert.equal(fortify.p.fortify, 0);
});
test("开场双攻覆盖完整回合，不能随永久面板保存", () => {
  const st = fixture([], ["opening"]);
  const bonus = st.traits.opening.p;
  assert.equal(attributes(st).a, st.p.a + bonus); assert.equal(attributes(st).s, st.p.s + bonus);
  for (let i = 0; i < st.traits.opening.n; i++) playerAct(st, "guard");
  assert.equal(attributes(st).a, st.p.a);
});
test("调息仅三次，战后回复仅一次且不救活", () => {
  const st = fixture([], ["meditate"], { mp: 0, enemy: { a: 0 } });
  for (let i = 0; i < 12; i++) playerAct(st, "guard");
  assert.equal(st.metrics.procs.meditate, 3);
  const end = fixture(["rend"], ["nourish", "returnMana"], { hp: 100, mp: 0, enemy: { hp: 1 } });
  playerAct(end, "rend"); assert.ok(end.p.hp > 100); assert.ok(end.p.mp > 0);
  const before = JSON.stringify(end);
  assert.throws(() => playerAct(end, "rend")); assert.equal(JSON.stringify(end), before);
});
for (const code of allCodes) test(`独立技能边界执行：${code}`, () => {
  const st = fixture([code], [], { hp: 150, mp: 36, enemy: { a: 0 } });
  for (const type of ["bleed", "burn", "chill", "mark"]) addStatus(st, st.enemies[0], type, 3, 3);
  if (code === "execute") st.enemies[0].hp = 250;
  if (code === "shieldhit") giveShield(st, 50);
  playerAct(st, code); validate(st);
  assert.equal(st.metrics.actions[code], 1);
});
for (const source of TRAITS) test(`独立特性合法性：${source.code}`, () => {
  const st = fixture(["rend", "sunder", "leech", "ignite", "detonate"], [source.code], { hp: 180, mp: 30 });
  playerAct(st, "sunder"); playerAct(st, "rend"); playerAct(st, "leech"); validate(st);
});
test("确定性回放一致",()=>{
  const one=fixture(["rend","sunder","leech"]),two=structuredClone(one);
  for(const state of [one,two])for(const code of ["rend","sunder","leech","rend"])playerAct(state,code);
  assert.deepEqual(one,two);
});
console.log(`正式结算核：${passed}组技能、状态、24特性边界通过；装备生成6912次。`);
