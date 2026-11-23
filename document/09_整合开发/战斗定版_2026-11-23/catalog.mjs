// 本目录是正式开发输入及独立验算，不分配或替换已经发放的物品编号。
export const VERSION = "combat-release-baseline-20261123";
export const ENUMS = {
  stat: { hp: 1, mp: 2, a: 3, s: 4, armor: 5, speed: 6 },
  slot: { weapon: 1, armor: 2, accessory: 3 },
  kind: { physical: 1, magic: 2, mixed: 3, support: 4 },
};
export const STAT_KEYS = ["hp", "mp", "a", "s", "armor", "speed"];
export const QUALITY_NAMES = ["普通", "优秀", "精良", "稀有", "史诗", "传说"];
export const WINDOWS = [[1, 3], [1, 4], [2, 5], [3, 5], [3, 6], [4, 6]];
export const MAIN = {
  hp: [[12, 18], [19, 27], [28, 38], [39, 50], [51, 65], [66, 80]],
  mp: [[3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 15]],
  a: [[2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 13]],
  s: [[2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 13]],
  armor: [[1, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 8]],
  speed: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6]],
};
export const SUB = {
  hp: [[4, 6], [7, 11], [12, 17], [18, 24], [25, 30], [31, 40]],
  mp: [[1, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 8]],
  a: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6]],
  s: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6]],
  armor: [[1, 1], [1, 2], [2, 2], [3, 3], [4, 4], [5, 5]],
  speed: [[1, 1], [1, 1], [1, 2], [2, 2], [2, 3], [3, 3]],
};
export const RULES = {
  player: { hp: 240, mp: 36, a: 18, s: 18, armor: 6, speed: 10 },
  activeSlots: 5, equipmentSlots: 3, traitsPerItem: 1,
  mainActions: 1, medicineUsesPerOwnTurn: 1, medicineUsesAction: false,
  potionCells: 5, hpPotion: 90, mpPotion: 18, shieldCap: 0.3,
  statusTicks: 3, statusLimits: { bleed: 5, burn: 5, chill: 3, mark: 3 },
  bleedRatio: 0.1, burnRatio: 0.15, chillReduction: 0.06,
  armorConstant: 100, basicMana: 2, lifePaymentRate: 0.04, lifePaymentMin: 4,
  durabilityQuality: [0, 4, 8, 12, 16, 20],
  durabilityLoss: [[2, 2, 1], [3, 3, 2], [5, 5, 3]],
  repairPrice: [1, 1, 2, 2, 3, 4], repairSand: 12,
  route: [1, 2, 8, 3, 5, 10, 6, 13],
  pressureEvery: 3, pressureMax: 2, pressureHp: 0.1, pressureAttack: 0.04,
};
export const POTIONS = [
  { code: "hp", name: "回春丹", resource: 1, hp: 90, mp: 0, shield: 0 },
  { code: "mp", name: "聚灵丹", resource: 2, hp: 0, mp: 18, shield: 0 },
  { code: "hpPlus", name: "玉露丹", resource: 1, hp: 150, mp: 0, shield: 0 },
  { code: "mpPlus", name: "凝神丹", resource: 2, hp: 0, mp: 30, shield: 0 },
  { code: "dual", name: "调息散", resource: 3, hp: 45, mp: 9, shield: 0 },
  { code: "ward", name: "护元散", resource: 4, hp: 0, mp: 0, shield: 45 },
];
export const BASES = [
  ["steelSword", "青钢剑", 1, "a", 4, 28],
  ["saber", "厚背刀", 1, "a", 5, 32],
  ["spear", "穿云枪", 1, "a", 5, 32],
  ["axe", "破山斧", 1, "a", 7, 40],
  ["hammer", "镇岳锤", 1, "armor", 7, 40],
  ["staff", "盘龙棍", 1, "armor", 5, 32],
  ["bow", "逐风弓", 1, "a", 3, 24],
  ["crossbow", "藏机弩", 1, "a", 5, 32],
  ["fan", "流云扇", 1, "s", 2, 20],
  ["bamboo", "青竹杖", 1, "s", 4, 28],
  ["bell", "玄铜铃", 1, "mp", 3, 24],
  ["seal", "玄山印", 1, "s", 6, 36],
  ["feather", "青羽轻甲", 2, "armor", 3, 24],
  ["scale", "铁鳞甲", 2, "armor", 5, 32],
  ["heavy", "山岳重甲", 2, "armor", 7, 40],
  ["heart", "护心衣", 2, "hp", 3, 24],
  ["robe", "玄纹袍", 2, "hp", 2, 20],
  ["manaRobe", "凝神法衣", 2, "mp", 2, 20],
  ["jade", "养元佩", 3, "hp", 1, 16],
  ["pearl", "蕴灵珠", 3, "mp", 1, 16],
  ["ring", "玄铁环", 3, "armor", 2, 22],
  ["edge", "砺锋坠", 3, "a", 2, 22],
  ["pin", "凝神簪", 3, "s", 2, 22],
  ["bracelet", "血纹镯", 3, "hp", 2, 22],
].map(([code, name, slot, main, weight, durability]) => ({ code, name, slot, main, weight, durability }));

// 参数数组依次对应六品质；固定值也保留为区间，生成后锁定。
const r = (...values) => values.map(v => Array.isArray(v) ? v : [v, v]);
export const TRAITS = [
  { code: "vampire", name: "饮血", slot: 1, p: r([2, 3], [3, 4], [4, 5], [5, 6], [6, 8], [8, 10]), text: "原技能直接生命伤害的P%吸血" },
  { code: "bloodthirst", name: "嗜血", slot: 1, p: r([8, 10], [10, 12], [12, 14], [14, 16], [16, 18], [18, 20]), n: r([10, 12], [9, 11], [8, 10], [7, 9], [6, 8], [5, 7]), text: "本次探索击杀N敌后获得P%吸血；本次启动击杀不追溯吸血" },
  { code: "veteran", name: "百战", slot: 1, p: r([2, 3], [3, 4], [4, 5], [5, 6], [6, 8], [8, 10]), n: r([4, 5], [3, 4], 3, [2, 3], 2, [1, 2]), text: "本次探索每击杀N敌，物理攻击+1，最多P；卸下不生效" },
  { code: "edgeStack", name: "叠锋", slot: 1, p: r([3, 4], [4, 6], [6, 8], [8, 10], [10, 12], [12, 14]), n: r([4, 5], 4, [3, 4], 3, [2, 3], 2), text: "每N次原始直接攻击，对存活主目标追加P点同类伤害；混合取物理" },
  { code: "hunt", name: "猎弱", slot: 1, p: r([6, 8], [8, 10], [10, 12], [12, 14], [14, 17], [17, 20]), text: "目标生命不高于35%时，原技能直接伤害+P%，每段判定" },
  { code: "wound", name: "逐伤", slot: 1, p: r([3, 5], [5, 7], [7, 9], [9, 11], [11, 14], [14, 17]), text: "目标有流血或灼烧时，原技能直接伤害+P%，两种不重复加成" },
  { code: "gap", name: "识隙", slot: 1, p: r(1, 1, 1, 1, 1, 1), n: r(3, 3, 2, 2, 1, 1), text: "每N次直接物理技能使破甲主目标损失生命后，加1流血；每招记一次" },
  { code: "ember", name: "余烬", slot: 1, p: r(1, 1, 1, 1, 1, 1), n: r(5, 5, 4, 4, 3, 3), text: "焚尽消费至少N层且目标存活时补1层灼烧" },
  { code: "barrier", name: "护体", slot: 2, p: r([4, 6], [6, 8], [8, 11], [11, 14], [14, 18], [18, 22]), text: "每战首次被敌方主动攻击实际扣血且存活后获得P盾" },
  { code: "guardShield", name: "回甲", slot: 2, p: r([2, 3], [3, 5], [5, 7], [7, 10], [10, 13], [13, 16]), text: "使用通用防御获得P盾，守反等技能不触发" },
  { code: "danger", name: "守危", slot: 2, p: r([2, 3], [3, 4], [4, 5], [5, 7], [7, 9], [9, 12]), text: "生命不高于35%时护甲+P" },
  { code: "nourish", name: "养元", slot: 2, p: r([3, 5], [5, 7], [7, 10], [10, 13], [13, 17], [17, 22]), text: "战斗胜利且存活后恢复P生命" },
  { code: "reflect", name: "反震", slot: 2, p: r([2, 3], [3, 4], [4, 6], [6, 8], [8, 10], [10, 12]), text: "被敌方主动攻击实际扣血且存活后，反震P物理伤害，每自身出招间隔一次" },
  { code: "store", name: "守势化锋", slot: 2, p: r([8, 12], [12, 18], [18, 24], [24, 30], [30, 36], [36, 40]), text: "护盾实吸直接伤害的P%存锋，上限80%攻击；下次直接技能对主目标附伤并清空" },
  { code: "excess", name: "血饲", slot: 2, p: r(2, [3, 4], [4, 5], [5, 6], [6, 8], [8, 10]), text: "吸血过量转盾，此来源当前盾最多P%生命上限；仍受总盾30%限制" },
  { code: "fortify", name: "固守", slot: 2, p: r([1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 8]), text: "通用防御后护甲+P，至下次自身出招前" },
  { code: "medicine", name: "药引", slot: 3, p: r([3, 5], [5, 7], [7, 10], [10, 13], [13, 16], [16, 20]), text: "实际使用血药、蓝药时药效+P%" },
  { code: "harmony", name: "合律", slot: 3, p: r(1, [1, 2], 2, [2, 3], 3, [3, 4]), text: "累计三种不同主动技能后回P蓝，清空记录；普攻、防御、用药不计" },
  { code: "returnMana", name: "归灵", slot: 3, p: r([1, 2], [2, 3], [3, 4], [4, 6], [6, 8], [8, 10]), text: "战斗胜利且存活后回复P蓝" },
  { code: "meditate", name: "调息", slot: 3, p: r([1, 2], 2, [2, 3], 3, [3, 4], [4, 5]), n: r(4, 4, [3, 4], 3, [2, 3], 2), text: "第N、2N、3N次自身回合开始各回P蓝，每战最多三次" },
  { code: "frugal", name: "节用", slot: 3, p: r(1, 1, [1, 2], 2, [2, 3], 3), text: "原本耗蓝的主动技能付费后返P蓝，不超过实付；每战最多五次" },
  { code: "hidden", name: "藏锋", slot: 3, p: r([3, 4], [5, 6], [7, 8], [9, 10], [11, 13], [14, 15]), text: "无直接伤害主动行动积1层，最多2；下次直接技能每层+P%并清空" },
  { code: "alternate", name: "换脉", slot: 3, p: r([3, 4], [5, 6], [7, 8], [9, 10], [11, 13], [14, 15]), n: r(1, 1, 1, 1, 2, 2), text: "纯物理后纯魔法直接伤害+P%；纯魔法后纯物理耗蓝-N；辅助保留，混合清空" },
  { code: "opening", name: "启明", slot: 3, p: r(1, [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]), n: r(1, 1, 1, [1, 2], 2, 2), text: "前N个完整回合，物理攻击与精神力各+P" },
];
export const SKILL_EFFECTS = {
  basic: { physical: 1, mana: 2 }, guard: { reduction: 0.4 },
  rend: { physical: 1.1, bleed: 1 }, sunder: { physical: 1, armorReduction: 0.25 },
  shatter: { physical: 1.4, shieldBonus: 2 }, spin: { physical: 0.45, hits: 3, bleed: 1 },
  execute: { physical: 2.2, threshold: 0.3 }, sweep: { physical: 0.8 },
  sever: { physical: 1.4, consume: 2, suppression: 0.4 },
  ignite: { magic: 0.9, burn: 2 }, firewind: { magic: 0.7, copy: 2 },
  detonate: { magic: 1.4, remainingBurn: 1.25 },
  frost: { magic: 1.1, chill: 2 }, spark: { magic: 1.2, mark: 1 },
  thunder: { magic: 1.8, consume: 2, bonusPerMark: 0.3 },
  mine: { magic: 1.8, mark: 1 }, chain: { magic: 1, consume: 2, bonusPerMark: 0.2 },
  icebreak: { physical: 1.2, magicPerChill: 0.8, consume: 3 },
  pierce: { physical: 1, magic: 1, consume: 1, armorIgnore: 0.5 },
  flameblade: { physical: 1.3, magicPerBurn: 0.1 },
  iron: { hpShield: 0.12, armorShield: 1, armorBonus: 0.2 },
  counter: { reduction: 0.5, physical: 0.9 },
  shieldhit: { physical: 1.2, shieldSpend: 0.5, spentDamage: 2, shieldBonus: 2 },
  ashward: { magicShield: 0.6, remainingBurnShield: 1, hpCap: 0.2, consume: 2 },
  bloodrage: { physical: 0.9, bonus: 0.4, charges: 2 },
  leech: { physical: 1.1, lifesteal: 0.3 }, bloodcast: { magic: 2 },
  convert: { physical: 1, mana: 12 },
  heal: { hpHeal: 0.1, magicHeal: 0.5 }, cleanse: { hpHeal: 0.05, cleanseTypes: 2 },
  bloodpay: { physical: 0.8, attackHealPerBleed: 0.4, consume: 2 },
  firebreath: { magic: 0.6, manaPerBurn: 2, consume: 2 },
  frostheal: { hpHealPerChill: 0.05, magicHeal: 0.4, cleanseTypes: 1, consume: 2 },
  frostseal: { magic: 0.8, suppression: 0.45, consume: 2 },
  recall: { magic: 0.6, manaPerMark: 3, consume: 2 },
  thunderward: { hpShield: 0.08, hpShieldPerMark: 0.05, consume: 2 },
};
export const SKILLS = [
  ["basic", "普攻", 0, 0, 1], ["guard", "防御", 0, 0, 4],
  ["rend", "裂帛", 0, 0, 1], ["sunder", "断甲刺", 2, 0, 1],
  ["shatter", "破障槌", 2, 1, 1], ["spin", "回旋刃", 3, 0, 1],
  ["execute", "斩命", 3, 0, 1], ["sweep", "横扫", 3, 0, 1],
  ["sever", "截脉", 2, 1, 1], ["ignite", "点烬", 4, 0, 2],
  ["firewind", "焚风", 7, 0, 2], ["detonate", "焚尽", 8, 0, 2],
  ["frost", "凝霜", 4, 0, 2], ["spark", "雷引", 4, 0, 2],
  ["thunder", "惊雷", 8, 0, 2], ["mine", "伏雷", 5, 1, 4],
  ["chain", "雷链", 7, 0, 2], ["icebreak", "碎寒击", 3, 0, 3],
  ["pierce", "雷贯", 5, 0, 3], ["flameblade", "借焰斩", 3, 0, 3],
  ["iron", "铁衣", 5, 2, 4], ["counter", "守反", 1, 1, 4],
  ["shieldhit", "碎壁轰", 3, 0, 1], ["ashward", "灰烬衣", 2, 2, 4],
  ["bloodrage", "燃血", 0, 2, 1], ["leech", "饮血刃", 2, 0, 1],
  ["bloodcast", "血契", 4, 0, 2], ["convert", "化灵", 0, 3, 1, 3],
  ["heal", "回春", 8, 2, 4, 3], ["cleanse", "涤尘", 4, 2, 4, 3],
  ["bloodpay", "血偿", 2, 2, 1, 3], ["firebreath", "火息", 0, 2, 2, 3],
  ["frostheal", "回霜", 3, 2, 4, 3], ["frostseal", "霜封", 2, 1, 2],
  ["recall", "雷回流", 0, 2, 2, 3], ["thunderward", "霆护", 3, 0, 4],
].map(([code, name, mp, cd, kind, uses = 0]) => ({ code, name, mp, cd, kind, uses, effect: SKILL_EFFECTS[code] }));
export const BY_SKILL = Object.fromEntries(SKILLS.map(x => [x.code, x]));
export const BUILDS = [
  { code: "bleed", name: "放血省药", bases: ["steelSword", "scale", "jade"], traits: ["gap", "excess", "frugal"], skills: ["rend", "sunder", "leech", "sever", "bloodpay"], potions: [3, 2] },
  { code: "fire", name: "养火收火", bases: ["bamboo", "heart", "pin"], traits: ["ember", "barrier", "hidden"], skills: ["ignite", "detonate", "firewind", "firebreath", "ashward"], potions: [2, 3] },
  { code: "frost", name: "寒意择机", bases: ["fan", "scale", "edge"], traits: ["hunt", "nourish", "alternate"], skills: ["frost", "icebreak", "frostheal", "frostseal", "sweep"], potions: [3, 2] },
  { code: "thunder", name: "雷印调度", bases: ["seal", "heart", "pin"], traits: ["edgeStack", "store", "meditate"], skills: ["spark", "thunder", "recall", "thunderward", "chain"], potions: [2, 3] },
  { code: "guard", name: "守势转攻", bases: ["steelSword", "heavy", "jade"], traits: ["vampire", "store", "hidden"], skills: ["iron", "counter", "shieldhit", "leech", "sunder"], potions: [3, 2] },
  { code: "blood", name: "血蓝轮换", bases: ["saber", "heart", "pin"], traits: ["vampire", "excess", "alternate"], skills: ["bloodrage", "bloodcast", "leech", "convert", "cleanse"], potions: [3, 2] },
];

// 每个敌人都有有限资源；治疗、净化和护盾的次数预算独立，耗尽后改为普攻。
export const ENEMIES = [
  [1, "山门游兵", 1, 110, 18, 14, 8, 6, 9, ["strike", "strike", "heavy"]],
  [2, "疾行斥候", 1, 105, 16, 15, 8, 4, 14, ["flurry", "strike", "heavy"]],
  [3, "铁甲守卒", 1, 145, 18, 13, 8, 35, 7, ["strike", "guard", "heavy"]],
  [4, "余火术士", 1, 112, 24, 8, 18, 6, 10, ["ignite", "bolt", "strike"]],
  [5, "霜纹侍者", 1, 120, 24, 10, 16, 8, 11, ["frost", "bolt", "strike"]],
  [6, "持符卫士", 1, 135, 24, 13, 12, 12, 8, ["ward", "strike", "heavy"]],
  [7, "疗伤门徒", 1, 130, 18, 12, 13, 8, 9, ["strike", "mend", "bolt"]],
  [8, "重甲统领", 2, 240, 30, 19, 10, 45, 8, ["strike", "charge", "slam", "guard"]],
  [9, "净尘执事", 2, 210, 36, 12, 23, 12, 12, ["bolt", "purify", "heavy"]],
  [10, "结界执事", 2, 235, 36, 18, 18, 18, 9, ["ward", "strike", "bolt", "heavy"]],
  [11, "伏雷祭司", 2, 215, 40, 10, 24, 10, 13, ["bolt", "charge", "storm", "strike"]],
  [12, "噬血卫长", 2, 250, 30, 21, 14, 15, 11, ["strike", "drain", "heavy"]],
  [13, "镇门石卫", 3, 360, 48, 25, 18, 28, 8, ["charge", "slam", "strike", "ward"]],
  [14, "焚殿长老", 3, 340, 60, 14, 28, 16, 12, ["ignite", "bolt", "charge", "storm"]],
  [15, "藏经守使", 3, 380, 54, 23, 24, 20, 10, ["strike", "mend", "bolt", "purify", "heavy"]],
].map(([id, name, tier, hp, mp, a, s, armor, speed, pattern]) => ({
  id, name, tier, hp, mp, a, s, armor, speed, pattern,
  healUses: tier === 3 ? 2 : 1, wardUses: 2, purifyUses: 2,
}));

export function rng(seed) {
  let v = seed >>> 0;
  return () => { v = (Math.imul(v, 1664525) + 1013904223) >>> 0; return v / 4294967296; };
}
export const integer = (random, low, high) => low + Math.floor(random() * (high - low + 1));
export function rollItem(code, quality, seed, traitCode) {
  const base = BASES.find(x => x.code === code);
  if (!base || quality < 1 || quality > 6) throw new Error("无效底材或品质");
  // 属性和特性分流，指定特性不会改变主副属性，便于同输入对照。
  const random = rng(seed), traitRandom = rng(seed ^ 0x9e3779b9);
  const [lo, hi] = WINDOWS[quality - 1];
  const mainBand = integer(random, lo, hi), sub = STAT_KEYS[integer(random, 0, 5)];
  const subBand = integer(random, lo, hi);
  const mainValue = integer(random, ...MAIN[base.main][mainBand - 1]);
  const subValue = integer(random, ...SUB[sub][subBand - 1]);
  const pool = TRAITS.filter(x => x.slot === base.slot);
  const source = traitCode ? pool.find(x => x.code === traitCode) : pool[integer(traitRandom, 0, pool.length - 1)];
  if (!source) throw new Error("特性不属于该部位");
  const trait = { code: source.code, name: source.name, p: integer(traitRandom, ...source.p[quality - 1]) };
  if (source.n) trait.n = integer(traitRandom, ...source.n[quality - 1]);
  const maxDurability = base.durability + RULES.durabilityQuality[quality - 1];
  return { code, name: base.name, slot: base.slot, quality, main: base.main, mainBand, mainValue, sub, subBand, subValue, trait, durability: maxDurability, maxDurability, kills: 0 };
}
export function loadout(build, quality, seed, randomTraits = false) {
  return build.bases.map((code, i) => rollItem(code, quality, (seed + Math.imul(i + 1, 73471)) >>> 0, randomTraits ? undefined : build.traits[i]));
}
export function statsFromItems(items, player = RULES.player) {
  const stats = { ...player };
  for (const item of items) {
    const contribution = Object.fromEntries(STAT_KEYS.map(k => [k, 0]));
    contribution[item.main] += item.mainValue;
    contribution[item.sub] += item.subValue;
    for (const k of STAT_KEYS) stats[k] += Math.round(contribution[k] * (item.durability > 0 ? 1 : 0.5));
  }
  return stats;
}
export function activeTraits(items) {
  const result = {};
  for (const item of items) {
    const t = { ...item.trait, kills: item.kills };
    const old = result[t.code];
    if (!old || t.p > old.p || (t.p === old.p && (t.n ?? 0) < (old.n ?? 0))) result[t.code] = t;
  }
  return result;
}
