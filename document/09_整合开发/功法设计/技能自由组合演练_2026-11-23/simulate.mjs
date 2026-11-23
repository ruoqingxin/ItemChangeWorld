import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// 本文件是设计阶段的独立数值实验，不读取正式配置，不分配正式技能编号。
const TYPE = { PHYSICAL: 1, MAGIC: 2, MIXED: 3, DEFENSE: 4, HEAL: 5, RESOURCE: 6, SETUP: 7 };
const STATUS = { BLEED: 1, BURN: 2, CHILL: 3, MARK: 4 };
const STATUS_NAMES = { 1: "流血", 2: "灼烧", 3: "寒意", 4: "雷印" };
const LIMIT = { 1: 5, 2: 5, 3: 3, 4: 3 };
const SKILLS = [
  [1, "basic", "普攻", 0, 0, TYPE.PHYSICAL],
  [2, "guard", "防御", 0, 0, TYPE.DEFENSE],
  [3, "rend", "裂帛", 0, 0, TYPE.PHYSICAL],
  [4, "sunder", "断甲刺", 2, 0, TYPE.PHYSICAL],
  [5, "shatter", "破障槌", 2, 0, TYPE.PHYSICAL],
  [6, "spin", "回旋刃", 3, 0, TYPE.PHYSICAL],
  [7, "execute", "斩命", 3, 0, TYPE.PHYSICAL],
  [8, "ignite", "点烬", 4, 0, TYPE.MAGIC],
  [9, "firewind", "焚风", 7, 0, TYPE.MAGIC],
  [10, "detonate", "焚尽", 8, 0, TYPE.MAGIC],
  [11, "frost", "凝霜", 4, 0, TYPE.MAGIC],
  [12, "icebreak", "碎寒击", 3, 0, TYPE.MIXED],
  [13, "spark", "雷引", 4, 0, TYPE.MAGIC],
  [14, "thunder", "惊雷", 8, 0, TYPE.MAGIC],
  [15, "mine", "伏雷", 5, 1, TYPE.SETUP],
  [16, "iron", "铁衣", 5, 2, TYPE.DEFENSE],
  [17, "counter", "守反", 1, 1, TYPE.DEFENSE],
  [18, "shieldhit", "碎壁轰", 3, 0, TYPE.PHYSICAL],
  [19, "bloodrage", "燃血", 0, 2, TYPE.PHYSICAL],
  [20, "leech", "饮血刃", 2, 0, TYPE.PHYSICAL],
  [21, "bloodcast", "血契", 4, 0, TYPE.MAGIC],
  [22, "convert", "化灵", 0, 3, TYPE.PHYSICAL],
  [23, "heal", "回春", 8, 2, TYPE.HEAL],
  [24, "cleanse", "涤尘", 4, 2, TYPE.HEAL],
  [25, "pierce", "雷贯", 5, 0, TYPE.MIXED],
  [26, "flameblade", "借焰斩", 2, 0, TYPE.MIXED],
  [27, "bloodpay", "血偿", 2, 2, TYPE.HEAL],
  [28, "sever", "截脉", 2, 1, TYPE.PHYSICAL],
  [29, "ashward", "灰烬衣", 2, 1, TYPE.DEFENSE],
  [30, "firebreath", "火息", 0, 2, TYPE.RESOURCE],
  [31, "frostheal", "回霜", 2, 2, TYPE.HEAL],
  [32, "frostseal", "霜封", 2, 1, TYPE.DEFENSE],
  [33, "recall", "雷回流", 0, 2, TYPE.RESOURCE],
  [34, "thunderward", "霆护", 2, 1, TYPE.DEFENSE],
  [35, "sweep", "横扫", 3, 0, TYPE.PHYSICAL],
  [36, "chain", "雷链", 7, 0, TYPE.MAGIC],
].map(([id, code, name, mp, cd, kind]) => ({ id, code, name, mp, cd, kind }));
const BY_CODE = Object.fromEntries(SKILLS.map(s => [s.code, s]));
const TACTICAL = new Set(["bloodpay", "ashward", "firebreath", "frostheal", "frostseal", "recall", "thunderward"]);
const PASSIVES = {
  hidden: "藏锋", gap: "识隙", ember: "余烬",
  store: "守势化锋", excess: "血饲", alternate: "换脉",
};
const BUILDS = [
  { id: 1, name: "放血续战", a: 32, s: 12, skills: ["sunder", "rend", "bloodpay", "sever", "execute", "sweep", "heal"], passives: ["gap", "hidden"] },
  { id: 2, name: "养火收火", a: 12, s: 32, skills: ["ignite", "flameblade", "detonate", "firewind", "ashward", "firebreath", "heal"], passives: ["ember", "hidden"] },
  { id: 3, name: "寒意转化", a: 22, s: 22, skills: ["frost", "icebreak", "frostheal", "frostseal", "sunder", "sweep", "heal"], passives: ["alternate", "hidden"] },
  { id: 4, name: "雷印调度", a: 14, s: 30, skills: ["spark", "thunder", "mine", "recall", "thunderward", "chain", "heal"], passives: ["hidden", "store"] },
  { id: 5, name: "守势转攻", a: 28, s: 16, skills: ["iron", "counter", "shieldhit", "leech", "sunder", "sweep", "heal"], passives: ["hidden", "store"] },
  { id: 6, name: "血蓝轮换", a: 24, s: 20, skills: ["bloodrage", "bloodcast", "leech", "convert", "sweep", "rend", "cleanse"], passives: ["excess", "alternate"] },
];
const SCENARIOS = [
  { id: 1, name: "突袭者", foes: [{ name: "突袭者", hp: 180, a: 25, s: 12, armor: 8, speed: 14, pattern: ["strike", "flurry", "heavy"] }] },
  { id: 2, name: "重甲卫士", foes: [{ name: "重甲卫士", hp: 290, a: 27, s: 8, armor: 60, speed: 7, pattern: ["strike", "guard", "heavy"] }] },
  { id: 3, name: "结界守卫", foes: [{ name: "结界守卫", hp: 270, a: 25, s: 18, armor: 18, speed: 8, pattern: ["ward", "strike", "heavy"] }] },
  { id: 4, name: "蓄力首领", foes: [{ name: "蓄力首领", hp: 460, a: 34, s: 24, armor: 20, speed: 8, pattern: ["charge", "slam", "strike", "heavy"] }] },
  { id: 5, name: "净化术士", foes: [{ name: "净化术士", hp: 255, a: 12, s: 29, armor: 12, speed: 11, pattern: ["bolt", "strike", "purify"] }] },
  { id: 6, name: "三敌围攻", foes: [0, 1, 2].map(i => ({ name: `围攻者${i + 1}`, hp: 105, a: 15, s: 8, armor: 8, speed: 9 + i, pattern: ["strike", "heavy", "strike"] })) },
  { id: 7, name: "恢复型敌人", foes: [{ name: "恢复型敌人", hp: 300, a: 23, s: 25, armor: 18, speed: 9, pattern: ["strike", "bolt", "mend", "heavy"] }] },
  { id: 8, name: "长战压力", foes: [{ name: "长战压力", hp: 560, a: 26, s: 25, armor: 24, speed: 10, pattern: ["strike", "bolt", "heavy", "ward"] }] },
];
const CHAIN = [
  { id: 11, name: "连战一", foes: [{ name: "斥候", hp: 125, a: 17, s: 10, armor: 8, speed: 12, pattern: ["strike", "heavy"] }] },
  { id: 12, name: "连战二", foes: [{ name: "甲卫", hp: 190, a: 20, s: 8, armor: 45, speed: 7, pattern: ["strike", "heavy", "guard"] }] },
  { id: 13, name: "连战三", foes: [0, 1].map(i => ({ name: `游兵${i + 1}`, hp: 90, a: 12, s: 8, armor: 8, speed: 9 + i, pattern: ["strike", "heavy"] })) },
  { id: 14, name: "连战四", foes: [{ name: "术士", hp: 180, a: 12, s: 21, armor: 10, speed: 11, pattern: ["bolt", "strike", "purify"] }] },
  { id: 15, name: "连战五", foes: [{ name: "关底守卫", hp: 330, a: 26, s: 20, armor: 20, speed: 8, pattern: ["charge", "slam", "strike", "ward"] }] },
];
const VARIANTS = [
  { build: 1, out: "rend", into: "spin" },
  { build: 5, out: "sunder", into: "shatter" },
  { build: 4, out: "thunder", into: "pierce" },
  { build: 2, out: "firebreath", into: "convert" },
];

const clone = value => structuredClone(value);
const alive = state => state.enemies.filter(e => e.hp > 0);
const has = (state, key) => state.build.passives.includes(key);
const layers = (unit, type) => unit.statuses.filter(s => s.type === type).length;
const remaining = (unit, type) => unit.statuses.filter(s => s.type === type).reduce((n, s) => n + s.power * s.ticks, 0);
const armorDamage = (raw, armor) => raw <= 0 ? 0 : Math.max(1, Math.round(raw * 100 / (100 + Math.max(0, armor))));

function makeState(build, scenario, seed = 1, options = {}) {
  const p = {
    hp: options.hp ?? 260, mp: options.mp ?? 48, maxHp: 260, maxMp: 48,
    a: options.equal ? 22 : build.a, s: options.equal ? 22 : build.s,
    armor: 12, speed: 10, shield: 0, excessShield: 0, statuses: [], cds: {},
    guard: 0, counter: false, ironUntil: 0, hidden: 0, stored: 0,
    rage: 0, lastKind: 0, convertUses: 0, hurtAt: 0,
  };
  const scale = options.scale ?? 1;
  const enemies = scenario.foes.map((f, i) => ({
    ...clone(f), id: i, hp: Math.round(f.hp * scale), maxHp: Math.round(f.hp * scale),
    a: f.a * scale, s: f.s * scale, shield: 0, statuses: [],
    guard: 0, sunderUntil: 0, suppress: 0, suppressUntil: 0, mine: null, charged: false,
  }));
  return {
    build: { ...build, skills: options.skills ?? build.skills, passives: options.passives ?? build.passives },
    p, enemies, round: 1, seed, won: false, lost: false,
    totalEnemyHp: enemies.reduce((n, e) => n + e.hp, 0),
    totalDamage: 0, incoming: 0, healing: 0, shielded: 0,
    mpSpent: 0, mpRecovered: 0, paidHp: 0, convertedLayers: 0,
    dotDamage: 0, physicalDamage: 0, magicDamage: 0, playerActs: 0, tacticalActs: 0,
    actionCounts: {}, conversions: {}, log: [], tracing: false,
    campaign: !!options.campaign, conservative: !!options.conservative,
  };
}

function note(state, message) {
  if (state.tracing) state.log.push(message);
}

function addStatus(state, unit, type, count, power = 0, ticks = 3) {
  for (let i = 0; i < count; i++) {
    if (layers(unit, type) >= LIMIT[type]) break;
    unit.statuses.push({ type, power, ticks, added: state.round });
  }
}

function takeStatus(state, unit, type, count, reason) {
  const taken = unit.statuses.filter(s => s.type === type).sort((a, b) => a.ticks - b.ticks || a.power - b.power).slice(0, count);
  unit.statuses = unit.statuses.filter(s => !taken.includes(s));
  state.convertedLayers += taken.length;
  if (taken.length) {
    state.conversions[reason] = (state.conversions[reason] ?? 0) + taken.length;
    note(state, `  ${reason}消耗${taken.length}层${STATUS_NAMES[type]}`);
  }
  return taken;
}

function giveShield(state, amount, source) {
  const actual = Math.max(0, Math.min(amount, state.p.maxHp * 0.3 - state.p.shield));
  state.p.shield += actual;
  note(state, `  ${source}获得护盾${actual.toFixed(1)}`);
  return actual;
}

function healPlayer(state, amount, source, vampire = false) {
  const actual = Math.min(Math.max(0, amount), state.p.maxHp - state.p.hp);
  state.p.hp += actual;
  state.healing += actual;
  if (vampire && has(state, "excess")) {
    const quota = Math.max(0, state.p.maxHp * 0.1 - state.p.excessShield);
    state.p.excessShield += giveShield(state, Math.min(amount - actual, quota), "血饲");
  }
  note(state, `  ${source}恢复生命${actual.toFixed(1)}`);
  return actual;
}

function restoreMp(state, amount, source) {
  const actual = Math.min(amount, state.p.maxMp - state.p.mp);
  state.p.mp += actual;
  state.mpRecovered += actual;
  note(state, `  ${source}恢复法力${actual.toFixed(1)}`);
}

function randomFactor(state, index, planning) {
  if (planning) return 1;
  // 每回合、每个敌人使用独立的确定性扰动，避免不同技能数量改变随机序列。
  let n = (state.seed * 2654435761 + state.round * 2246822519 + index * 3266489917) >>> 0;
  n ^= n >>> 16;
  n = Math.imul(n, 2246822519) >>> 0;
  return 0.9 + (n / 4294967296) * 0.2;
}

function hitEnemy(state, target, raw, type, options = {}) {
  if (!target || target.hp <= 0 || raw <= 0) return 0;
  let armor = target.armor * (target.sunderUntil >= state.round ? 0.75 : 1);
  armor *= 1 - (options.pierce ?? 0);
  let amount = armorDamage(raw, armor) * (1 - target.guard);
  let absorbed;
  if (options.shieldBonus) {
    const shieldPower = amount * options.shieldBonus;
    absorbed = Math.min(target.shield, shieldPower);
    target.shield -= absorbed;
    amount = Math.max(0, shieldPower - absorbed) / options.shieldBonus;
  } else {
    absorbed = Math.min(target.shield, amount);
    target.shield -= absorbed;
    amount -= absorbed;
  }
  const loss = Math.min(target.hp, amount);
  target.hp -= loss;
  state.totalDamage += loss;
  if (type === TYPE.PHYSICAL) state.physicalDamage += loss;
  else state.magicDamage += loss;
  if (options.dot) state.dotDamage += loss;
  note(state, `  ${target.name}受到${loss.toFixed(1)}${type === TYPE.PHYSICAL ? "物理" : "魔法"}伤害，护盾吸收${absorbed.toFixed(1)}`);
  return loss;
}

function incoming(state, enemy, raw, type, options = {}) {
  if (state.p.hp <= 0) return;
  const chill = layers(enemy, STATUS.CHILL) * 0.06;
  const suppress = options.dot || enemy.suppressUntil < state.round ? 0 : enemy.suppress;
  if (!options.dot) enemy.suppress = 0;
  const armor = state.p.armor * (state.p.ironUntil >= state.round ? 1.2 : 1);
  let amount = armorDamage(raw * (1 - chill) * (1 - suppress), armor);
  if (!options.dot) amount *= 1 - state.p.guard;
  const absorbed = Math.min(state.p.shield, amount);
  state.p.shield -= absorbed;
  state.p.excessShield -= Math.min(state.p.excessShield, absorbed);
  state.shielded += absorbed;
  if (has(state, "store") && !options.dot) {
    state.p.stored = Math.min(state.p.a * 0.8, state.p.stored + absorbed * 0.4);
  }
  const loss = Math.min(state.p.hp, amount - absorbed);
  state.p.hp -= loss;
  state.incoming += loss;
  if (loss > 0) state.p.hurtAt = state.round;
  note(state, `  ${enemy.name}造成${loss.toFixed(1)}${type === TYPE.PHYSICAL ? "物理" : "魔法"}伤害，护盾吸收${absorbed.toFixed(1)}`);
  if (!options.dot && state.p.counter && state.p.hp > 0) {
    state.p.counter = false;
    hitEnemy(state, enemy, state.p.a * 0.9, TYPE.PHYSICAL);
    note(state, "  守反触发一次反击");
  }
}

function intent(enemy, round) {
  return enemy.pattern[(round - 1) % enemy.pattern.length];
}

function enemyAct(state, enemy, planning) {
  if (enemy.hp <= 0 || state.p.hp <= 0) return;
  const move = intent(enemy, state.round);
  const attacking = ["strike", "heavy", "flurry", "slam", "bolt"].includes(move);
  note(state, `敌方：${enemy.name}使用${move}`);
  if (enemy.mine && attacking) {
    hitEnemy(state, enemy, enemy.mine.power, TYPE.MAGIC);
    if (enemy.hp > 0) addStatus(state, enemy, STATUS.MARK, 1);
    enemy.mine = null;
    if (enemy.hp <= 0) return;
  }
  const factor = randomFactor(state, enemy.id, planning);
  if (move === "guard") enemy.guard = 0.35;
  else if (move === "ward") enemy.shield = Math.min(enemy.shield + 42, enemy.maxHp * 0.3);
  else if (move === "charge") enemy.charged = true;
  else if (move === "purify") {
    const types = [STATUS.BURN, STATUS.BLEED, STATUS.CHILL, STATUS.MARK].filter(t => layers(enemy, t) > 0).slice(0, 2);
    enemy.statuses = enemy.statuses.filter(s => !types.includes(s.type));
    note(state, `  净化${types.map(t => STATUS_NAMES[t]).join("、") || "无状态"}`);
  } else if (move === "mend") {
    const reduction = layers(enemy, STATUS.BLEED) >= 3 ? 0.3 : 0;
    const recovered = Math.min(enemy.maxHp - enemy.hp, enemy.maxHp * 0.12 * (1 - reduction));
    enemy.hp += recovered;
    note(state, `  敌方恢复${recovered.toFixed(1)}生命`);
  } else if (move === "bolt") {
    incoming(state, enemy, enemy.s * 1.3 * factor, TYPE.MAGIC);
    if (state.p.hp > 0) addStatus(state, state.p, STATUS.BURN, 1, enemy.s * 0.12);
  } else {
    const mul = move === "heavy" ? 1.5 : move === "slam" ? (enemy.charged ? 2.2 : 1.3) : move === "flurry" ? 1.2 : 1;
    incoming(state, enemy, enemy.a * mul * factor, TYPE.PHYSICAL);
    if (move === "slam") enemy.charged = false;
  }
}

function effectiveCost(state, skill) {
  const discount = has(state, "alternate") && state.p.lastKind === TYPE.MAGIC && skill.kind === TYPE.PHYSICAL ? 2 : 0;
  return Math.max(0, skill.mp - discount);
}

function bloodCost(state) {
  return Math.max(4, Math.ceil(state.p.hp * 0.04));
}

function legal(state, skill, target) {
  if (state.p.hp <= 0 || !alive(state).length) return false;
  if (state.round <= (state.p.cds[skill.code] ?? 0) || state.p.mp < effectiveCost(state, skill)) return false;
  if (["bloodrage", "bloodcast", "convert"].includes(skill.code)) {
    if (state.p.hp <= bloodCost(state)) return false;
  }
  if (skill.code === "convert" && (state.p.convertUses >= 3 || state.p.mp >= state.p.maxMp)) return false;
  if (skill.code === "bloodrage" && state.p.rage > 0) return false;
  if (skill.code === "execute" && (!target || target.hp > target.maxHp * 0.3)) return false;
  if (skill.code === "mine" && target?.mine) return false;
  const required = {
    bloodpay: [STATUS.BLEED, 1], sever: [STATUS.BLEED, 2],
    ashward: [STATUS.BURN, 1], firebreath: [STATUS.BURN, 1],
    frostheal: [STATUS.CHILL, 1], frostseal: [STATUS.CHILL, 2],
    recall: [STATUS.MARK, 1], thunderward: [STATUS.MARK, 1],
  }[skill.code];
  if (required && (!target || layers(target, required[0]) < required[1])) return false;
  return true;
}

function playerAct(state, action, tactical = false) {
  const skill = BY_CODE[action.code];
  const target = state.enemies.find(e => e.id === action.target && e.hp > 0);
  assert(legal(state, skill, target), `非法技能：${skill.code}`);
  const p = state.p;
  const cost = effectiveCost(state, skill);
  p.mp -= cost;
  state.mpSpent += cost;
  if (tactical) state.tacticalActs++;
  else state.playerActs++;
  state.actionCounts[skill.code] = (state.actionCounts[skill.code] ?? 0) + 1;
  if (skill.cd) p.cds[skill.code] = state.round + skill.cd;
  note(state, `己方：${skill.name}${target ? ` → ${target.name}` : ""}，耗蓝${cost}`);
  const direct = [TYPE.PHYSICAL, TYPE.MAGIC, TYPE.MIXED].includes(skill.kind);
  const alternate = has(state, "alternate") && p.lastKind === TYPE.PHYSICAL && skill.kind === TYPE.MAGIC ? 0.15 : 0;
  const bonus = direct ? (1 + p.hidden * 0.15 + (p.rage > 0 ? 0.4 : 0) + alternate) : 1;
  const stored = direct ? p.stored : 0;
  if (direct) {
    p.hidden = 0;
    p.stored = 0;
    if (p.rage > 0) p.rage--;
  }
  if (direct && has(state, "alternate")) p.lastKind = skill.kind === TYPE.MIXED ? 0 : skill.kind;
  let hpDamage = 0;
  let physicalHit = false;
  const dealt = (raw, type, foe = target, options = {}) => {
    const loss = hitEnemy(state, foe, raw * bonus, type, options);
    hpDamage += loss;
    if (loss > 0 && type === TYPE.PHYSICAL) physicalHit = true;
    return loss;
  };
  const consume = (type, count) => takeStatus(state, target, type, count, skill.name);
  const consumedPower = rows => rows.reduce((n, row) => n + row.power * row.ticks, 0);
  const add = (type, count, power = 0, ticks = 3) => {
    if (target?.hp > 0) addStatus(state, target, type, count, power, ticks);
  };
  switch (skill.code) {
    case "basic":
      dealt(p.a, TYPE.PHYSICAL);
      if (hpDamage > 0) restoreMp(state, 2, "普攻");
      break;
    case "guard": p.guard = 0.4; break;
    case "rend": dealt(p.a * 1.1, TYPE.PHYSICAL); add(STATUS.BLEED, 1, p.a * 0.1); break;
    case "sunder": dealt(p.a, TYPE.PHYSICAL); if (target.hp > 0) target.sunderUntil = state.round + 1; break;
    case "shatter": dealt(p.a * 1.4, TYPE.PHYSICAL, target, { shieldBonus: 2 }); break;
    case "spin":
      for (let i = 0; i < 3; i++) {
        const loss = dealt(p.a * 0.45, TYPE.PHYSICAL);
        if (i === 2 && loss > 0) add(STATUS.BLEED, 1, p.a * 0.1);
      }
      break;
    case "execute":
      dealt(p.a * 2.2, TYPE.PHYSICAL);
      if (target.hp <= 0) restoreMp(state, cost, "斩命返还");
      break;
    case "ignite": dealt(p.s * 0.9, TYPE.MAGIC); add(STATUS.BURN, 2, p.s * 0.15); break;
    case "firewind": {
      const copied = target.statuses.filter(s => s.type === STATUS.BURN).slice(0, 2).map(clone);
      for (const foe of alive(state)) {
        dealt(p.s * 0.7, TYPE.MAGIC, foe);
        if (foe !== target && foe.hp > 0) for (const row of copied) addStatus(state, foe, STATUS.BURN, 1, row.power, row.ticks);
      }
      break;
    }
    case "detonate": {
      const rows = consume(STATUS.BURN, 5);
      dealt(p.s * 1.4 + consumedPower(rows) * 1.25, TYPE.MAGIC);
      if (rows.length >= 3 && target.hp > 0 && has(state, "ember")) add(STATUS.BURN, 1, p.s * 0.15);
      break;
    }
    case "frost": dealt(p.s * 1.1, TYPE.MAGIC); add(STATUS.CHILL, 2); break;
    case "icebreak": {
      const n = consume(STATUS.CHILL, 3).length;
      dealt(p.a * 1.2, TYPE.PHYSICAL);
      dealt(p.s * 0.8 * n, TYPE.MAGIC);
      break;
    }
    case "spark": dealt(p.s * 1.2, TYPE.MAGIC); add(STATUS.MARK, 1); break;
    case "thunder": {
      const n = consume(STATUS.MARK, 2).length;
      dealt(p.s * 1.8 * (1 + n * 0.3), TYPE.MAGIC);
      break;
    }
    case "mine": target.mine = { power: p.s * 1.8, until: state.round + 1 }; break;
    case "iron": giveShield(state, p.maxHp * 0.12 + p.armor, "铁衣"); p.ironUntil = state.round + 1; break;
    case "counter": p.guard = 0.5; p.counter = true; break;
    case "shieldhit": {
      const spent = p.shield * 0.5;
      p.shield -= spent;
      p.excessShield -= Math.min(p.excessShield, spent);
      dealt(p.a * 1.2 + spent * 2, TYPE.PHYSICAL, target, { shieldBonus: 2 });
      break;
    }
    case "bloodrage":
    case "bloodcast":
    case "convert": {
      const paid = bloodCost(state);
      p.hp -= paid;
      state.paidHp += paid;
      note(state, `  支付生命${paid}，不计受击与护盾吸收`);
      if (skill.code === "bloodrage") { dealt(p.a * 0.9, TYPE.PHYSICAL); p.rage = 2; }
      else if (skill.code === "bloodcast") dealt(p.s * 2, TYPE.MAGIC);
      else { dealt(p.a, TYPE.PHYSICAL); p.convertUses++; restoreMp(state, 12, "化灵"); }
      break;
    }
    case "leech": dealt(p.a * 1.1, TYPE.PHYSICAL); healPlayer(state, hpDamage * 0.3, "饮血刃", true); break;
    case "heal": healPlayer(state, p.maxHp * 0.1 + p.s * 0.5, "回春"); break;
    case "cleanse": {
      const types = [...new Set(p.statuses.map(s => s.type))].slice(0, 2);
      p.statuses = p.statuses.filter(s => !types.includes(s.type));
      healPlayer(state, p.maxHp * 0.03, "涤尘");
      break;
    }
    case "pierce": {
      const n = consume(STATUS.MARK, 1).length;
      dealt(p.a, TYPE.PHYSICAL, target, { pierce: n ? 0.5 : 0 });
      dealt(p.s, TYPE.MAGIC);
      break;
    }
    case "flameblade":
      dealt(p.a * 1.3, TYPE.PHYSICAL);
      dealt(p.s * 0.1 * layers(target, STATUS.BURN), TYPE.MAGIC);
      break;
    case "bloodpay": healPlayer(state, p.a * 0.3 * consume(STATUS.BLEED, 2).length, "血偿"); break;
    case "sever":
      consume(STATUS.BLEED, 2); dealt(p.a * 1.4, TYPE.PHYSICAL);
      target.suppress = Math.max(target.suppressUntil >= state.round ? target.suppress : 0, 0.4);
      target.suppressUntil = state.round + 1;
      break;
    case "ashward": giveShield(state, Math.min(p.maxHp * 0.15, consumedPower(consume(STATUS.BURN, 2)) * 0.6), "灰烬衣"); break;
    case "firebreath": restoreMp(state, consume(STATUS.BURN, 2).length * 2, "火息"); break;
    case "frostheal": {
      const n = consume(STATUS.CHILL, 2).length;
      healPlayer(state, p.maxHp * 0.04 * n, "回霜");
      const first = p.statuses[0]?.type;
      if (first) p.statuses = p.statuses.filter(s => s.type !== first);
      break;
    }
    case "frostseal":
      consume(STATUS.CHILL, 2);
      target.suppress = Math.max(target.suppressUntil >= state.round ? target.suppress : 0, 0.45);
      target.suppressUntil = state.round + 1;
      break;
    case "recall": restoreMp(state, consume(STATUS.MARK, 2).length * 2, "雷回流"); break;
    case "thunderward": giveShield(state, p.maxHp * 0.06 * consume(STATUS.MARK, 2).length, "霆护"); break;
    case "sweep": for (const foe of alive(state)) dealt(p.a * 0.8, TYPE.PHYSICAL, foe); break;
    case "chain": {
      const n = consume(STATUS.MARK, 2).length;
      for (const foe of alive(state)) dealt(p.s * (1 + n * 0.2), TYPE.MAGIC, foe);
      break;
    }
    default: throw Error(`未实现技能${skill.code}`);
  }
  // 附加伤害、吸血、反击、持续伤害不递归触发技能被动；群攻与多段也只处理一次。
  if (stored > 0 && target?.hp > 0) {
    hitEnemy(state, target, stored, skill.kind === TYPE.MAGIC ? TYPE.MAGIC : TYPE.PHYSICAL);
  }
  if (physicalHit && target?.hp > 0 && target.sunderUntil >= state.round && has(state, "gap")) {
    add(STATUS.BLEED, 1, p.a * 0.1);
  }
  if (!direct && !tactical && has(state, "hidden")) p.hidden = Math.min(2, p.hidden + 1);
}

function endRound(state) {
  // 所有层数在整轮末结算；施加当轮为第一次，持续三回合即最多三次。
  for (const unit of [...state.enemies, state.p]) {
    if (unit.hp <= 0) continue;
    for (const row of unit.statuses) {
      if (unit.hp <= 0) break;
      if (row.type === STATUS.BLEED || row.type === STATUS.BURN) {
        const type = row.type === STATUS.BLEED ? TYPE.PHYSICAL : TYPE.MAGIC;
        if (unit === state.p) {
          const source = { name: "持续状态", statuses: [], suppress: 0 };
          incoming(state, source, row.power, type, { dot: true });
        } else hitEnemy(state, unit, row.power, type, { dot: true });
      }
    }
    unit.statuses = unit.statuses.filter(row => --row.ticks > 0);
    if (unit !== state.p && unit.mine && unit.mine.until <= state.round) {
      note(state, `  ${unit.name}身上的伏雷到期失效`);
      unit.mine = null;
    }
    if (!alive(state).length) break;
  }
}

function roundStep(original, action, planning = false) {
  const state = clone(original);
  state.log = [];
  const actors = [{ player: true, speed: state.p.speed, order: -1 }, ...state.enemies.map(e => ({ enemy: e, speed: e.speed, order: e.id }))]
    .sort((a, b) => b.speed - a.speed || a.order - b.order);
  note(state, `第${state.round}回合开始：生命${state.p.hp.toFixed(1)}，法力${state.p.mp.toFixed(1)}，护盾${state.p.shield.toFixed(1)}`);
  for (const actor of actors) {
    if (state.p.hp <= 0 || !alive(state).length) break;
    if (actor.player) {
      state.p.guard = 0;
      state.p.counter = false;
      if (action.tactical) {
        const tacticalTarget = state.enemies.find(e => e.id === action.tactical.target && e.hp > 0);
        if (tacticalTarget && legal(state, BY_CODE[action.tactical.code], tacticalTarget)) playerAct(state, action.tactical, true);
      }
      const target = state.enemies.find(e => e.id === action.target && e.hp > 0) ?? alive(state)[0];
      const chosen = { ...action, target: target?.id };
      // 更快的敌人可能清除状态或抢先击杀目标，此时重新检查，不允许非法消费。
      if (legal(state, BY_CODE[chosen.code], target)) playerAct(state, chosen);
      else playerAct(state, { code: "basic", target: alive(state)[0].id });
    } else {
      actor.enemy.guard = 0;
      enemyAct(state, actor.enemy, planning);
    }
  }
  if (state.p.hp > 0 && alive(state).length) endRound(state);
  state.won = state.p.hp > 0 && alive(state).length === 0;
  state.lost = state.p.hp <= 0;
  note(state, `回合结束：生命${state.p.hp.toFixed(1)}，法力${state.p.mp.toFixed(1)}，敌生命${alive(state).map(e => `${e.name}:${e.hp.toFixed(1)}`).join("，") || "0"}`);
  state.round++;
  return state;
}

function mainChoices(state) {
  const result = [];
  const targetCodes = new Set(["basic", "rend", "sunder", "shatter", "spin", "execute", "ignite", "firewind", "detonate", "frost", "icebreak", "spark", "thunder", "mine", "shieldhit", "leech", "bloodcast", "bloodrage", "convert", "pierce", "flameblade", "bloodpay", "sever", "ashward", "firebreath", "frostheal", "frostseal", "recall", "thunderward", "chain"]);
  for (const code of ["basic", "guard", ...state.build.skills]) {
    if (TACTICAL.has(code)) continue;
    const skill = BY_CODE[code];
    const targets = targetCodes.has(code) ? alive(state) : [alive(state)[0]];
    for (const target of targets) if (legal(state, skill, target)) result.push({ code, target: target.id });
  }
  return result;
}

function choices(state) {
  const result = mainChoices(state);
  for (const code of state.build.skills.filter(s => TACTICAL.has(s))) {
    for (const target of alive(state)) {
      if (!legal(state, BY_CODE[code], target)) continue;
      const next = clone(state);
      next.tracing = false;
      const tactical = { code, target: target.id };
      playerAct(next, tactical, true);
      for (const action of mainChoices(next)) result.push({ ...action, tactical });
    }
  }
  return result;
}

function value(state) {
  if (state.lost) return -100000 - alive(state).reduce((n, e) => n + e.hp, 0);
  const resourceWeight = state.campaign ? 0.9 : 0.35;
  const hpWeight = state.conservative ? 1.8 : 1.0;
  const player = state.p.hp * hpWeight + state.p.shield * 0.5 + state.p.mp * resourceWeight;
  if (state.won) return 100000 + player - state.playerActs * 0.3;
  const enemies = alive(state);
  let enemyValue = enemies.reduce((n, e) => n + e.hp + e.shield * 0.7, 0);
  for (const e of enemies) {
    const future = remaining(e, STATUS.BLEED) + remaining(e, STATUS.BURN);
    enemyValue -= Math.min(e.hp, future) * 0.65;
    enemyValue -= layers(e, STATUS.CHILL) * e.a * 0.06 * 1.2;
    enemyValue -= layers(e, STATUS.MARK) * state.p.s * 0.15;
    if (e.mine) enemyValue -= Math.min(e.hp, e.mine.power) * 0.55;
  }
  const meanArmor = enemies.reduce((n, e) => n + e.armor, 0) / enemies.length;
  const rageValue = state.p.rage * 0.4 * Math.max(state.p.a * 1.1, state.p.s * 2) * 0.8 * 100 / (100 + meanArmor);
  return player - enemyValue - enemies.length * 22 + state.p.hidden * state.p.a * 0.1 + state.p.stored * 0.6 + rageValue - state.playerActs * 0.3;
}

function chooseAction(state) {
  // 全构筑共用两回合、宽度四的前瞻；规划只使用平均伤害和公开敌方轮换，不读取未来扰动。
  const first = choices(state).map(action => {
    const next = roundStep(state, action, true);
    next.tracing = false;
    return { action, next, score: value(next) };
  }).sort((a, b) => b.score - a.score).slice(0, 4);
  for (const row of first) {
    if (row.next.won || row.next.lost) continue;
    let best = -Infinity;
    for (const action of choices(row.next)) best = Math.max(best, value(roundStep(row.next, action, true)));
    row.score = best * 0.85 + row.score * 0.15;
  }
  first.sort((a, b) => b.score - a.score);
  return first[0]?.action;
}

function validate(state) {
  const p = state.p;
  for (const x of [p.hp, p.mp, p.shield, state.totalDamage, state.incoming]) assert(Number.isFinite(x));
  assert(p.hp >= 0 && p.hp <= p.maxHp + 1e-7);
  assert(p.mp >= -1e-7 && p.mp <= p.maxMp + 1e-7);
  assert(p.shield >= -1e-7 && p.shield <= p.maxHp * 0.3 + 1e-7);
  assert(p.excessShield >= -1e-7 && p.excessShield <= Math.min(p.shield, p.maxHp * 0.1) + 1e-7);
  for (const unit of [p, ...state.enemies]) {
    assert(unit.hp >= 0 && unit.hp <= (unit.maxHp ?? p.maxHp) + 1e-7);
    assert(unit.shield >= -1e-7);
    for (const type of Object.values(STATUS)) assert(layers(unit, type) <= LIMIT[type]);
  }
}

function battle(build, scenario, seed, options = {}) {
  let state = makeState(build, scenario, seed, options);
  state.tracing = !!options.trace;
  const history = [];
  while (!state.won && !state.lost && state.round <= 45) {
    const action = chooseAction(state);
    if (!action) throw Error("存活战斗没有合法行动");
    state = roundStep(state, action);
    validate(state);
    if (options.trace) history.push(...state.log);
  }
  return {
    won: state.won, lost: state.lost, timeout: !state.won && !state.lost,
    rounds: state.round - 1, hp: state.p.hp, mp: state.p.mp,
    damage: state.totalDamage, incoming: state.incoming, healing: state.healing,
    absorbed: state.shielded, paidHp: state.paidHp, dotDamage: state.dotDamage,
    physicalDamage: state.physicalDamage, magicDamage: state.magicDamage,
    mpSpent: state.mpSpent, mpRecovered: state.mpRecovered,
    actionCounts: state.actionCounts, conversions: state.conversions, tacticalActs: state.tacticalActs,
    seed, history,
  };
}

function campaign(build, seed, options = {}) {
  let hp = 260;
  let mp = 48;
  const fights = [];
  for (const [index, scenario] of CHAIN.entries()) {
    const result = battle(build, scenario, seed + scenario.id * 101, { ...options, hp, mp, campaign: true });
    fights.push({ scenario: scenario.name, ...result });
    hp = result.hp;
    mp = result.mp;
    if (!result.won) break;
    if (options.resupply && [1, 3].includes(index)) {
      hp = Math.min(260, hp + 52);
      mp = Math.min(48, mp + 12);
    }
  }
  return {
    cleared: fights.length === CHAIN.length && fights.every(f => f.won),
    wins: fights.filter(f => f.won).length, hp, mp, fights,
    rounds: fights.reduce((n, f) => n + f.rounds, 0),
  };
}

function summary(results) {
  const wins = results.filter(r => r.won);
  const avg = (rows, field) => rows.length ? rows.reduce((n, r) => n + r[field], 0) / rows.length : null;
  return {
    n: results.length, wins: wins.length, winRate: wins.length / results.length,
    timeouts: results.filter(r => r.timeout).length,
    winRounds: avg(wins, "rounds"), winHp: avg(wins, "hp"), winMp: avg(wins, "mp"),
    rounds: avg(results, "rounds"), hp: avg(results, "hp"), mp: avg(results, "mp"),
    spent: avg(results, "mpSpent"), recovered: avg(results, "mpRecovered"),
    healing: avg(results, "healing"), paidHp: avg(results, "paidHp"),
    absorbed: avg(results, "absorbed"), dotDamage: avg(results, "dotDamage"),
    actions: results.reduce((all, r) => {
      for (const [code, count] of Object.entries(r.actionCounts)) all[code] = (all[code] ?? 0) + count;
      return all;
    }, {}),
    conversions: results.reduce((all, r) => {
      for (const [name, count] of Object.entries(r.conversions)) all[name] = (all[name] ?? 0) + count;
      return all;
    }, {}),
  };
}

function selfCheck() {
  let n = 0;
  const check = fn => { fn(); n++; };
  const fresh = () => makeState(BUILDS[1], SCENARIOS[3], 17);
  check(() => { assert.equal(armorDamage(60, 100), 30); assert.equal(armorDamage(0, 100), 0); });
  check(() => {
    const s = fresh(); addStatus(s, s.enemies[0], STATUS.BURN, 2, 5);
    endRound(s); endRound(s); endRound(s);
    assert.equal(layers(s.enemies[0], STATUS.BURN), 0);
    assert.equal(s.dotDamage, 24);
  });
  check(() => {
    const s = fresh(); addStatus(s, s.enemies[0], STATUS.BURN, 1, 5);
    s.round++; addStatus(s, s.enemies[0], STATUS.BURN, 1, 8);
    s.enemies[0].statuses[0].ticks = 1;
    assert.deepEqual(s.enemies[0].statuses.map(x => x.power), [5, 8]);
    assert.deepEqual(s.enemies[0].statuses.map(x => x.ticks), [1, 3]);
  });
  check(() => {
    const s = fresh(); addStatus(s, s.enemies[0], STATUS.BURN, 9, 5);
    assert.equal(layers(s.enemies[0], STATUS.BURN), 5);
    const rows = takeStatus(s, s.enemies[0], STATUS.BURN, 2, "测试");
    assert.equal(rows.length, 2); assert.equal(layers(s.enemies[0], STATUS.BURN), 3);
  });
  check(() => {
    const s = fresh(); addStatus(s, s.enemies[0], STATUS.BURN, 2, 5);
    playerAct(s, { code: "detonate", target: 0 });
    assert.equal(remaining(s.enemies[0], STATUS.BURN), 0);
    const before = s.totalDamage; endRound(s); assert.equal(s.totalDamage, before);
  });
  check(() => {
    const s = fresh(); s.p.mp = 0; const before = clone(s);
    assert(!legal(s, BY_CODE.ignite, s.enemies[0])); assert.deepEqual(s, before);
  });
  check(() => {
    const s = fresh(); s.p.hp = 4; assert(!legal(s, BY_CODE.bloodcast, s.enemies[0]));
    s.p.hp = 260; s.p.shield = 50; playerAct(s, { code: "bloodcast", target: 0 });
    assert.equal(s.p.hp, 249); assert.equal(s.p.shield, 50); assert.equal(s.incoming, 0);
  });
  check(() => {
    const s = fresh(); s.p.hp = 200; s.enemies[0].shield = 500;
    playerAct(s, { code: "leech", target: 0 }); assert.equal(s.healing, 0);
    s.enemies[0].shield = 0; s.enemies[0].hp = 1; playerAct(s, { code: "leech", target: 0 });
    assert(Math.abs(s.healing - 0.3) < 1e-6);
  });
  check(() => {
    const s = fresh(); playerAct(s, { code: "heal", target: 0 });
    assert(!legal(s, BY_CODE.heal, s.enemies[0])); s.round = 3;
    assert(!legal(s, BY_CODE.heal, s.enemies[0])); s.round = 4;
    assert(legal(s, BY_CODE.heal, s.enemies[0]));
  });
  check(() => {
    const s = fresh(); s.enemies[0].hp = 1;
    const next = roundStep(s, { code: "basic", target: 0 });
    assert(next.won); assert.equal(next.incoming, 0);
  });
  check(() => {
    const s = makeState(BUILDS[0], SCENARIOS[0], 17);
    s.enemies[0].sunderUntil = 10; playerAct(s, { code: "spin", target: 0 });
    assert.equal(layers(s.enemies[0], STATUS.BLEED), 2);
  });
  check(() => {
    const s = makeState(BUILDS[4], SCENARIOS[0], 17);
    s.p.shield = 60; playerAct(s, { code: "shieldhit", target: 0 });
    assert.equal(s.p.shield, 30); assert.equal(s.p.stored, 0);
  });
  check(() => {
    const s = fresh(); s.p.mp = 0; s.p.hp = 100;
    addStatus(s, s.enemies[0], STATUS.MARK, 3);
    playerAct(s, { code: "recall", target: 0 });
    assert.equal(s.p.mp, 4); assert.equal(layers(s.enemies[0], STATUS.MARK), 1);
  });
  check(() => {
    const s = makeState(BUILDS[2], SCENARIOS[3], 17);
    playerAct(s, { code: "frost", target: 0 }); endRound(s); s.round++;
    playerAct(s, { code: "frost", target: 0 }); endRound(s); s.round++;
    assert.equal(layers(s.enemies[0], STATUS.CHILL), 3);
    assert(legal(s, BY_CODE.frostseal, s.enemies[0]));
  });
  check(() => {
    const s = fresh(); s.p.hp = 150;
    addStatus(s, s.enemies[0], STATUS.BURN, 2, 5);
    playerAct(s, { code: "ashward", target: 0 }, true);
    assert.equal(s.playerActs, 0); assert.equal(s.tacticalActs, 1); assert.equal(s.p.hidden, 0);
    assert.equal(layers(s.enemies[0], STATUS.BURN), 0);
  });
  check(() => {
    const s = fresh(); s.p.hp = 100;
    addStatus(s, s.enemies[0], STATUS.CHILL, 3);
    playerAct(s, { code: "frostseal", target: 0 });
    assert.equal(layers(s.enemies[0], STATUS.CHILL), 1);
    assert.equal(s.convertedLayers, 2);
    assert.equal(s.enemies[0].suppress, 0.45);
    incoming(s, s.enemies[0], 100, TYPE.PHYSICAL);
    assert.equal(s.enemies[0].suppress, 0);
  });
  check(() => {
    const s = fresh(); giveShield(s, 1000, "测试");
    assert.equal(s.p.shield, 78);
    const low = clone(s); low.p.shield = 0;
    incoming(s, s.enemies[0], 60, TYPE.MAGIC);
    incoming(low, low.enemies[0], 60, TYPE.MAGIC);
    assert.equal(s.p.hp, 260); assert.equal(low.p.hp, 206);
  });
  check(() => {
    const s = fresh(); const action = { code: "ignite", target: 0 };
    assert.deepEqual(roundStep(s, action), roundStep(s, action));
    assert.deepEqual(s, fresh());
  });
  check(() => {
    const s = makeState(BUILDS[1], SCENARIOS[3], 17);
    addStatus(s, s.enemies[0], STATUS.BURN, 2, 5);
    const list = choices(s);
    assert(list.some(a => a.tactical?.code === "ashward"));
    assert(list.every(a => !TACTICAL.has(a.code)));
  });
  check(() => {
    const s = fresh();
    s.build.passives = ["excess"];
    healPlayer(s, 100, "测试吸血", true);
    healPlayer(s, 100, "测试吸血", true);
    assert.equal(s.p.excessShield, 26);
    assert.equal(s.p.shield, 26);
  });
  check(() => {
    const s = fresh(); s.p.mp = 40; s.enemies[0].shield = 1000;
    playerAct(s, { code: "basic", target: 0 });
    assert.equal(s.p.mp, 40);
    s.enemies[0].shield = 0;
    playerAct(s, { code: "basic", target: 0 });
    assert.equal(s.p.mp, 42);
  });
  check(() => {
    const s = fresh(); s.round = 3;
    s.enemies[0].suppress = 0.45; s.enemies[0].suppressUntil = 1;
    addStatus(s, s.enemies[0], STATUS.BLEED, 2, 3);
    playerAct(s, { code: "sever", target: 0 });
    assert.equal(s.enemies[0].suppress, 0.4);
    assert.equal(s.enemies[0].suppressUntil, 4);
  });
  check(() => {
    const s = fresh(); const foe = s.enemies[0];
    foe.hp = foe.maxHp * 0.3 + 0.01;
    assert(!legal(s, BY_CODE.execute, foe));
    foe.hp = foe.maxHp * 0.3;
    assert(legal(s, BY_CODE.execute, foe));
    playerAct(s, { code: "execute", target: 0 });
    assert.equal(s.totalDamage, armorDamage(s.p.a * 2.2, foe.armor));
  });
  check(() => {
    const s = fresh(); s.p.hp = 100;
    assert.equal(bloodCost(s), 4);
    s.p.shield = 78;
    playerAct(s, { code: "bloodrage", target: 0 });
    assert.equal(s.p.hp, 96); assert.equal(s.p.shield, 78);
    assert.equal(s.p.rage, 2); assert.equal(s.playerActs, 1);
    assert.equal(s.totalDamage, armorDamage(s.p.a * 0.9, s.enemies[0].armor));
    assert(!legal(s, BY_CODE.bloodrage, s.enemies[0]));
    playerAct(s, { code: "basic", target: 0 });
    assert.equal(s.p.rage, 1);
    playerAct(s, { code: "basic", target: 0 });
    assert.equal(s.p.rage, 0);
  });
  check(() => {
    const s = fresh(); s.p.mp = 0; s.p.hp = 100;
    playerAct(s, { code: "convert", target: 0 });
    assert.equal(s.p.mp, 12); assert.equal(s.p.hp, 96);
    assert.equal(s.p.convertUses, 1); assert(s.totalDamage > 0);
    s.round = 5; s.p.convertUses = 3;
    assert(!legal(s, BY_CODE.convert, s.enemies[0]));
  });
  check(() => {
    const s = fresh(); s.build.passives = ["alternate"];
    s.p.lastKind = TYPE.MAGIC; s.p.mp = 20; s.enemies[0].hp = 1;
    playerAct(s, { code: "execute", target: 0 });
    assert.equal(s.mpSpent, 1); assert.equal(s.mpRecovered, 1);
    assert.equal(s.p.mp, 20);
  });
  check(() => {
    const s = fresh(); s.p.shield = 60; s.enemies[0].shield = 20;
    const base = armorDamage(s.p.a * 1.2 + 60, s.enemies[0].armor);
    playerAct(s, { code: "shieldhit", target: 0 });
    assert.equal(s.p.shield, 30); assert.equal(s.p.stored, 0);
    assert.equal(s.enemies[0].shield, 0);
    assert.equal(s.totalDamage, base - 10);
  });
  check(() => {
    const s = fresh(); s.p.hp = 4.01; s.p.mp = 20;
    assert(legal(s, BY_CODE.bloodcast, s.enemies[0]));
    playerAct(s, { code: "bloodcast", target: 0 });
    assert(s.p.hp > 0 && s.p.hp < 0.02);
    incoming(s, s.enemies[0], 1, TYPE.PHYSICAL);
    assert.equal(s.p.hp, 0);
  });
  check(() => {
    const s = fresh(); s.p.hp = 100; s.p.mp = 47;
    playerAct(s, { code: "convert", target: 0 });
    assert.equal(s.p.mp, 48); assert.equal(s.mpRecovered, 1);
    assert.equal(s.p.hp, 96); assert.equal(s.p.hidden, 0);
  });
  for (const skill of SKILLS) check(() => {
    const s = fresh();
    s.p.hp = 200; s.p.mp = 24; s.p.shield = 30;
    for (const type of Object.values(STATUS)) addStatus(s, s.enemies[0], type, LIMIT[type], 3);
    addStatus(s, s.p, STATUS.BURN, 1, 3);
    if (skill.code === "execute") s.enemies[0].hp = s.enemies[0].maxHp * 0.3;
    assert(legal(s, skill, s.enemies[0]));
    playerAct(s, { code: skill.code, target: 0 }, TACTICAL.has(skill.code));
    validate(s);
    assert.equal(s.playerActs, TACTICAL.has(skill.code) ? 0 : 1);
  });
  return n;
}

function writeReport(output) {
  const pct = x => `${(x * 100).toFixed(1)}%`;
  const num = x => x == null ? "-" : x.toFixed(1);
  const rowsFor = (build, equal = false) => output.singles.filter(r => r.build === build && r.equal === equal);
  const aggregate = rows => {
    const wins = rows.reduce((n, row) => n + row.summary.wins, 0);
    const n = rows.reduce((v, row) => v + row.summary.n, 0);
    const weighted = field => wins ? rows.reduce((v, row) => v + (row.summary[field] ?? 0) * row.summary.wins, 0) / wins : null;
    return { wins, n, rate: wins / n, rounds: weighted("winRounds"), hp: weighted("winHp"), mp: weighted("winMp") };
  };
  const countFights = list => list.reduce((n, row) => n + row.runs.reduce((v, run) => v + run.fights.length, 0), 0);
  const counts = {
    singles: output.singles.reduce((n, row) => n + row.summary.n, 0),
    campaignFights: countFights(output.campaigns),
    resuppliedFights: countFights(output.resuppliedCampaigns),
    sensitivity: output.sensitivity.reduce((n, row) => n + row.summary.n, 0),
    ablations: output.ablations.reduce((n, row) => n + row.full.n + row.withoutConversions.n, 0),
    traces: output.traces.length,
    variants: (output.variants ?? []).reduce((n, row) => n + row.summary.n, 0),
    resourceTrials: (output.resourceTrials ?? []).reduce((n, row) => n + row.summary.n, 0),
  };
  counts.total = Object.values(counts).reduce((n, count) => n + count, 0);
  output.counts = counts;
  const lines = [
    "# 技能自由组合战斗对比报告", "",
    "日期：2026-11-23。独立设计模拟；本报告由同目录的`simulate.mjs`根据实际结果生成。未接入正式客户端。", "",
    "## 1. 实验边界", "",
    `- 本轮完整战斗共${counts.total}局：主矩阵${counts.singles}局，无补给连战中的实际战斗${counts.campaignFights}局，定额补给连战中的实际战斗${counts.resuppliedFights}局，敏感性${counts.sensitivity}局，消融${counts.ablations}局，替换搭配${counts.variants}局，低蓝换血专项${counts.resourceTrials}局，独立战报${counts.traces}局。重复对照单独计局，不把它们视为不同内容或独立设计样本。`,
    `- 规则检查${output.checks}项通过，其中包含36项通用行动/可选技能的逐项合法执行检查。`,
    `- 种子：${output.seeds.join("、")}。主矩阵每个组合在每类敌人下运行${output.seeds.length}次。`,
    "- 同预算：生命260、法力48、护甲12、速度10，七项可选能力、两项被动，攻击与精神之和44。先比较全体22/22，再比较各组合专精分配。",
    "- 八类敌人均从满血满蓝开始；五连战保留血蓝，无补给与定额补给分别计算。没有装备、药品随机、地图收益或敌方蓝量枯竭。",
    "- 玩家每回合一次主动行动；自身行动前可选一次战术转化。统一两回合、宽度四的前瞻，不读取未来随机扰动。它是有限启发式策略，不是最优解。", "",
    "## 2. 专精面板的完整对局", "",
    "单元格为胜场/总场；括号中是获胜局平均回合。失败局不会被当成快速通关。", "",
    `| 场景 | ${output.builds.map(b => b.name).join(" | ")} |`,
    `| --- | ${output.builds.map(() => "---").join(" | ")} |`,
  ];
  for (const scenario of output.scenarios) {
    const cells = output.builds.map(build => {
      const r = rowsFor(build.name).find(row => row.scenario === scenario.name).summary;
      return `${r.wins}/${r.n}${r.wins ? `（${num(r.winRounds)}回合）` : ""}`;
    });
    lines.push(`| ${scenario.name} | ${cells.join(" | ")} |`);
  }
  lines.push("", "## 3. 面板与资源对照", "",
    "剩余生命、法力和回合均只统计获胜局；不同组合胜出的场景不完全相同，不能仅用条件均值比较强弱。", "",
    "| 组合 | 同面板胜率 | 专精胜率 | 专精获胜回合 | 专精胜后生命 | 专精胜后法力 |",
    "| --- | --- | --- | --- | --- | --- |");
  for (const build of output.builds) {
    const equal = aggregate(rowsFor(build.name, true));
    const spec = aggregate(rowsFor(build.name));
    lines.push(`| ${build.name} | ${pct(equal.rate)}（${equal.wins}/${equal.n}） | ${pct(spec.rate)}（${spec.wins}/${spec.n}） | ${num(spec.rounds)} | ${num(spec.hp)} | ${num(spec.mp)} |`);
  }
  lines.push("", "## 4. 无补给与定额补给五连战", "",
    "定额补给只在第二、第四战获胜后各恢复最多52生命、12法力；两种预算使用完全相同的敌阵。失败后停止，不补死人。", "",
    "| 组合 | 无补给通关 | 无补给平均胜战数 | 定额补给通关 | 定额补给平均胜战数 |",
    "| --- | --- | --- | --- | --- |");
  for (const build of output.builds) {
    const base = output.campaigns.find(r => !r.equal && r.build === build.name);
    const supplied = output.resuppliedCampaigns.find(r => r.build === build.name);
    lines.push(`| ${build.name} | ${base.cleared}/${base.n} | ${num(base.avgWins)}/5 | ${supplied ? `${supplied.cleared}/${supplied.n}` : "-"} | ${supplied ? `${num(supplied.avgWins)}/5` : "-"} |`);
  }
  lines.push("", "## 5. 关键能力的消融", "",
    "在相同的前四个种子、八种敌人下，分别移除各组的状态转化与截脉、碎壁轰，或燃血和化灵；其他技能、被动、面板和策略不变。每项32局。能力数量减少本身也是实验差异，不将消融解释成已证明的最优平衡。", "",
    "| 组合 | 移除能力 | 完整胜场 | 移除后胜场 | 完整胜后回合/生命 | 移除后胜后回合/生命 |",
    "| --- | --- | --- | --- | --- | --- |");
  for (const row of output.ablations) {
    lines.push(`| ${row.build} | ${row.removed.map(c => BY_CODE[c].name).join("、") || "无，重复基准"} | ${row.full.wins}/${row.full.n} | ${row.withoutConversions.wins}/${row.withoutConversions.n} | ${num(row.full.winRounds)}/${num(row.full.winHp)} | ${num(row.withoutConversions.winRounds)}/${num(row.withoutConversions.winHp)} |`);
  }
  lines.push("", "## 6. 压力与策略敏感性", "",
    "每格32局，使用相同前四种子。敌方压力缩放同时改变生命、物理攻击和精神力，护甲、速度、行为不变。偏保命策略只把自身生命估值从1提高到1.8。低法力仍保留48法力上限，仅初始剩余为8。", "",
    "| 组合 | 敌方85%压力 | 标准压力 | 敌方115%压力 | 偏保命策略 | 初始8法力 |",
    "| --- | --- | --- | --- | --- | --- |");
  for (const build of output.builds) {
    const find = fn => output.sensitivity.find(row => row.build === build.name && fn(row));
    const ablation = output.ablations.find(row => row.build === build.name);
    const cells = [
      find(row => row.scale === 0.85)?.summary,
      ablation?.full,
      find(row => row.scale === 1.15)?.summary,
      find(row => row.conservative)?.summary,
      find(row => row.initialMp === 8)?.summary,
    ].map(s => s ? `${s.wins}/${s.n}` : "-");
    lines.push(`| ${build.name} | ${cells.join(" | ")} |`);
  }
  lines.push("", "## 7. 实际选择与状态消费", "",
    "以下只统计专精主矩阵的全部胜负局。次数是行为次数，消费是层数；两者不可混为一谈。", "",
    "| 组合 | 使用最多的六项行为 | 状态消费层数 | 本组未被选择的能力 |",
    "| --- | --- | --- | --- |");
  for (const build of output.builds) {
    const actions = {};
    const conversions = {};
    for (const row of rowsFor(build.name)) {
      for (const [code, count] of Object.entries(row.summary.actions)) actions[code] = (actions[code] ?? 0) + count;
      for (const [name, count] of Object.entries(row.summary.conversions)) conversions[name] = (conversions[name] ?? 0) + count;
    }
    const top = Object.entries(actions).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([code, count]) => `${BY_CODE[code].name}${count}次`);
    const converted = Object.entries(conversions).map(([name, count]) => `${name}${count}层`);
    const unused = build.skills.filter(code => !actions[code]).map(code => BY_CODE[code].name);
    lines.push(`| ${build.name} | ${top.join("、")} | ${converted.join("、") || "无"} | ${unused.join("、") || "无"} |`);
  }
  lines.push("", "初始8法力时血系三项能力的实际使用（仍为前四种子、八种敌人）：", "",
    "| 组合 | 燃血 | 血契 | 化灵 | 胜场 |", "| --- | --- | --- | --- | --- |");
  const lowBlood = output.sensitivity.find(row => row.build === "血蓝轮换" && row.initialMp === 8)?.summary;
  if (lowBlood) lines.push(`| 血蓝轮换 | ${lowBlood.actions.bloodrage ?? 0}次 | ${lowBlood.actions.bloodcast ?? 0}次 | ${lowBlood.actions.convert ?? 0}次 | ${lowBlood.wins}/${lowBlood.n} |`);
  lines.push("", "## 8. 设计判断", "",
    "1. 状态转化已有真实用途。血偿能用旧流血换生命；灰烬衣/火息、回霜/霜封、霆护/雷回流均被统一策略实际使用。不能只凭新增技能被使用就判定它们平衡。",
    "2. 移除血偿和截脉会减少放血组合的胜场，尚未单独拆出两者的贡献；火、寒、雷的新出口主要改变剩余资源、承伤或战斗时长，没有普遍增加胜场。它们提供选择，并非免费增伤。",
    "3. 收窄斩命后，裂帛、截脉和斩命都有实际用途。代价是放血专精从84/96降为82/96，少赢的两局都在蓄力首领；不为恢复旧胜率而取消斩杀门槛。完整条件和逐场配对见优化复测。",
    "4. 碎壁轰提高了消耗护盾的进攻收益：守势专精仍为84/96，平均获胜回合由15.9降至13.0；结界战由28.0降至12.6。消融中有碎壁轰的胜后生命低于移除后，体现主动花盾的代价；遇无盾首领仍约20回合，不把防御组合改成最快输出。",
    "5. 血蓝轮换由43/96提高到62/96，燃血与血契形成物法轮换；新胜出的难战常接近空血，胜后生命条件均值不可直接和旧均值比较。化灵在满蓝主矩阵仍未使用，带蓝死亡的问题尚在；低蓝专项中会使用，但没有增加该血系组合的胜场。它更适合精神专精且缺蓝的组合，养火组合替换火息后的低蓝对照见优化复测。",
    "6. 无补给五连战所有组合均未通关；定额补给能改变部分组合的结果，但火、寒、雷的持续资源预算仍不足。单场有用不等于连战可持续。",
    "7. 同面板和专精面板的差异明显，初始低法力也会改变结果。不能把这次胜率直接解释成状态或属性的固定强弱排名。", "",
    "## 9. 尚未覆盖", "",
    "- 决策器视野短，技能权重是启发式；偏保命策略有时更差，显示选择时机仍敏感。未做全技能池的最优搭配搜索，也没有真人操作验证。",
    "- 敌方使用固定公开轮换，没有付费法力、资源耗尽、智能应对或阶段变化；净化行为未必代表所有净化敌人。",
    "- 不含装备被动、品质、召唤、友军、地图补给投放、修理、技能学习成本；定额补给不能自动转成正式经济规则。",
    "- 物理和魔法共用护甲公式；没有额外魔抗、命中、暴击或行动条。取整和状态层数上限会影响小数值结果。",
    "- 破障槌、回旋刃、雷贯已补完整替换搭配；部分面板下替换反而减少胜场。不能据此宣称多段、破盾或穿甲在所有搭配中最优。",
    "- 参数完整保存在results.json，逐回合过程见逐回合战报.md。数值与机制均是待评审的实验方案。", "",
  );
  writeFileSync(fileURLToPath(new URL("./对比报告.md", import.meta.url)), lines.join("\n"), "utf8");
  writeOptimizationReport(output, aggregate, rowsFor);
}

function writeOptimizationReport(output, aggregate, rowsFor) {
  const baselinePath = fileURLToPath(new URL("./baseline.json", import.meta.url));
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  assert.deepEqual(output.seeds, baseline.seeds);
  assert.deepEqual(output.builds, baseline.builds);
  assert.deepEqual(output.scenarios, baseline.scenarios);
  assert.deepEqual(output.campaignScenarios, baseline.campaignScenarios);
  const num = x => x == null ? "-" : x.toFixed(1);
  const lines = [
    "# 第二轮技能优化与配对复测", "", "日期：2026-11-23。独立设计实验，未接入客户端或正式配置。", "",
    "## 1. 改动与代价", "",
    "| 能力 | 优化前 | 当前实验规则 |", "| --- | --- | --- |",
    "| 斩命 | 任意血量160%A，低于30%生命时240%A | 仅目标生命不高于30%时可用，220%A；击杀只返还实际耗蓝 |",
    "| 截脉 | 消费2流血，100%A，下一击压低40% | 消费和压制不变，攻击提高至140%A，仍占主动行动 |",
    "| 碎壁轰 | 消费一半盾，100%A+消费量 | 120%A+消费量×2，对护盾伤害翻倍；破盾溢出回算，不翻倍生命伤害 |",
    "| 燃血 | 付8%最大生命，空过主动行动，后三次+50% | 付当前生命4%且最低4，90%A攻击，后两次直接技能+40% |",
    "| 血契 | 付6%最大生命，0蓝，200%S | 付当前生命4%且最低4，并耗4蓝；伤害仍200%S |",
    "| 化灵 | 付8%最大生命，空过主动行动，回12%最大蓝 | 付当前生命4%且最低4，100%A攻击，回12蓝；冷却3、每战最多3次不变 |", "",
    "燃血本次攻击不享受新增幅；增幅不能叠加，持续到两次直接技能用完或战斗结束。燃血与化灵现在都属于纯物理攻击，参与换脉，消耗既有增幅，不能积累藏锋。血系付血不能用护盾抵扣，剩余生命必须大于支付量；没有低血保护或免死。", "",
    "## 2. 同敌人、面板与种子的前后对照", "",
    "每套专精面板96局。胜转败与败转胜逐场配对；回合和剩余生命只比较前后均获胜的同一场，避免把失败或新胜出的难战混进速度均值。旧结果只读保存于baseline.json，不保留第二套运行逻辑。", "",
    "| 组合 | 旧胜场→新胜场 | 败转胜/胜转败 | 共同胜场 | 共同胜局回合：旧→新 | 共同胜局生命：旧→新 |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  const pairs = [];
  for (const build of output.builds) {
    const oldRows = baseline.singles.filter(row => !row.equal && row.build === build.name);
    const newRows = rowsFor(build.name);
    const joined = newRows.flatMap(row => {
      const oldRow = oldRows.find(r => r.scenario === row.scenario);
      return row.runs.map(run => ({ scenario: row.scenario, seed: run.seed, old: oldRow.runs.find(r => r.seed === run.seed), current: run }));
    });
    assert.equal(joined.length, 96);
    assert(joined.every(row => row.old));
    const common = joined.filter(row => row.old.won && row.current.won);
    const average = (key, field) => common.length ? common.reduce((n, row) => n + row[key][field], 0) / common.length : null;
    const pair = {
      build: build.name, oldWins: aggregate(oldRows).wins, newWins: aggregate(newRows).wins,
      gained: joined.filter(row => !row.old.won && row.current.won).length,
      regressed: joined.filter(row => row.old.won && !row.current.won).length,
      commonWins: common.length,
      oldRounds: average("old", "rounds"), newRounds: average("current", "rounds"),
      oldHp: average("old", "hp"), newHp: average("current", "hp"),
      changedMatchups: joined.filter(row => row.old.won !== row.current.won).map(row => ({ scenario: row.scenario, seed: row.seed, won: row.current.won })),
    };
    pairs.push(pair);
    lines.push(`| ${pair.build} | ${pair.oldWins}→${pair.newWins} | ${pair.gained}/${pair.regressed} | ${pair.commonWins} | ${num(pair.oldRounds)}→${num(pair.newRounds)} | ${num(pair.oldHp)}→${num(pair.newHp)} |`);
  }
  lines.push("", "## 3. 连战预算保持不变", "",
    "同样五场敌人；定额补给仍在第二、第四战后各最多52生命与12法力。下表是专精面板的通关数，每格12个种子。", "",
    "| 组合 | 无补给：旧→新 | 定额补给：旧→新 |", "| --- | --- | --- |");
  for (const build of output.builds) {
    const find = list => list.find(row => row.build === build.name && !row.equal);
    lines.push(`| ${build.name} | ${find(baseline.campaigns).cleared}→${find(output.campaigns).cleared} | ${find(baseline.resuppliedCampaigns).cleared}→${find(output.resuppliedCampaigns).cleared} |`);
  }
  lines.push("", "## 4. 四项替换搭配试验", "",
    "每次只替换同一组合的一项能力，其他预算不变；全体22/22和原专精分配各跑前四种子、八类敌人。每格32局，基准复用本轮主矩阵的相同种子。", "",
    "| 原组合 | 替换 | 面板 | 基准胜场 | 替换后胜场 | 新能力使用次数 |", "| --- | --- | --- | --- | --- | --- |");
  for (const variant of output.variants) {
    const base = summary(output.singles.filter(row => row.build === variant.build && row.equal === variant.equal).flatMap(row => row.runs.filter(run => output.seeds.slice(0, 4).includes(run.seed))));
    lines.push(`| ${variant.build} | ${BY_CODE[variant.out].name}→${BY_CODE[variant.into].name} | ${variant.equal ? "22/22" : "专精"} | ${base.wins}/${base.n} | ${variant.summary.wins}/${variant.summary.n} | ${variant.summary.actions[variant.into] ?? 0} |`);
  }
  lines.push("", "另做同样前四种子、八敌阵的初始8法力专项。法力上限仍为48；原组合与替换组合都只带七项能力。", "",
    "| 组合与替换 | 原组合胜场 | 替换后胜场 | 化灵使用次数 |", "| --- | --- | --- | --- |");
  for (const trial of output.resourceTrials) {
    const control = output.sensitivity.find(row => row.build === trial.build && row.initialMp === trial.initialMp).summary;
    lines.push(`| ${trial.build}：${BY_CODE[trial.out].name}→${BY_CODE[trial.into].name} | ${control.wins}/${control.n} | ${trial.summary.wins}/${trial.summary.n} | ${trial.summary.actions.convert ?? 0} |`);
  }
  lines.push("", "## 5. 判断与剩余问题", "",
    "招式分工已改善，但有明确退步项：放血的两局首领战从胜转败，战斗也更慢。守势缩短结界战，仍保留较慢的无盾首领战。血系提升单场表现，仍有生命预算不足与带蓝死亡，尚不能靠本轮调整支撑五连战。", "",
    "化灵不需要在满蓝血系中强行成为常规输出。低蓝血系虽使用化灵，胜场没有增加；换到精神专精的养火组合，低蓝胜场由8/32增至16/32。这里同时替换了火息，不能把差值解释为化灵单项的固定强度。", "",
    "回旋刃、破障槌、雷贯都有完整对局和实际使用。部分面板下替换会降低胜率；尤其雷贯需要物法共同投入，不能因附带穿甲就视为精神专精惊雷的上位替代。", "",
    "胜率只描述本敌阵和统一自动策略。敌方仍是公开固定轮换，没有魔法资源耗尽；未测试真人操作、所有搭配或装备联动。最低4点付血仍可能使濒死角色在随后一击阵亡。化灵允许近满蓝时使用，但超过上限的回复会浪费，生命照付。", "",
    "复跑默认命令会根据只读baseline.json生成前后对照；若敌阵、面板或种子变化，会明确失败，避免继续标称同输入比较。", "",
  );
  output.optimization = { baselineSha256: createHash("sha256").update(readFileSync(baselinePath)).digest("hex"), baselineEngineSha256: baseline.engineSha256, pairs };
  writeFileSync(fileURLToPath(new URL("./优化复测.md", import.meta.url)), lines.join("\n"), "utf8");
}

function run() {
  const checks = selfCheck();
  const quick = process.argv.includes("--quick");
  const seeds = quick ? [17, 71] : [17, 29, 43, 71, 97, 131, 173, 211, 257, 307, 367, 431];
  const output = {
    date: "2026-11-23", scope: "独立设计模拟，非正式客户端验收",
    runtime: process.version,
    engineSha256: createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex"),
    checks, seeds, skills: SKILLS, passives: PASSIVES, builds: BUILDS,
    scenarios: SCENARIOS, campaignScenarios: CHAIN,
    singles: [], campaigns: [], resuppliedCampaigns: [], sensitivity: [], ablations: [], variants: [], resourceTrials: [], traces: [],
  };
  for (const equal of [true, false]) {
    for (const build of BUILDS) {
      const rows = [];
      for (const scenario of SCENARIOS) {
        const results = seeds.map(seed => battle(build, scenario, seed, { equal }));
        rows.push(...results);
        output.singles.push({ equal, build: build.name, scenario: scenario.name, summary: summary(results), runs: results });
      }
      const runs = seeds.map(seed => campaign(build, seed, { equal }));
      output.campaigns.push({
        equal, build: build.name, n: runs.length, cleared: runs.filter(r => r.cleared).length,
        avgWins: runs.reduce((n, r) => n + r.wins, 0) / runs.length,
        avgRounds: runs.reduce((n, r) => n + r.rounds, 0) / runs.length,
        avgHp: runs.reduce((n, r) => n + r.hp, 0) / runs.length,
        avgMp: runs.reduce((n, r) => n + r.mp, 0) / runs.length,
        runs,
      });
      console.log(JSON.stringify({ equal, build: build.name, single: summary(rows).winRate, campaign: runs.filter(r => r.cleared).length + "/" + runs.length }));
    }
  }
  if (!quick) {
    for (const build of BUILDS) {
      const supplied = seeds.map(seed => campaign(build, seed, { resupply: true }));
      output.resuppliedCampaigns.push({
        build: build.name, n: supplied.length, cleared: supplied.filter(r => r.cleared).length,
        avgWins: supplied.reduce((n, r) => n + r.wins, 0) / supplied.length, runs: supplied,
      });
      for (const scale of [0.85, 1.15]) {
        const results = SCENARIOS.flatMap(scenario => seeds.slice(0, 4).map(seed => battle(build, scenario, seed, { scale })));
        output.sensitivity.push({ build: build.name, scale, summary: summary(results) });
      }
      const skillSet = build.skills.filter(code => !["bloodpay", "sever", "ashward", "firebreath", "frostheal", "frostseal", "recall", "thunderward", "shieldhit", "bloodrage", "convert"].includes(code));
      const results = SCENARIOS.flatMap(scenario => seeds.slice(0, 4).map(seed => battle(build, scenario, seed, { skills: skillSet })));
      const base = SCENARIOS.flatMap(scenario => seeds.slice(0, 4).map(seed => battle(build, scenario, seed, { skills: build.skills })));
      output.ablations.push({ build: build.name, removed: build.skills.filter(s => !skillSet.includes(s)), full: summary(base), withoutConversions: summary(results) });
      const conservative = SCENARIOS.flatMap(scenario => seeds.slice(0, 4).map(seed => battle(build, scenario, seed, { conservative: true })));
      output.sensitivity.push({ build: build.name, conservative: true, summary: summary(conservative) });
      const lowMana = SCENARIOS.flatMap(scenario => seeds.slice(0, 4).map(seed => battle(build, scenario, seed, { mp: 8 })));
      output.sensitivity.push({ build: build.name, initialMp: 8, summary: summary(lowMana) });
    }
    for (const variant of VARIANTS) {
      const build = BUILDS.find(row => row.id === variant.build);
      const skills = build.skills.map(code => code === variant.out ? variant.into : code);
      for (const equal of [true, false]) {
        const runs = SCENARIOS.flatMap(scenario => seeds.slice(0, 4).map(seed => ({ scenario: scenario.name, ...battle(build, scenario, seed, { skills, equal }) })));
        output.variants.push({ ...variant, build: build.name, equal, skills, summary: summary(runs), runs });
      }
    }
    const resourceVariant = VARIANTS.find(row => row.into === "convert");
    const resourceBuild = BUILDS.find(row => row.id === resourceVariant.build);
    const resourceSkills = resourceBuild.skills.map(code => code === resourceVariant.out ? resourceVariant.into : code);
    const resourceRuns = SCENARIOS.flatMap(scenario => seeds.slice(0, 4).map(seed => ({ scenario: scenario.name, ...battle(resourceBuild, scenario, seed, { skills: resourceSkills, mp: 8 }) })));
    output.resourceTrials.push({ ...resourceVariant, build: resourceBuild.name, initialMp: 8, skills: resourceSkills, summary: summary(resourceRuns), runs: resourceRuns });
  }
  for (const build of BUILDS) {
    for (const index of [3, 5]) output.traces.push({ build: build.name, scenario: SCENARIOS[index].name, result: battle(build, SCENARIOS[index], 17, { trace: true }) });
  }
  const path = fileURLToPath(new URL(quick ? "./quick-results.json" : "./results.json", import.meta.url));
  if (!quick) writeReport(output);
  writeFileSync(path, JSON.stringify(output, null, 2) + "\n", "utf8");
  const tracePath = fileURLToPath(new URL(quick ? "./quick-traces.md" : "./逐回合战报.md", import.meta.url));
  const text = ["# 技能组合逐回合战报", "", "独立实验；种子17；完整胜负过程；不属于正式客户端回放。", ""];
  for (const row of output.traces) {
    text.push(`## ${row.build} / ${row.scenario}`, "", `结果：${row.result.won ? "胜利" : row.result.timeout ? "超时" : "失败"}，${row.result.rounds}回合，生命${row.result.hp.toFixed(1)}，法力${row.result.mp.toFixed(1)}。`, "", "```text", ...row.result.history, "```", "");
  }
  writeFileSync(tracePath, text.join("\n"), "utf8");
  console.log(JSON.stringify({ checks, resultPath: path, tracePath }));
}

if (process.argv.includes("--self-check")) console.log(JSON.stringify({ checks: selfCheck() }));
else if (process.argv.includes("--report-only")) {
  const output = JSON.parse(readFileSync(fileURLToPath(new URL("./results.json", import.meta.url)), "utf8"));
  assert.equal(output.engineSha256, createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex"), "规则脚本已改变，请完整复跑，不能用旧结果生成新规则报告");
  writeReport(output);
  writeFileSync(fileURLToPath(new URL("./results.json", import.meta.url)), JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ counts: output.counts }));
} else run();
