import { writeFileSync } from "node:fs";
import { VERSION, ENUMS, RULES, POTIONS, QUALITY_NAMES, WINDOWS, MAIN, SUB, BASES, TRAITS, SKILLS, ENEMIES, BUILDS } from "./catalog.mjs";

const names = { hp: "生命上限", mp: "法力上限", a: "物理攻击", s: "精神力", armor: "护甲", speed: "速度" };
const range = ([low, high]) => low === high ? `${low}` : `${low}～${high}`;
const data = {
  version: VERSION, purpose: "正式开发数值输入；未导入运行配置，不替代固定物品ID",
  enumDefinitions: {
    ...ENUMS, enemyTier: { normal: 1, elite: 2, boss: 3 },
    potionResource: { hp: 1, mp: 2, dual: 3, shield: 4 },
  }, rules: RULES,
  qualities: QUALITY_NAMES.map((name, i) => ({ quality: i + 1, name, minBand: WINDOWS[i][0], maxBand: WINDOWS[i][1] })),
  attributes: Object.keys(MAIN).map(code => ({ stat: ENUMS.stat[code], name: names[code], main: MAIN[code], sub: SUB[code] })),
  bases: BASES.map(x => ({ ...x, main: ENUMS.stat[x.main] })),
  traits: TRAITS, skills: SKILLS, enemies: ENEMIES, potions: POTIONS, exampleBuilds: BUILDS,
};
writeFileSync(new URL("开发数值.json", import.meta.url), `${JSON.stringify(data, null, 2)}\n`, "utf8");
const lines = [
  "# 开发参数表", "", "由 `catalog.mjs` 生成，修改数值后运行 `freeze.mjs` 同步；此文件不直接导表，不分配正式物品ID。", "",
  "## 六档属性", "", "| 属性 | 主/副 | 1档 | 2档 | 3档 | 4档 | 5档 | 6档 |", "| --- | --- | --- | --- | --- | --- | --- | --- |",
];
for (const key of Object.keys(MAIN)) {
  lines.push(`| ${names[key]} | 主属性 | ${MAIN[key].map(range).join(" | ")} |`);
  lines.push(`| ${names[key]} | 副属性 | ${SUB[key].map(range).join(" | ")} |`);
}
lines.push("", "主、副各自先抽品质允许的档位，再抽该档整数；副属性在六种属性中等概率抽取，允许重复主属性。", "",
  "## 二十四底材", "", "| 名称 | 部位 | 主属性 | 重量 | 底材耐久 |", "| --- | --- | --- | --- | --- |");
for (const x of BASES) lines.push(`| ${x.name} | ${["", "武器", "防具", "饰品"][x.slot]} | ${names[x.main]} | ${x.weight} | ${x.durability} |`);
lines.push("", "耐久上限再加品质固定值：0、4、8、12、16、20。器型不附送隐藏被动、攻速或额外行动。", "",
  "## 二十四随机特性", "", "P为收益参数、N为次数/门槛参数。每个部位八条，池内等概率；每件只抽一条。", "",
  "| 部位 | 特性 | 效果 | 普通P/N | 优秀P/N | 精良P/N | 稀有P/N | 史诗P/N | 传说P/N |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const x of TRAITS) lines.push(`| ${["", "武器", "防具", "饰品"][x.slot]} | ${x.name} | ${x.text} | ${QUALITY_NAMES.map((_, i) => `${range(x.p[i])}${x.n ? ` / ${range(x.n[i])}` : ""}`).join(" | ")} |`);
lines.push("", "百分比类P使用整数百分数；门槛/收益分别随机。收益高优先，同收益门槛低优先；完全相同按物品实例顺序。实际有重复才标注未生效词条。", "",
  "## 技能费用与倍率", "", "A=物理攻击、S=精神力、H=生命上限；系数1为100%。效果细节见[技能正文](../功法设计/自由技能设计_搜打撤标准.md)。",
  "", "| 技能 | 类型 | 耗蓝 | 冷却 | 每战次数（0无限） | 参数 |", "| --- | --- | --- | --- | --- | --- |");
for (const x of SKILLS) lines.push(`| ${x.name} | ${["", "物理", "魔法", "混合", "辅助"][x.kind]} | ${x.mp} | ${x.cd} | ${x.uses} | ${Object.entries(x.effect).map(([k, v]) => `${k}=${v}`).join("；")} |`);
lines.push("", "冷却N表示跳过之后N次自身出招机会。伏雷布置属于辅助，爆炸为魔法；血偿/火息/雷回流按其直接伤害类型处理。", "",
  "## 十五种敌人", "", "| 敌人 | 档次 | 血 | 蓝 | 攻击 | 精神 | 护甲 | 速度 | 行动循环 |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const x of ENEMIES) lines.push(`| ${x.name} | ${["", "普通", "精英", "首领"][x.tier]} | ${x.hp} | ${x.mp} | ${x.a} | ${x.s} | ${x.armor} | ${x.speed} | ${x.pattern.join(" → ")} |`);
lines.push("", "敌方行为码及倍率、资源预算的中文解释见[开发基线](开发基线.md)。以上已经是最终面板，禁止再次叠乘旧品级倍率。",
  "", "## 六种战斗药品", "", "各占一格，每格一份；体力药与修理品不进入药匣。", "",
  "| 药品 | 回血 | 回蓝 | 护盾 |", "| --- | --- | --- | --- |");
for (const x of POTIONS) lines.push(`| ${x.name} | ${x.hp} | ${x.mp} | ${x.shield} |`);
lines.push("", "药引仅提高血蓝恢复，不提高护盾药。双回药有任一资源缺口即可使用，两项分别截断；护盾药仍受总盾上限，战后清除。", "");
writeFileSync(new URL("开发参数表.md", import.meta.url), lines.join("\n"), "utf8");
console.log(JSON.stringify({ version: VERSION, bases: BASES.length, traits: TRAITS.length, activeSkills: SKILLS.length - 2, enemies: ENEMIES.length }));
