import { RULES, POTIONS, BY_SKILL, SKILLS, ENEMIES, statsFromItems, activeTraits } from "./catalog.mjs";

const copy = x => structuredClone(x);
const live = st => st.enemies.filter(e => e.hp > 0);
export const layers = (unit, type) => unit.statuses.filter(x => x.type === type).length;
export const armorDamage = (raw, armor) => raw <= 0 ? 0 : Math.max(1, Math.round(raw * 100 / (100 + Math.max(0, armor))));
const remaining = statuses => statuses.reduce((sum, x) => sum + x.power * x.ticks, 0);
const isDirect = code => !["guard", "mine", "iron", "counter", "ashward", "heal", "cleanse", "frostheal", "thunderward"].includes(code);
const note = (st, text) => { if (st.trace) st.log.push(text); };
export function addStatus(st, unit, type, n, power = 0, ticks = 3) {
  for (let i = 0; i < n && layers(unit, type) < RULES.statusLimits[type]; i++) {
    unit.statuses.push({ type, power, ticks });
  }
}
export function takeStatus(unit, type, n) {
  const chosen = unit.statuses.filter(x => x.type === type).sort((a, b) => a.ticks - b.ticks || a.power - b.power).slice(0, n);
  unit.statuses = unit.statuses.filter(x => !chosen.includes(x));
  return chosen;
}
const trait = (st, code) => st.traits[code];
const has = (st, code) => !!trait(st, code);
export function attributes(st) {
  const p = st.p, opening = trait(st, "opening"), veteran = trait(st, "veteran");
  const bonus = opening && st.round <= opening.n ? opening.p : 0;
  return {
    a: p.a + bonus + (veteran ? Math.min(veteran.p, Math.floor(veteran.kills / veteran.n)) : 0),
    s: p.s + bonus,
    armor: p.armor * (p.ironUntil >= st.round ? 1 + BY_SKILL.iron.effect.armorBonus : 1) + p.fortify +
      (has(st, "danger") && p.hp <= p.maxHp * 0.35 ? trait(st, "danger").p : 0),
  };
}
export function createBattle(build, items, enemyIds, options = {}) {
  if (build.skills.length > RULES.activeSlots) throw new Error(`主动技能超过${RULES.activeSlots}个`);
  if (new Set(items.map(x => x.slot)).size !== items.length) throw new Error("同一部位重复装备");
  const stats = statsFromItems(items, options.player ?? RULES.player);
  const p = {
    ...stats, maxHp: stats.hp, maxMp: stats.mp, hp: Math.min(options.hp ?? stats.hp, stats.hp),
    mp: Math.min(options.mp ?? stats.mp, stats.mp), shield: 0, bloodShield: 0, statuses: [],
    guard: 0, counter: false, fortify: 0, ironUntil: 0, hidden: 0, stored: 0,
    rage: 0, lastKind: 0, turns: 0, cds: {}, uses: {}, counters: {}, forms: [],
    barrierUsed: false, reflectUsed: false, frugalUses: 0, sunderUntil: 0,
  };
  const pressure = options.pressure ?? 0;
  const enemies = enemyIds.map((entry, i) => {
    const source = typeof entry === "number" ? ENEMIES.find(e => e.id === entry) : entry;
    if (!source) throw new Error("未知敌人");
    const hp = Math.round(source.hp * (options.enemyHp ?? 1) * (1 + pressure * RULES.pressureHp));
    return {
      ...copy(source), id: i, hp, maxHp: hp, maxMp: source.mp, statuses: [], shield: 0, guard: 0,
      a: Math.round(source.a * (options.enemyAttack ?? 1) * (1 + pressure * RULES.pressureAttack)),
      s: Math.round(source.s * (options.enemyAttack ?? 1) * (1 + pressure * RULES.pressureAttack)),
      sunderUntil: 0, suppress: 0, suppressUntil: 0, mine: null, phase: false,
      heals: 0, wards: 0, purifies: 0, charged: false, actions: 0,
    };
  });
  const inputPotions = options.potions ?? build.potions;
  if (inputPotions.length > POTIONS.length) throw new Error("未知药品");
  const doses = POTIONS.map((_, i) => inputPotions[i] ?? 0);
  const st = {
    build: copy(build), items: copy(items), traits: activeTraits(items), p, enemies, round: 1,
    phase: 0, won: false, lost: false, settled: false, trace: options.trace ?? false, log: [],
    potions: [...doses], initialPotions: [...doses],
    metrics: {
      damage: 0, incoming: 0, healing: 0, manaSpent: 0, manaRecovered: 0, shieldAbsorbed: 0,
      paidLife: 0, playerActions: 0, enemyActions: 0, kills: 0, hpPotions: 0, mpPotions: 0,
      dualPotions: 0, wardPotions: 0, dosesUsed: 0,
      actions: {}, procs: {}, conversions: {}, physicalDamage: 0, magicDamage: 0, dotDamage: 0,
    },
  };
  if (st.potions.some(x => x < 0 || !Number.isInteger(x)) || st.potions.reduce((a, b) => a + b, 0) > 5) throw new Error("药匣容量或份数不合法");
  advance(st);
  return st;
}
export function giveShield(st, raw, blood = false) {
  if (st.p.hp <= 0) return 0;
  let amount = Math.max(0, Math.min(Math.round(raw), Math.floor(st.p.maxHp * RULES.shieldCap) - st.p.shield));
  if (blood) amount = Math.min(amount, Math.max(0, Math.floor(st.p.maxHp * trait(st, "excess").p / 100) - st.p.bloodShield));
  st.p.shield += amount;
  if (blood) st.p.bloodShield += amount;
  return amount;
}
export function heal(st, raw, vampire = false) {
  if (st.p.hp <= 0) return 0;
  let amount = Math.max(0, Math.round(raw));
  if (layers(st.p, "bleed") >= 3) amount = Math.round(amount * 0.7);
  const actual = Math.min(st.p.maxHp - st.p.hp, amount);
  st.p.hp += actual;
  st.metrics.healing += actual;
  if (vampire && has(st, "excess")) giveShield(st, amount - actual, true);
  return actual;
}
export function restoreMana(st, raw) {
  if (st.p.hp <= 0) return 0;
  const actual = Math.min(st.p.maxMp - st.p.mp, Math.max(0, Math.round(raw)));
  st.p.mp += actual;
  st.metrics.manaRecovered += actual;
  return actual;
}
function countProc(st, code) {
  st.metrics.procs[code] = (st.metrics.procs[code] ?? 0) + 1;
}
export function hitEnemy(st, target, raw, kind = 1, options = {}) {
  if (!target || target.hp <= 0 || raw <= 0) return 0;
  const armor = target.armor * (target.sunderUntil >= st.round ? 1 - BY_SKILL.sunder.effect.armorReduction : 1) * (1 - (options.pierce ?? 0));
  let damage = armorDamage(raw * (options.dot ? 1 : 1 - target.guard), armor);
  const shieldBonus = options.shieldBonus ?? 1;
  const absorbed = Math.min(target.shield, damage * shieldBonus);
  target.shield -= absorbed;
  damage = Math.max(0, Math.round(damage - absorbed / shieldBonus));
  const loss = Math.min(target.hp, damage);
  target.hp -= loss;
  st.metrics.damage += loss;
  st.metrics[kind === 1 ? "physicalDamage" : "magicDamage"] += loss;
  if (options.dot) st.metrics.dotDamage += loss;
  if (target.hp === 0) {
    st.metrics.kills++;
    for (const item of st.items) {
      if (["veteran", "bloodthirst"].includes(item.trait.code)) {
        item.kills++;
        if (st.traits[item.trait.code]) st.traits[item.trait.code].kills = item.kills;
      }
    }
  }
  note(st, `  ${target.name}损失${loss}生命，剩${target.hp}，盾吸收${absorbed}`);
  return loss;
}
export function incoming(st, enemy, raw, kind = 1, options = {}) {
  const p = st.p;
  if (p.hp <= 0 || raw <= 0) return { loss: 0, absorbed: 0 };
  const attrs = attributes(st);
  const factor = options.dot ? 1 : (1 - p.guard) * (1 - layers(enemy, "chill") * RULES.chillReduction) * (1 - (options.suppress ?? 0));
  const damage = armorDamage(raw * factor, attrs.armor);
  const absorbed = Math.min(p.shield, damage);
  p.shield -= absorbed;
  p.bloodShield -= Math.min(p.bloodShield, absorbed);
  st.metrics.shieldAbsorbed += absorbed;
  if (!options.dot && has(st, "store")) {
    p.stored = Math.min(Math.round(attrs.a * 0.8), p.stored + Math.round(absorbed * trait(st, "store").p / 100));
  }
  const loss = Math.min(p.hp, damage - absorbed);
  p.hp -= loss;
  st.metrics.incoming += loss;
  note(st, `  ${enemy.name}造成${loss}${kind === 1 ? "物理" : "魔法"}伤害，剩${p.hp}，盾吸收${absorbed}`);
  return { loss, absorbed };
}
export function intent(e, round) {
  return e.pattern[(round - 1) % e.pattern.length];
}
function enemyAct(st, e) {
  if (e.hp <= 0 || st.p.hp <= 0 || live(st).length === 0) return;
  const p = st.p;
  e.guard = 0;
  let code = intent(e, st.round);
  const costs = { bolt: 3, ignite: 4, frost: 4, storm: 7, ward: 5, mend: 6, purify: 4, drain: 3 };
  if ((costs[code] ?? 0) > e.mp || (code === "mend" && e.heals >= e.healUses) ||
    (code === "ward" && e.wards >= e.wardUses) || (code === "purify" && e.purifies >= e.purifyUses)) code = "strike";
  const attacking = !["charge", "guard", "ward", "mend", "purify"].includes(code);
  if (attacking && e.mine) {
    const mine = e.mine; e.mine = null;
    hitEnemy(st, e, mine.power, 2);
    if (e.hp > 0) addStatus(st, e, "mark", 1);
    countProc(st, "mine");
    if (e.hp <= 0) return;
  }
  e.mp -= costs[code] ?? 0;
  e.actions++;
  st.metrics.enemyActions++;
  const phase = e.phase ? 1.15 : 1;
  const a = e.a * phase, s = e.s * phase;
  const suppress = e.suppressUntil >= st.round ? e.suppress : 0;
  if (attacking) e.suppress = 0;
  let loss = 0;
  const damage = (raw, kind = 1) => { loss += incoming(st, e, raw, kind, { suppress }).loss; };
  note(st, `${e.name}行动：${code}`);
  switch (code) {
    case "charge": e.charged = true; break;
    case "guard": e.guard = 0.4; break;
    case "ward": e.shield = Math.min(Math.floor(e.maxHp * 0.3), e.shield + Math.round(e.maxHp * 0.14)); e.wards++; break;
    case "mend": {
      let value = Math.round(e.maxHp * 0.12);
      if (layers(e, "bleed") >= 3) value = Math.round(value * 0.7);
      e.hp = Math.min(e.maxHp, e.hp + value); e.heals++; break;
    }
    case "purify": e.statuses = []; e.purifies++; break;
    case "bolt": damage(s * 1.3, 2); break;
    case "ignite": damage(s * 0.9, 2); if (p.hp > 0) addStatus(st, p, "burn", 2, Math.round(e.s * 0.15)); break;
    case "frost": damage(s * 1.1, 2); break;
    case "storm": damage(s * (e.charged ? 2.2 : 1.5), 2); e.charged = false; break;
    case "heavy": damage(a * 1.5); break;
    case "slam": damage(a * (e.charged ? 2.2 : 1.5)); e.charged = false; break;
    case "flurry": damage(a * 0.55); damage(a * 0.55); damage(a * 0.55); break;
    case "drain": damage(a * 1.2); if (e.hp > 0) e.hp = Math.min(e.maxHp, e.hp + Math.round(loss * 0.25)); break;
    default: damage(a); break;
  }
  if (p.hp > 0 && attacking) {
    if (loss > 0 && !p.barrierUsed && has(st, "barrier")) {
      giveShield(st, trait(st, "barrier").p); p.barrierUsed = true; countProc(st, "barrier");
    }
    if (loss > 0 && !p.reflectUsed && has(st, "reflect") && e.hp > 0) {
      p.reflectUsed = true; hitEnemy(st, e, trait(st, "reflect").p); countProc(st, "reflect");
    }
    if (p.counter) {
      p.counter = false; hitEnemy(st, e, attributes(st).a * BY_SKILL.counter.effect.physical); countProc(st, "counter");
    }
  }
}
function settle(st) {
  if (st.settled) return;
  st.lost = st.p.hp <= 0;
  st.won = !st.lost && live(st).length === 0;
  if (!st.won && !st.lost) return;
  st.settled = true;
  if (st.won) {
    if (has(st, "nourish")) heal(st, trait(st, "nourish").p);
    if (has(st, "returnMana")) restoreMana(st, trait(st, "returnMana").p);
  }
  const tier = Math.max(...st.enemies.map(e => e.tier));
  for (const item of st.items) item.durability = Math.max(0, item.durability - RULES.durabilityLoss[tier - 1][item.slot - 1]);
  note(st, st.won ? "战斗胜利，结算一次耐久及战后回复" : "战斗失败");
}
function endRound(st) {
  // 固定顺序为玩家持续伤害、敌方生成序持续伤害；致死后立即停止结算。
  for (const unit of [st.p, ...st.enemies]) {
    if (unit.hp <= 0) continue;
    for (const status of [...unit.statuses]) {
      if (["bleed", "burn"].includes(status.type) && status.power > 0) {
        if (unit === st.p) incoming(st, { name: "持续状态", statuses: [] }, status.power, status.type === "bleed" ? 1 : 2, { dot: true });
        else hitEnemy(st, unit, status.power, status.type === "bleed" ? 1 : 2, { dot: true });
        settle(st);
        if (st.settled) return;
        if (unit.hp <= 0) break;
      }
      status.ticks--;
    }
    unit.statuses = unit.statuses.filter(x => x.ticks > 0);
    if (unit.mine && unit.mine.until <= st.round) unit.mine = null;
  }
  st.round++;
  st.phase = 0;
}
function advance(st) {
  settle(st);
  if (st.settled) return;
  if (st.phase === 0) {
    for (const e of st.enemies) e.phase = e.tier >= 2 && e.hp <= e.maxHp * 0.5;
    note(st, `第${st.round}回合`);
    for (const e of [...live(st)].filter(x => x.speed > st.p.speed).sort((a, b) => b.speed - a.speed || a.id - b.id)) {
      enemyAct(st, e); settle(st); if (st.settled) return;
    }
    st.phase = 1;
    st.p.turns++;
    st.p.guard = 0; st.p.counter = false; st.p.fortify = 0; st.p.reflectUsed = false;
    const meditate = trait(st, "meditate");
    if (meditate && st.p.turns % meditate.n === 0 && st.p.turns <= meditate.n * 3) {
      restoreMana(st, meditate.p); countProc(st, "meditate");
    }
  }
}
export function skillCost(st, code) {
  const skill = BY_SKILL[code];
  return Math.max(0, skill.mp - (skill.kind === 1 && st.p.lastKind === 2 && has(st, "alternate") ? trait(st, "alternate").n : 0));
}
export const bloodCost = st => Math.max(RULES.lifePaymentMin, Math.ceil(st.p.hp * RULES.lifePaymentRate));
export function legal(st, code, target) {
  const p = st.p, skill = BY_SKILL[code];
  if (!skill || st.settled || st.phase !== 1 || (!["basic", "guard"].includes(code) && !st.build.skills.includes(code))) return false;
  if (p.mp < skillCost(st, code) || (p.cds[code] ?? 0) > p.turns || (skill.uses && (p.uses[code] ?? 0) >= skill.uses)) return false;
  if (!target || target.hp <= 0) return false;
  if (["bloodrage", "bloodcast", "convert"].includes(code) && p.hp <= bloodCost(st)) return false;
  if (code === "bloodrage" && p.rage > 0) return false;
  if (code === "execute" && target.hp > target.maxHp * skill.effect.threshold) return false;
  if (code === "detonate" && !layers(target, "burn")) return false;
  const need = { bloodpay: ["bleed", 1], sever: ["bleed", 2], ashward: ["burn", 1], firebreath: ["burn", 1], frostheal: ["chill", 1], frostseal: ["chill", 2], recall: ["mark", 1], thunderward: ["mark", 1] };
  if (need[code] && layers(target, need[code][0]) < need[code][1]) return false;
  if (["heal", "frostheal", "cleanse"].includes(code) && p.hp === p.maxHp && p.statuses.length === 0) return false;
  if (code === "heal" && p.hp === p.maxHp) return false;
  if (code === "mine" && target.mine) return false;
  return true;
}
export function usePotion(st, type) {
  if (st.settled || st.phase !== 1 || st.potionUsedAt === st.p.turns) return false;
  const index = POTIONS.findIndex(x => x.code === type);
  if (index < 0 || st.potions[index] <= 0) return false;
  const medicine = POTIONS[index];
  if (!((medicine.hp > 0 && st.p.hp < st.p.maxHp) || (medicine.mp > 0 && st.p.mp < st.p.maxMp) ||
    (medicine.shield > 0 && st.p.shield < Math.floor(st.p.maxHp * RULES.shieldCap)))) return false;
  const bonus = 1 + (trait(st, "medicine")?.p ?? 0) / 100;
  if (medicine.hp) heal(st, medicine.hp * bonus);
  if (medicine.mp) restoreMana(st, medicine.mp * bonus);
  if (medicine.shield) giveShield(st, medicine.shield);
  st.metrics[["hpPotions", "mpPotions", "hpPotions", "mpPotions", "dualPotions", "wardPotions"][index]]++;
  st.metrics.dosesUsed++;
  st.potions[index]--; st.potionUsedAt = st.p.turns;
  note(st, `用${medicine.name}，不占行动，当前${st.p.hp}血/${st.p.mp}蓝`);
  return true;
}
export function playerAct(st, code, targetId = 0, options = {}) {
  const target = st.enemies.find(e => e.id === targetId);
  if (!legal(st, code, target)) throw new Error(`非法行动：${code}`);
  const p = st.p, skill = BY_SKILL[code], attrs = attributes(st), fx = skill.effect;
  const selectedCleanse = options.cleanseTypes ?? [...new Set(p.statuses.map(x => x.type))].slice(0, fx.cleanseTypes ?? 0);
  if (fx.cleanseTypes && (selectedCleanse.length > fx.cleanseTypes || new Set(selectedCleanse).size !== selectedCleanse.length ||
    selectedCleanse.some(type => !p.statuses.some(x => x.type === type)))) throw new Error("非法净化选择");
  const cost = skillCost(st, code), direct = isDirect(code);
  const hidden = direct ? p.hidden * (trait(st, "hidden")?.p ?? 0) / 100 : 0;
  const rage = direct && p.rage > 0 ? BY_SKILL.bloodrage.effect.bonus : 0;
  const alternate = direct && skill.kind === 2 && p.lastKind === 1 ? (trait(st, "alternate")?.p ?? 0) / 100 : 0;
  const stored = direct ? p.stored : 0;
  const vampire = trait(st, "vampire")?.p ?? 0;
  const thirst = trait(st, "bloodthirst");
  const leechRate = (vampire + (thirst && thirst.kills >= thirst.n ? thirst.p : 0)) / 100;
  if (direct) { p.hidden = 0; p.stored = 0; if (p.rage > 0) p.rage--; }
  p.mp -= cost; st.metrics.manaSpent += cost;
  p.cds[code] = p.turns + skill.cd + 1;
  p.uses[code] = (p.uses[code] ?? 0) + 1;
  st.metrics.playerActions++; st.metrics.actions[code] = (st.metrics.actions[code] ?? 0) + 1;
  note(st, `${skill.name}→${target.name}，耗蓝${cost}`);
  let hpDamage = 0, physicalMain = 0;
  const dealt = (raw, kind, e = target, options = {}) => {
    const hunt = e.hp <= e.maxHp * 0.35 ? (trait(st, "hunt")?.p ?? 0) / 100 : 0;
    const wound = layers(e, "bleed") || layers(e, "burn") ? (trait(st, "wound")?.p ?? 0) / 100 : 0;
    const amount = hitEnemy(st, e, raw * (1 + hidden + rage + alternate + hunt + wound), kind, options);
    hpDamage += amount;
    if (e === target && kind === 1) physicalMain += amount;
    return amount;
  };
  const add = (type, count, power = 0, e = target) => {
    if (e.hp > 0) addStatus(st, e, type, count, Math.round(power));
  };
  const consume = (type, n) => {
    const result = takeStatus(target, type, n);
    st.metrics.conversions[code] = (st.metrics.conversions[code] ?? 0) + result.length;
    return result;
  };
  const suppressNext = strength => {
    target.suppress = target.suppressUntil >= st.round ? Math.max(target.suppress, strength) : strength;
    target.suppressUntil = st.round + 1;
  };
  if (["bloodrage", "bloodcast", "convert"].includes(code)) {
    const paid = bloodCost(st); p.hp -= paid; st.metrics.paidLife += paid;
  }
  const A = attrs.a, S = attrs.s, H = p.maxHp;
  switch (code) {
    case "basic": dealt(A * fx.physical, 1); if (hpDamage > 0) restoreMana(st, fx.mana); break;
    case "guard":
      p.guard = fx.reduction;
      if (has(st, "guardShield")) giveShield(st, trait(st, "guardShield").p);
      if (has(st, "fortify")) p.fortify = trait(st, "fortify").p;
      break;
    case "rend": dealt(A * fx.physical, 1); add("bleed", fx.bleed, A * RULES.bleedRatio); break;
    case "sunder": dealt(A * fx.physical, 1); if (target.hp > 0) target.sunderUntil = st.round + 1; break;
    case "shatter": dealt(A * fx.physical, 1, target, { shieldBonus: fx.shieldBonus }); break;
    case "spin": for (let i = 0; i < fx.hits && target.hp > 0; i++) { const hp = dealt(A * fx.physical, 1); if (i === fx.hits - 1 && hp > 0) add("bleed", fx.bleed, A * RULES.bleedRatio); } break;
    case "execute": dealt(A * fx.physical, 1); if (target.hp === 0) restoreMana(st, cost); break;
    case "sweep": for (const e of live(st)) dealt(A * fx.physical, 1, e); break;
    case "sever": consume("bleed", fx.consume); dealt(A * fx.physical, 1); suppressNext(fx.suppression); break;
    case "ignite": dealt(S * fx.magic, 2); add("burn", fx.burn, S * RULES.burnRatio); break;
    case "firewind": {
      const source = target.statuses.filter(x => x.type === "burn").sort((a, b) => a.ticks - b.ticks || a.power - b.power).slice(0, fx.copy).map(copy);
      for (const e of live(st)) {
        dealt(S * fx.magic, 2, e);
        if (e !== target && e.hp > 0) for (const x of source) addStatus(st, e, "burn", 1, x.power, x.ticks);
      }
      break;
    }
    case "detonate": {
      const used = consume("burn", 5);
      dealt(S * fx.magic + remaining(used) * fx.remainingBurn, 2);
      if (has(st, "ember") && used.length >= trait(st, "ember").n && target.hp > 0) { add("burn", 1, S * 0.15); countProc(st, "ember"); }
      break;
    }
    case "frost": dealt(S * fx.magic, 2); add("chill", fx.chill); break;
    case "spark": dealt(S * fx.magic, 2); add("mark", fx.mark); break;
    case "thunder": { const n = consume("mark", fx.consume).length; dealt(S * fx.magic * (1 + n * fx.bonusPerMark), 2); break; }
    case "mine": target.mine = { power: S * fx.magic, until: st.round + 1 }; break;
    case "chain": {
      const n = consume("mark", fx.consume).length;
      for (const e of live(st)) dealt(S * fx.magic * (1 + n * fx.bonusPerMark), 2, e);
      break;
    }
    case "icebreak": { const n = consume("chill", fx.consume).length; dealt(A * fx.physical, 1); if (n) dealt(S * n * fx.magicPerChill, 2); break; }
    case "pierce": {
      const n = options.consumeMark === false ? 0 : consume("mark", fx.consume).length;
      dealt(A * fx.physical, 1, target, { pierce: n ? fx.armorIgnore : 0 }); dealt(S * fx.magic, 2); break;
    }
    case "flameblade": { const n = layers(target, "burn"); dealt(A * fx.physical, 1); if (n) dealt(S * n * fx.magicPerBurn, 2); break; }
    case "iron": giveShield(st, H * fx.hpShield + p.armor * fx.armorShield); p.ironUntil = st.round + 1; break;
    case "counter": p.guard = fx.reduction; p.counter = true; break;
    case "shieldhit": {
      const spent = Math.floor(p.shield * fx.shieldSpend);
      p.shield -= spent; p.bloodShield -= Math.min(p.bloodShield, spent);
      dealt(A * fx.physical + spent * fx.spentDamage, 1, target, { shieldBonus: fx.shieldBonus }); break;
    }
    case "ashward": giveShield(st, Math.min(H * fx.hpCap, S * fx.magicShield + remaining(consume("burn", fx.consume)) * fx.remainingBurnShield)); break;
    case "bloodrage": dealt(A * fx.physical, 1); p.rage = fx.charges; break;
    case "leech": dealt(A * fx.physical, 1); break;
    case "bloodcast": dealt(S * fx.magic, 2); break;
    case "convert": dealt(A * fx.physical, 1); restoreMana(st, fx.mana); break;
    case "heal": heal(st, H * fx.hpHeal + S * fx.magicHeal); break;
    case "cleanse": {
      p.statuses = p.statuses.filter(x => !selectedCleanse.includes(x.type)); heal(st, H * fx.hpHeal); break;
    }
    case "bloodpay": { const n = consume("bleed", fx.consume).length; dealt(A * fx.physical, 1); heal(st, A * n * fx.attackHealPerBleed); break; }
    case "firebreath": { const n = consume("burn", fx.consume).length; dealt(S * fx.magic, 2); restoreMana(st, n * fx.manaPerBurn); break; }
    case "frostheal": {
      const n = consume("chill", fx.consume).length;
      p.statuses = p.statuses.filter(x => !selectedCleanse.includes(x.type));
      heal(st, H * n * fx.hpHealPerChill + S * fx.magicHeal); break;
    }
    case "frostseal": consume("chill", fx.consume); dealt(S * fx.magic, 2); suppressNext(fx.suppression); break;
    case "recall": { const n = consume("mark", fx.consume).length; dealt(S * fx.magic, 2); restoreMana(st, n * fx.manaPerMark); break; }
    case "thunderward": giveShield(st, H * (fx.hpShield + consume("mark", fx.consume).length * fx.hpShieldPerMark)); break;
    default: throw new Error("未实现技能");
  }
  // 本招本体结算完毕才吸血和触发装备；最后击杀也完成随招收益。
  if (hpDamage > 0) heal(st, hpDamage * (leechRate + (fx.lifesteal ?? 0)), true);
  if (direct && physicalMain > 0 && target.sunderUntil >= st.round && has(st, "gap")) {
    p.counters.gap = (p.counters.gap ?? 0) + 1;
    if (p.counters.gap >= trait(st, "gap").n) { p.counters.gap = 0; add("bleed", 1, A * 0.1); countProc(st, "gap"); }
  }
  if (direct && has(st, "edgeStack")) {
    p.counters.edgeStack = (p.counters.edgeStack ?? 0) + 1;
    if (p.counters.edgeStack >= trait(st, "edgeStack").n) {
      p.counters.edgeStack = 0; hitEnemy(st, target, trait(st, "edgeStack").p, skill.kind === 2 ? 2 : 1); countProc(st, "edgeStack");
    }
  }
  if (stored > 0) { hitEnemy(st, target, stored, skill.kind === 2 ? 2 : 1); countProc(st, "store"); }
  if (!direct && has(st, "hidden")) p.hidden = Math.min(2, p.hidden + 1);
  if (skill.kind === 1 || skill.kind === 2) p.lastKind = skill.kind;
  else if (skill.kind === 3) p.lastKind = 0;
  if (has(st, "frugal") && skill.mp > 0 && cost > 0 && p.frugalUses < 5) {
    restoreMana(st, Math.min(cost, trait(st, "frugal").p)); p.frugalUses++; countProc(st, "frugal");
  }
  if (has(st, "harmony") && !["basic", "guard"].includes(code)) {
    if (!p.forms.includes(code)) p.forms.push(code);
    if (p.forms.length >= 3) { p.forms = []; restoreMana(st, trait(st, "harmony").p); countProc(st, "harmony"); }
  }
  settle(st);
  if (st.settled) return;
  st.phase = 2;
  for (const e of [...live(st)].filter(x => x.speed <= p.speed).sort((a, b) => b.speed - a.speed || a.id - b.id)) {
    enemyAct(st, e); settle(st); if (st.settled) return;
  }
  endRound(st);
  if (!st.settled) advance(st);
}
export function step(original, action) {
  const st = copy(original);
  if (action.potion && !usePotion(st, action.potion)) throw new Error("非法用药");
  playerAct(st, action.code, action.target, action);
  return st;
}
export function choices(st, allowMedicine = true) {
  const result = [], medicines = [null];
  if (allowMedicine && st.potionUsedAt !== st.p.turns) {
    for (let i = 0; i < POTIONS.length; i++) {
      const m = POTIONS[i];
      const useful = (m.hp ? Math.min(1, (st.p.maxHp - st.p.hp) / m.hp) : 0) +
        (m.mp ? Math.min(1, (st.p.maxMp - st.p.mp) / m.mp) : 0) +
        (m.shield ? Math.min(1, (Math.floor(st.p.maxHp * RULES.shieldCap) - st.p.shield) / m.shield) : 0);
      if (st.potions[i] > 0 && useful >= 0.45) medicines.push(m.code);
    }
  }
  for (const potion of medicines) {
    const trial = potion ? copy(st) : st;
    if (potion) usePotion(trial, potion);
    for (const code of ["basic", "guard", ...st.build.skills]) {
      const targets = isDirect(code) || ["mine", "ashward", "frostheal", "thunderward"].includes(code) ? live(trial) : live(trial).slice(0, 1);
      for (const target of targets) if (legal(trial, code, target)) {
        result.push({ code, target: target.id, potion });
        if (code === "pierce" && layers(target, "mark")) result.push({ code, target: target.id, potion, consumeMark: false });
      }
    }
  }
  return result;
}
export function score(st, profile = "balanced") {
  if (st.lost) return -100000 - live(st).reduce((n, e) => n + e.hp, 0);
  const p = st.p, future = live(st).reduce((sum, e) => sum + e.statuses.reduce((n, x) => n + (["bleed", "burn"].includes(x.type) ? x.power * Math.min(x.ticks, 2) * 0.65 : x.type === "chill" ? 3 * x.ticks : 3), 0), 0);
  const remainingHp = live(st).reduce((n, e) => n + e.hp + e.shield * 0.9, 0);
  const pressure = profile === "aggressive" ? 1.6 : 1;
  const hpWeight = profile === "aggressive" ? 0.55 : 1.1;
  const medicine = st.potions.reduce((sum, count, i) => sum + count * (POTIONS[i].hp * 0.55 + POTIONS[i].mp * 1.25 + POTIONS[i].shield * 0.35), 0);
  return (st.won ? 1200 : 0) - remainingHp * pressure - live(st).length * 12 +
    p.hp * hpWeight + p.mp * 1.1 + p.shield * 0.55 + future + p.stored * 0.7 +
    p.hidden * attributes(st).a * 0.12 + p.rage * attributes(st).a * 0.2 + medicine -
    st.metrics.playerActions * 0.8;
}
export function choose(st, options = {}) {
  const profile = options.profile ?? "balanced", depth = options.depth ?? 2, width = options.width ?? 4;
  const candidates = choices(st, options.allowMedicine ?? true).map(action => {
    const next = step(st, action);
    return { action, next, value: score(next, profile) };
  }).sort((a, b) => b.value - a.value);
  if (!candidates.length) throw new Error("没有合法行动");
  if (depth <= 1) return candidates[0].action;
  for (const row of candidates.slice(0, width)) {
    if (row.next.settled) continue;
    const nextAction = choose(row.next, { ...options, depth: depth - 1, width: Math.min(width, 2) });
    row.value = score(step(row.next, nextAction), profile);
  }
  return candidates.slice(0, width).sort((a, b) => b.value - a.value)[0].action;
}
export function validate(st) {
  const p = st.p;
  for (const unit of [p, ...st.enemies]) {
    for (const k of ["hp", "mp", "shield"]) if (!Number.isInteger(unit[k]) || unit[k] < 0) throw new Error(`非法资源${k}`);
    if (unit.hp > unit.maxHp || unit.mp > unit.maxMp) throw new Error("资源超过上限");
    for (const type of Object.keys(RULES.statusLimits)) if (layers(unit, type) > RULES.statusLimits[type]) throw new Error("状态超过上限");
  }
  if (p.shield > Math.floor(p.maxHp * 0.3) || p.bloodShield > p.shield) throw new Error("护盾上限错误");
  if (st.metrics.dosesUsed > st.initialPotions.reduce((a, b) => a + b, 0) ||
    st.metrics.dosesUsed + st.potions.reduce((a, b) => a + b, 0) !== st.initialPotions.reduce((a, b) => a + b, 0)) throw new Error("药品超额或不守恒");
  if (st.metrics.playerActions > p.turns) throw new Error("行动超额");
}
export function fight(build, items, ids, options = {}) {
  let st = createBattle(build, items, ids, options);
  while (!st.settled && st.round <= (options.maxRounds ?? 100)) {
    const action = choose(st, options);
    st = step(st, action);
    validate(st);
  }
  return st;
}
export function expedition(build, initialItems, options = {}) {
  let items = copy(initialItems), hp, mp, potions = options.potions ?? build.potions;
  const reserve = [...(options.reserve ?? [0, 0])], battles = [];
  let outsideHp = 0, outsideMp = 0, completed = true;
  for (let i = 0; i < RULES.route.length; i++) {
    const stats = statsFromItems(items, options.player ?? RULES.player);
    if (i > 0 && options.supply) {
      // 战外自由补给仍只消耗实际库存；恢复到接近满值后重装五格药匣。
      for (let type = 0; type < 2; type++) {
        const amount = type === 0 ? RULES.hpPotion : RULES.mpPotion;
        let value = type === 0 ? hp : mp;
        const max = type === 0 ? stats.hp : stats.mp;
        const effect = Math.round(amount * (1 + (activeTraits(items).medicine?.p ?? 0) / 100));
        while (value < max && reserve[type] > 0 &&
          (options.supplyPolicy !== "economical" || max - value >= effect * 0.65)) {
          value = Math.min(max, value + effect); reserve[type]--;
          if (type === 0) outsideHp++; else outsideMp++;
        }
        if (type === 0) hp = value; else mp = value;
      }
      for (let type = 0; type < 2; type++) {
        const wanted = build.potions[type] - potions[type];
        const fill = Math.min(wanted, reserve[type]); potions[type] += fill; reserve[type] -= fill;
      }
    }
    const st = fight(build, items, [RULES.route[i]], {
      ...options, hp, mp, potions,
      pressure: Math.min(RULES.pressureMax, Math.floor(i / RULES.pressureEvery)),
    });
    battles.push(st);
    hp = st.p.hp; mp = st.p.mp; potions = st.potions; items = st.items;
    if (!st.won) { completed = false; break; }
  }
  return { completed, battles, hp, mp, potions, reserve, outsideHp, outsideMp, items };
}
export { SKILLS };
