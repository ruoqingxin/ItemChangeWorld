const assert = require("node:assert/strict");
const path = require("node:path");
const { NewBattleCore } = require(path.join(process.argv[2], "script/module/skillBattle/newRules/NewBattleCore.js"));

const state = () => ({
    phase: "player_input", revision: 0, hp: 20, maxHp: 30, mp: 5, maxMp: 10,
    block: 0, enemyHp: 20, enemyBlock: 2, momentum: 2, momentumMax: 3,
    keen: false, weaponDurability: 1,
    pouch: [{ uid: "p1", type: "hp", amount: 20 }, { uid: "p2", type: "mp", amount: 10 }],
});
const values = { basicDamage: 6, guardBlock: 8, enemyDamage: 10, hasSwordSchool: true, hasWeapon: true };
const original = state();
const before = structuredClone(original);
const result = NewBattleCore.resolve(original, { type: "guard", potionUid: "p1" }, values);
assert.equal(result.ok, true);
assert.deepEqual(original, before);
assert.deepEqual(result.events, ["potion", "guard", "keen", "enemy"]);
assert.equal(result.state.hp, 28);
assert.equal(result.state.block, 0);
assert.equal(result.state.weaponDurability, 0);
assert.equal(result.state.momentum, 3);
assert.equal(result.state.keen, true);
assert.equal(result.state.pouch.length, 1);
assert.deepEqual(NewBattleCore.resolve(original, { type: "guard", potionUid: "p1" }, values), result);

const full = { ...state(), hp: 30 };
assert.equal(NewBattleCore.resolve(full, { type: "basic", potionUid: "p1" }, values).ok, false);
assert.equal(full.pouch.length, 2);
const lethal = NewBattleCore.resolve({ ...state(), enemyHp: 4 }, { type: "basic" }, values);
assert.equal(lethal.state.phase, "victory");
assert.ok(!lethal.events.includes("enemy"));
const noSword = NewBattleCore.resolve(state(), { type: "basic", potionUid: "p2" },
    { ...values, hasSwordSchool: false, hasWeapon: false });
assert.equal(noSword.state.mp, 10);
assert.equal(noSword.state.momentum, 2);
assert.equal(noSword.state.weaponDurability, 1);
assert.equal(NewBattleCore.weaponAttributeRatio(0), 0.5);
assert.equal(NewBattleCore.weaponAttributeRatio(1), 1);
console.log("OK new battle core: potions, actions, momentum, durability and pure preview");
