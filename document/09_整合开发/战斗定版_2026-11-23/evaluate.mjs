import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { VERSION, RULES, BUILDS, BASES, TRAITS, ENEMIES, loadout, rollItem, statsFromItems } from "./catalog.mjs";
import { fight, expedition } from "./engine.mjs";

const hash = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const digest = ["catalog.mjs", "engine.mjs"].map(file => [file, hash(readFileSync(new URL(file, import.meta.url)))]);
const mean = xs => xs.length ? Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)) : null;
function row(st, extra = {}) {
  return {
    ...extra, won: st.won, lost: st.lost, stalled: !st.settled, rounds: st.round,
    hp: st.p.hp, mp: st.p.mp, maxHp: st.p.maxHp, maxMp: st.p.maxMp,
    hpPotions: st.metrics.hpPotions, mpPotions: st.metrics.mpPotions,
    damage: st.metrics.damage, incoming: st.metrics.incoming, healing: st.metrics.healing,
    manaSpent: st.metrics.manaSpent, manaRecovered: st.metrics.manaRecovered,
    dosesUsed: st.metrics.dosesUsed, remainingPotions: st.potions,
    actions: st.metrics.actions, procs: st.metrics.procs,
  };
}
function summary(rows) {
  return {
    count: rows.length, wins: rows.filter(x => x.won).length, stalls: rows.filter(x => x.stalled).length,
    winRounds: mean(rows.filter(x => x.won).map(x => x.rounds)),
    hpPotions: mean(rows.map(x => x.hpPotions)), mpPotions: mean(rows.map(x => x.mpPotions)),
    endingHpRatio: mean(rows.map(x => x.hp / x.maxHp)),
  };
}
function grouped(rows, key) {
  return Object.fromEntries([...new Set(rows.map(x => x[key]))].map(value => [value, summary(rows.filter(x => x[key] === value))]));
}
const mode = process.argv[2] ?? "--full";
const output = { version: VERSION, mode, sourceHashes: digest, rules: RULES, battles: [], expeditions: [], comparisons: [] };
if (mode === "--smoke" || mode === "--sweep") {
  const configs = mode === "--smoke" ? [{ name: "base", hp: 1, attack: 1 }] : [
    { name: "gentle", hp: 0.9, attack: 0.9 },
    { name: "base", hp: 1, attack: 1 },
    { name: "pressure", hp: 1.1, attack: 1.1 },
  ];
  for (const config of configs) for (const b of BUILDS) for (const seed of [17, 118]) {
    const items = loadout(b, 3, seed);
    for (const enemy of ENEMIES) {
      const st = fight(b, items, [enemy.id], { depth: 2, potions: [0, 0], enemyHp: config.hp, enemyAttack: config.attack });
      output.battles.push(row(st, { candidate: config.name, build: b.code, seed, quality: 3, enemy: enemy.id, tier: enemy.tier }));
    }
  }
  output.byCandidate = grouped(output.battles, "candidate");
  output.byBuild = grouped(output.battles, "build");
} else if (mode === "--full") {
  // 留出种子不参与候选筛选；两种决策偏好均按同一敌人和物品输入对照。
  for (const b of BUILDS) for (let q = 1; q <= 6; q++) for (const seed of [733, 941]) for (const profile of ["balanced", "aggressive"]) {
    const items = loadout(b, q, seed);
    for (const enemy of ENEMIES) {
      const st = fight(b, items, [enemy.id], { depth: 2, profile, potions: [0, 0] });
      output.battles.push(row(st, { suite: "single-no-medicine", build: b.code, quality: q, seed, profile, enemy: enemy.id, tier: enemy.tier }));
      if (enemy.tier === 3) output.battles.push(row(fight(b, items, [enemy.id], { depth: 2, profile }), { suite: "boss-five-cells", build: b.code, quality: q, seed, profile, enemy: enemy.id, tier: enemy.tier }));
    }
    for (const policy of ["none", "full", "economical"]) {
      const supply = policy !== "none";
      const result = expedition(b, items, { depth: 2, profile, supply, supplyPolicy: policy, reserve: supply ? [10, 8] : [0, 0] });
      output.expeditions.push({
        build: b.code, quality: q, seed, profile, supply, policy, completed: result.completed,
        fights: result.battles.length, wins: result.battles.filter(x => x.won).length,
        hp: result.hp, mp: result.mp, remainingPotions: result.potions, reserve: result.reserve,
        hpPotions: result.outsideHp + result.battles.reduce((n, st) => n + st.metrics.hpPotions, 0),
        mpPotions: result.outsideMp + result.battles.reduce((n, st) => n + st.metrics.mpPotions, 0),
        outsideHp: result.outsideHp, outsideMp: result.outsideMp,
        durability: result.items.map(x => x.durability), stalls: result.battles.filter(x => !x.settled).length,
        battles: result.battles.map((st, i) => row(st, { enemy: RULES.route[i], index: i })),
      });
    }
  }
  // 每个底材与每个特性定向覆盖，其他输入固定；并非任意三特性组合穷举。
  for (const base of BASES) for (const q of [1, 3, 6]) {
    const b = BUILDS[base.main === "s" || base.main === "mp" ? 1 : 0], items = loadout(b, q, 2027);
    items[base.slot - 1] = rollItem(base.code, q, 5821);
    for (const id of [3, 10, 14]) output.battles.push(row(fight(b, items, [id], { depth: 2 }), { suite: "base-coverage", base: base.code, build: b.code, quality: q, enemy: id, tier: ENEMIES.find(x => x.id === id).tier }));
  }
  for (const t of TRAITS) for (const q of [1, 3, 6]) {
    const b = BUILDS[t.code === "ember" ? 1 : 0], items = loadout(b, q, 2027);
    const base = BASES.find(x => x.slot === t.slot);
    items[t.slot - 1] = rollItem(base.code, q, 5821, t.code);
    for (const id of [3, 10, 14]) output.battles.push(row(fight(b, items, [id], { depth: 2 }), { suite: "trait-coverage", trait: t.code, build: b.code, quality: q, enemy: id, tier: ENEMIES.find(x => x.id === id).tier }));
  }
  // 群敌、低资源、零耐久、裸装及全随机掉落均独立计数。
  for (const b of BUILDS) for (const q of [1, 3, 6]) for (const seed of [3049, 4093]) {
    const items = loadout(b, q, seed);
    for (const ids of [[1, 2], [1, 4, 5]]) output.battles.push(row(fight(b, items, ids, { depth: 2 }), { suite: "group", build: b.code, quality: q, seed, enemy: ids.join("+") }));
    for (const variant of ["low-resource", "zero-durability", "naked", "random-traits"]) {
      const chosen = variant === "naked" ? [] : variant === "random-traits" ? loadout(b, q, seed, true) : structuredClone(items);
      if (variant === "zero-durability") chosen.forEach(x => { x.durability = 0; });
      const stats = statsFromItems(chosen);
      const opts = variant === "low-resource" ? { hp: Math.round(stats.hp * 0.4), mp: 0 } : {};
      for (const id of [1, 10, 13]) output.battles.push(row(fight(b, chosen, [id], { depth: 2, ...opts }), { suite: variant, build: b.code, quality: q, seed, enemy: id }));
    }
  }
  // 无特性对照同一装备面板，避免把品质面板收益误记为特性收益。
  for (const b of BUILDS) for (const seed of [733, 941]) {
    const items = loadout(b, 3, seed), plain = structuredClone(items);
    plain.forEach(x => { x.trait = { code: "none", name: "无特性", p: 0 }; });
    for (const id of [3, 10, 13]) {
      output.comparisons.push({
        build: b.code, seed, enemy: id,
        withTraits: row(fight(b, items, [id], { depth: 2, potions: [0, 0] })),
        withoutTraits: row(fight(b, plain, [id], { depth: 2, potions: [0, 0] })),
      });
    }
  }
  for (const b of BUILDS) for (const q of [1, 3, 6]) for (const id of [13, 14, 15]) {
    const items = loadout(b, q, 4093);
    for (const [name, potions] of [
      ["standard", b.potions], ["greater", [0, 0, b.potions[0], b.potions[1], 0, 0]],
      ["mixed", [1, 1, 1, 0, 1, 1]],
    ]) output.battles.push(row(fight(b, items, [id], { depth: 2, potions }), { suite: "six-potions", build: b.code, quality: q, enemy: id, pack: name }));
  }
  const primary = output.battles.filter(x => x.suite === "single-no-medicine");
  output.singleByBuild = grouped(primary, "build");
  output.singleByQuality = grouped(primary, "quality");
  output.singleByTier = grouped(primary, "tier");
  output.bySuite = grouped(output.battles, "suite");
  output.routes = Object.fromEntries(["none", "full", "economical"].map(policy => [policy, {
    count: output.expeditions.filter(x => x.policy === policy).length,
    complete: output.expeditions.filter(x => x.policy === policy && x.completed).length,
    hpPotions: mean(output.expeditions.filter(x => x.policy === policy).map(x => x.hpPotions)),
    mpPotions: mean(output.expeditions.filter(x => x.policy === policy).map(x => x.mpPotions)),
  }]));
  const traces = [];
  for (const b of BUILDS) for (const id of [10, 13]) {
    const st = fight(b, loadout(b, 3, 733), [id], { depth: 2, trace: true });
    traces.push(`## ${b.name} / ${ENEMIES.find(x => x.id === id).name}\n\n${st.log.join("\n\n")}\n\n结果：${st.won ? "胜" : "败"}，${st.round}回合，${st.p.hp}血/${st.p.mp}蓝。\n`);
  }
  writeFileSync(new URL("逐回合战报.md", import.meta.url), `# 联合定版逐回合战报\n\n固定种子733、精良品质、五格真实药品、三装备特性，无额外被动栏。\n\n${traces.join("\n")}`, "utf8");
  output.traceFights = traces.length;
}
output.totalSummary = summary(output.battles);
output.resultHash = hash({ battles: output.battles, expeditions: output.expeditions, comparisons: output.comparisons });
const path = new URL(mode === "--sweep" ? "candidates.json" : mode === "--smoke" ? "smoke.json" : "results.json", import.meta.url);
writeFileSync(path, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  path: fileURLToPath(path), summary: output.totalSummary, byBuild: output.singleByBuild ?? output.byBuild,
  byTier: output.singleByTier, candidates: output.byCandidate, routes: output.routes,
}, null, 2));
