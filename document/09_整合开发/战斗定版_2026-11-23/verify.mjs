import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { VERSION, RULES, POTIONS, BUILDS, ENEMIES, BASES, TRAITS, SKILLS, loadout } from "./catalog.mjs";
import { fight } from "./engine.mjs";

const read = file => readFileSync(new URL(file, import.meta.url), "utf8");
const data = JSON.parse(read("results.json")), candidates = JSON.parse(read("candidates.json"));
const frozen = JSON.parse(read("开发数值.json"));
const sha = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const sourceDigest = file => sha(readFileSync(new URL(file, import.meta.url)).toJSON());
const avg = xs => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : "—";
const rate = rows => `${rows.filter(x => x.won).length}/${rows.length}`;
const names = Object.fromEntries(BUILDS.map(b => [b.code, b.name]));
const suites = {
  "single-no-medicine": "无药单场", "boss-five-cells": "首领五格标准药",
  "base-coverage": "全部底材定向", "trait-coverage": "全部特性定向",
  group: "双敌/三敌", "low-resource": "40%血、0蓝开战",
  "zero-durability": "三件零耐久", naked: "裸装", "random-traits": "随机特性",
  "six-potions": "六药品组合",
};
assert.equal(data.version, VERSION); assert.equal(candidates.version, VERSION);
for (const result of [data, candidates]) {
  for (const [file, hash] of result.sourceHashes) assert.equal(sourceDigest(file), hash, `${file}已经改变，结果过期`);
  assert.equal(sha({ battles: result.battles, expeditions: result.expeditions, comparisons: result.comparisons }), result.resultHash);
}
assert.deepEqual(frozen.rules, RULES);
assert.deepEqual(frozen.skills, SKILLS); assert.deepEqual(frozen.traits, TRAITS); assert.deepEqual(frozen.enemies, ENEMIES); assert.deepEqual(frozen.potions, POTIONS);
assert.deepEqual(frozen.exampleBuilds, BUILDS);
assert.deepEqual(data.rules, RULES); assert.deepEqual(candidates.rules, RULES);
assert.equal(RULES.activeSlots, 5);
for (const b of BUILDS) assert.equal(b.skills.length, RULES.activeSlots);
assert.equal(frozen.bases.length, BASES.length);
assert.equal(data.battles.length, 3690); assert.equal(candidates.battles.length, 540);
assert.equal(data.expeditions.length, 432); assert.equal(data.comparisons.length, 36);
for (const x of [...data.battles, ...candidates.battles, ...data.comparisons.flatMap(x => [x.withTraits, x.withoutTraits])]) {
  assert.equal(x.stalled, false);
  assert.notEqual(x.won, x.lost);
  assert.ok(x.won ? x.hp > 0 : x.hp === 0);
  for (const key of ["hp", "mp", "rounds", "damage", "incoming", "healing", "manaSpent", "manaRecovered", "dosesUsed"]) assert.ok(Number.isInteger(x[key]) && x[key] >= 0, key);
  assert.ok(x.hp <= x.maxHp && x.mp <= x.maxMp);
  assert.ok(x.remainingPotions.every(n => Number.isInteger(n) && n >= 0));
  const expectedDoses = x.suite === "single-no-medicine" || x.candidate || !x.suite ? 0 : 5;
  assert.equal(x.dosesUsed + x.remainingPotions.reduce((a, b) => a + b, 0), expectedDoses);
}
for (const x of data.expeditions) {
  assert.equal(x.stalls, 0);
  assert.equal(x.wins, x.completed ? 8 : x.fights - 1);
  assert.equal(x.hpPotions + x.mpPotions,
    x.outsideHp + x.outsideMp + x.battles.reduce((sum, y) => sum + y.dosesUsed, 0));
  assert.equal(x.hpPotions + x.mpPotions + x.remainingPotions.reduce((a, b) => a + b, 0) + x.reserve[0] + x.reserve[1], x.supply ? 23 : 5);
  x.battles.forEach((y, index) => assert.equal(y.enemy, RULES.route[index]));
  assert.ok(x.durability.every(d => Number.isInteger(d) && d >= 0));
}
for (const b of BUILDS) {
  const weight = b.bases.reduce((n, code) => n + BASES.find(x => x.code === code).weight, 0) + 2 + 18;
  assert.ok(weight <= 34, "补给测试超出精良背包承重");
}
const traces = [];
for (const b of BUILDS) for (const id of [10, 13]) {
  const st = fight(b, loadout(b, 3, 733), [id], { depth: 2, trace: true });
  traces.push(`## ${b.name} / ${ENEMIES.find(x => x.id === id).name}\n\n${st.log.join("\n\n")}\n\n结果：${st.won ? "胜" : "败"}，${st.round}回合，${st.p.hp}血/${st.p.mp}蓝。\n`);
}
assert.equal(read("逐回合战报.md"), `# 联合定版逐回合战报\n\n固定种子733、精良品质、五格真实药品、三装备特性，无额外被动栏。\n\n${traces.join("\n")}`);
const tests = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL("test.mjs", import.meta.url))], { encoding: "utf8" }));
const primary = data.battles.filter(x => x.suite === "single-no-medicine");
const routeBattleCount = data.expeditions.reduce((n, x) => n + x.battles.length, 0);
const pairedCount = data.comparisons.length * 2;
const total = candidates.battles.length + data.battles.length + routeBattleCount + pairedCount + traces.length;
const verification = {
  version: VERSION, ruleGroupsPassed: tests.passed, generationChecks: tests.generationChecks,
  candidateBattles: candidates.battles.length, expandedSingleBattles: data.battles.length,
  expeditionAttempts: data.expeditions.length, expeditionBattles: routeBattleCount,
  traitComparisonBattles: pairedCount, traceReplayBattles: traces.length, totalRecordedBattles: total,
  stalls: 0, supplyConservationPassed: true, traceReplaysPassed: true, sourceFreshnessPassed: true,
  resultHash: data.resultHash,
};
writeFileSync(new URL("核验摘要.json", import.meta.url), `${JSON.stringify(verification, null, 2)}\n`, "utf8");
const report = [
  "# 联合开发基线测试报告", "",
  `日期：2026-11-23。版本：\`${VERSION}\`。`, "",
  "结论：本版可以进入正式开发。技能、装备、属性、药效和敌人已使用同一规则验算；以下是独立自动验算结果，尚未迁移客户端，不等于真人胜率或客户端验收。", "",
  "## 1. 固定输入", "",
  `裸装240血/36蓝/18物攻/18精神/6护甲/10速度；${RULES.activeSlots}主动位加独立普攻/防御；三件装备各1条特性。34技能、24底材、24特性、六品质、15敌人、六种药品共同纳入验算。`, "",
  "每单位每回合一次行动；五格药品不占行动，但每自身回合共用一次机会。跨战不补满，耐久每场结算一次；没有额外战术转换、额外被动栏、锁血或强制最低回合。", "",
  "## 2. 规则及结果审计", "",
  `- ${tests.passed}组规则通过，另有${tests.generationChecks}次全底材/品质生成检查。`,
  "- 五技能可装、第六技能拒绝，普攻/防御独立可用；三部位极端面板和临时增幅继续满足攻击/精神/护甲两位数预算。",
  "- 覆盖用药时机/份数守恒、快敌致死、冷却和每战次数、状态计时、护盾溢出、吸血来源、反击存活、多段/群体只计一次、附伤不递归、生命支付、零耐久和探索计数。",
  "- 专门验证六种药各占一格、双恢复分别截断、药引不增幅护盾、药品不触发技能计数。",
  `- 候选${candidates.battles.length}场，扩大单场${data.battles.length}场；${data.expeditions.length}次八战探索实际结算${routeBattleCount}场；同面板有无特性对照${pairedCount}场；完整逐回合回放${traces.length}场。合计${total}场可记录验证战斗。`,
  "- 当前结果零停滞。源文件指纹、结果摘要、每次探索的药品总量守恒与12条逐回合记录重新核对通过。",
  "- 候选种子17/118；扩大主矩阵733/941；专项2027/5821及3049/4093。候选和扩大主矩阵分离。", "",
  "## 3. 为什么选当前敌人预算", "",
  "| 候选 | 无药胜利 | 胜场平均回合 | 结束生命比例（含失败） |",
  "| --- | --- | --- | --- |",
];
for (const [key, label] of [["gentle", "敌血/双攻各90%"], ["base", "采用：当前预算"], ["pressure", "敌血/双攻各110%"]]) {
  const rows = candidates.battles.filter(x => x.candidate === key);
  report.push(`| ${label} | ${rate(rows)} | ${avg(rows.filter(x => x.won).map(x => x.rounds))} | ${avg(rows.map(x => x.hp / x.maxHp * 100))}% |`);
}
report.push("", "当前预算保留了普通战的低消耗处理与首领长战空间。较轻候选更容易缩短战斗、减少药耗；整体加压则同时提高所有敌人的承伤与资源消耗，没有额外玩法收益，故不作为初始默认。", "",
  "八格阶段曾修正首领总承伤与策略忽略敌盾问题：首领生命460/420/490收紧为360/340/380，产盾次数3降2；持续伤害/压制时效也已有回归。本轮将六套样本收敛为各五招，以上既有修正沿用，当前全部成绩重新生成。", "",
  "五格复核决定：保留裸装六属性、主副随机区间、24特性参数、34技能倍率/费用、六药药效、敌人面板与耐久预算，不为补足减少的三格统一增伤、减耗或削敌。下表及八战结果支持该开发起点；低品质首领失败保留，客户端接入后再验真人节奏。", "",
  "## 4. 无药单场节奏", "",
  "| 敌人档次 | 胜利/样本 | 胜场平均回合 |",
  "| --- | --- | --- |");
for (const tier of [1, 2, 3]) {
  const rows = primary.filter(x => x.tier === tier);
  report.push(`| ${["", "普通", "精英", "首领"][tier]} | ${rate(rows)} | ${avg(rows.filter(x => x.won).map(x => x.rounds))} |`);
}
const bossMedicine = data.battles.filter(x => x.suite === "boss-five-cells");
report.push("", `满血满蓝、带本路线五格标准药的首领矩阵：${rate(bossMedicine)}获胜，胜场平均${avg(bossMedicine.filter(x => x.won).map(x => x.rounds))}回合。六品质均覆盖，不表示任意技能/特性组合都必胜。`, "",
  "| 品质 | 全15敌无药胜利 | 首领五格标准药胜利 |",
  "| --- | --- | --- |");
for (let q = 1; q <= 6; q++) report.push(`| ${frozen.qualities[q - 1].name} | ${rate(primary.filter(x => x.quality === q))} | ${rate(bossMedicine.filter(x => x.quality === q))} |`);
report.push("", "统计均保留失败样本，胜场回合只统计胜场。普通/精英100%说明这些固定样本在满状态下可解，不代表连战无消耗；跨战资源的结果另列。", "",
  "## 5. 六种组合的实际取舍", "",
  "| 路线 | 无药胜利 | 胜场回合 | 每场付蓝均值 | 八战节约补给通关 | 血药/蓝药实际使用均值 |",
  "| --- | --- | --- | --- | --- | --- |");
for (const b of BUILDS) {
  const singles = primary.filter(x => x.build === b.code), routes = data.expeditions.filter(x => x.build === b.code && x.policy === "economical");
  report.push(`| ${b.name} | ${rate(singles)} | ${avg(singles.filter(x => x.won).map(x => x.rounds))} | ${avg(singles.map(x => x.manaSpent))} | ${routes.filter(x => x.completed).length}/${routes.length} | ${avg(routes.map(x => x.hpPotions))} / ${avg(routes.map(x => x.mpPotions))} |`);
}
report.push("", "五格样本按核心循环取舍：放血在铺层、破甲、吸血、压制与血偿间分配行动；火系在群攻、引爆、回蓝、产盾间消费火源；寒意在爆发、治疗和压制间选择；雷印在单体、群体、回蓝和护盾间分配；守势以盾转伤和吸血推进；血系在生命与法力之间转换。实际回合及药耗以上表为准，这些五技能/三特性样本不代表任意组合的排名。", "",
  "| 路线 | 普通胜场回合 | 精英胜场回合 | 首领胜场回合 |",
  "| --- | --- | --- | --- |");
for (const b of BUILDS) report.push(`| ${b.name} | ${[1, 2, 3].map(tier =>
  avg(primary.filter(x => x.build === b.code && x.tier === tier && x.won).map(x => x.rounds))).join(" | ")} |`);
report.push("", "防守型组合的首领时长明显高于火雷，属于用时间换较低血药消耗；总体平均回合不能代表每条路线。保留这种代价，不为缩格统一加强输出。", "",
  "## 6. 连续八战与补给", "",
  "| 补给策略 | 八战通关 | 血药使用均值 | 蓝药使用均值 |",
  "| --- | --- | --- | --- |");
for (const [policy, label] of [["none", "只带初始五格，不补给"], ["full", "战外有缺口就补满并装匣"], ["economical", "战外缺口达药效65%再用药并装匣"]]) {
  const rows = data.expeditions.filter(x => x.policy === policy);
  report.push(`| ${label} | ${rows.filter(x => x.completed).length}/${rows.length} | ${avg(rows.map(x => x.hpPotions))} | ${avg(rows.map(x => x.mpPotions))} |`);
}
report.push("", "两种战外补给各有实际储备10血药/8蓝药，不包含免费回满或途中掉落。18格储备可装入固定精良纳虚器21格，重量也逐套核对通过；战内仍只有开战时五份可用。药耗均值包括战外和战内实际使用，含失败尝试。", "",
  "节约补给比机械补满更省药，说明物品携带和使用时机有意义。剩余失败集中在较低品质路线的最终首领与药品分配；有些失败仍留有另一种药，不能把总药数直接当作战斗中的可用血蓝。不要求白装无补给完成整条路线，也不要求将所有路线耗药调成一样。", "",
  "| 品质 | 节约补给八战通关 | 血药使用均值 | 蓝药使用均值 |",
  "| --- | --- | --- | --- |");
for (let q = 1; q <= 6; q++) {
  const rows = data.expeditions.filter(x => x.policy === "economical" && x.quality === q);
  report.push(`| ${frozen.qualities[q - 1].name} | ${rows.filter(x => x.completed).length}/${rows.length} | ${avg(rows.map(x => x.hpPotions))} | ${avg(rows.map(x => x.mpPotions))} |`);
}
report.push("", "这些是同一补给预算与六套固定组合的样本；品质提高同时影响装备主副属性与特性，不把结果解释为单一特性的收益。", "",
  "## 7. 附加覆盖", "",
  "| 专项 | 胜利/样本 |",
  "| --- | --- |");
for (const suite of Object.keys(suites).filter(x => !["single-no-medicine", "boss-five-cells"].includes(x))) {
  const rows = data.battles.filter(x => x.suite === suite);
  report.push(`| ${suites[suite]} | ${rate(rows)} |`);
}
report.push("", "底材与特性定向样本为逐件替换、白/蓝/红品质、固定三敌，其他两件维持基准，并非单件独立收益或所有三特性组合穷举。六药专项包含标准药、高阶纯药与混合药匣三种配置。低资源专项允许五格药品，不等于无药濒死生存保证。", "",
  "## 8. 开发放行与边界", "",
  "按[开发基线](开发基线.md)与[精确参数](开发参数表.md)进入正式实施：基础数值、34技能、24随机特性、六药和15敌人不再留待设计。保留攻击/精神/护甲两位数预算，不增加额外行动，不把被动变成六条无装备成本的常驻能力。", "",
  "本轮不验证真实地图药品掉落/经济收支、永久学习和成长、全部随机装备组合、客户端界面、Excel导出、存档事务或真人操作。正式接入仍需真实点击、保存失败回滚、药品UID守恒、拖拽换装/修理、重放与读档验收；旧客户端尚未迁移。", "",
  "## 9. 复现", "",
  "在此目录运行`powershell -ExecutionPolicy Bypass -File run.ps1`；只审计现有结果用`run.ps1 -VerifyOnly`。脚本优先使用本机Codex的Node运行时，要求Node18及以上。", "",
  "依次执行：`test.mjs` → `evaluate.mjs --sweep` → `evaluate.mjs --full` → `freeze.mjs` → `verify.mjs`。`verify.mjs`会重新执行规则检查及12场逐回合回放，核对源指纹、每条结果和所有探索药品守恒，再生成本报告与核验摘要。", "",
  `结果摘要指纹：\`${data.resultHash}\`。`, "",
);
writeFileSync(new URL("测试报告.md", import.meta.url), report.join("\n"), "utf8");
console.log(JSON.stringify(verification, null, 2));
