import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// 独立核验已保存结果，不运行战斗或改变任何数据。
const read = name => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
const sha = text => createHash("sha256").update(text).digest("hex");
const data = JSON.parse(read("./results.json"));
const baseline = JSON.parse(read("./baseline.json"));
const close = (actual, expected) => {
  if (expected == null) assert.equal(actual, null);
  else assert(Math.abs(actual - expected) < 1e-7, `${actual} 与 ${expected} 不一致`);
};
const average = (rows, field) => rows.length ? rows.reduce((n, row) => n + row[field], 0) / rows.length : null;
const actions = rows => {
  const counts = {};
  for (const row of rows) for (const [code, n] of Object.entries(row.actionCounts)) counts[code] = (counts[code] ?? 0) + n;
  return counts;
};
const compareCounts = (actual, expected) => {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
  for (const key of Object.keys(expected)) assert.equal(actual[key], expected[key]);
};
function auditSummary(group) {
  const runs = group.runs;
  const stats = group.summary;
  const wins = runs.filter(row => row.won);
  assert.equal(stats.n, runs.length);
  assert.equal(stats.wins, wins.length);
  assert.equal(stats.timeouts, runs.filter(row => row.timeout).length);
  close(stats.winRate, wins.length / runs.length);
  for (const [output, source] of [["winRounds", "rounds"], ["winHp", "hp"], ["winMp", "mp"]]) close(stats[output], average(wins, source));
  for (const field of ["rounds", "hp", "mp", "healing", "paidHp", "dotDamage"]) close(stats[field], average(runs, field));
  for (const [output, source] of [["spent", "mpSpent"], ["recovered", "mpRecovered"], ["absorbed", "absorbed"]]) close(stats[output], average(runs, source));
  compareCounts(stats.actions, actions(runs));
  const converted = {};
  for (const row of runs) for (const [key, n] of Object.entries(row.conversions)) converted[key] = (converted[key] ?? 0) + n;
  compareCounts(stats.conversions, converted);
  for (const run of runs) {
    assert.equal(Number(run.won) + Number(run.lost), 1);
    assert.equal(run.timeout, false);
    assert(run.rounds >= 1 && run.rounds <= 45);
    assert(run.hp >= 0 && run.hp <= 260);
    assert(run.mp >= 0 && run.mp <= 48);
  }
}

assert.equal(data.engineSha256, sha(read("./simulate.mjs")));
assert.equal(data.optimization.baselineSha256, sha(read("./baseline.json")));
assert.equal(data.optimization.baselineEngineSha256, baseline.engineSha256);
for (const key of ["seeds", "builds", "scenarios", "campaignScenarios"]) assert.deepEqual(data[key], baseline[key]);
assert.equal(data.seeds.length, 12);
assert.equal(data.singles.length, 96);
assert.equal(new Set(data.singles.map(row => `${row.build}/${row.scenario}/${row.equal}`)).size, 96);
for (const group of data.singles) {
  auditSummary(group);
  assert.deepEqual(group.runs.map(row => row.seed), data.seeds);
}
for (const group of [...data.variants, ...data.resourceTrials]) {
  auditSummary(group);
  const build = data.builds.find(row => row.name === group.build);
  assert.equal(group.skills.length, 7);
  assert.deepEqual(group.skills, build.skills.map(code => code === group.out ? group.into : code));
  assert.equal(group.runs.length, 32);
}
let chainFights = 0;
let suppliedFights = 0;
for (const [list, supplied] of [[data.campaigns, false], [data.resuppliedCampaigns, true]]) {
  for (const group of list) {
    assert.equal(group.n, group.runs.length);
    assert.equal(group.cleared, group.runs.filter(row => row.cleared).length);
    close(group.avgWins, average(group.runs, "wins"));
    for (const run of group.runs) {
      if (supplied) suppliedFights += run.fights.length;
      else chainFights += run.fights.length;
      assert.equal(run.wins, run.fights.filter(row => row.won).length);
      assert.equal(run.cleared, run.fights.length === 5 && run.fights.every(row => row.won));
      assert(run.fights.slice(0, -1).every(row => row.won));
      assert.deepEqual(run.fights.map(row => row.scenario), data.campaignScenarios.slice(0, run.fights.length).map(row => row.name));
      assert(run.fights.every(row => !row.timeout && Number(row.won) + Number(row.lost) === 1));
    }
  }
}
for (const pair of data.optimization.pairs) {
  const old = baseline.singles.filter(row => !row.equal && row.build === pair.build);
  const current = data.singles.filter(row => !row.equal && row.build === pair.build);
  const joined = current.flatMap(row => row.runs.map(run => ({
    old: old.find(group => group.scenario === row.scenario).runs.find(result => result.seed === run.seed),
    current: run,
  })));
  const common = joined.filter(row => row.old.won && row.current.won);
  assert.equal(pair.oldWins, joined.filter(row => row.old.won).length);
  assert.equal(pair.newWins, joined.filter(row => row.current.won).length);
  assert.equal(pair.commonWins, common.length);
  assert.equal(pair.gained, joined.filter(row => !row.old.won && row.current.won).length);
  assert.equal(pair.regressed, joined.filter(row => row.old.won && !row.current.won).length);
  close(pair.oldRounds, average(common.map(row => row.old), "rounds"));
  close(pair.newRounds, average(common.map(row => row.current), "rounds"));
  close(pair.oldHp, average(common.map(row => row.old), "hp"));
  close(pair.newHp, average(common.map(row => row.current), "hp"));
}
const traceText = read("./逐回合战报.md");
for (const trace of data.traces) {
  const reference = data.singles.find(row => !row.equal && row.build === trace.build && row.scenario === trace.scenario).runs.find(run => run.seed === trace.result.seed);
  const { history: ignored, ...result } = trace.result;
  const { history: originalIgnored, ...original } = reference;
  assert.deepEqual(result, original);
  assert(trace.result.history.length > 0);
  assert(traceText.includes(trace.result.history.join("\n")));
}
const counts = {
  singles: data.singles.reduce((n, row) => n + row.runs.length, 0),
  campaignFights: chainFights,
  resuppliedFights: suppliedFights,
  sensitivity: data.sensitivity.reduce((n, row) => n + row.summary.n, 0),
  ablations: data.ablations.reduce((n, row) => n + row.full.n + row.withoutConversions.n, 0),
  traces: data.traces.length,
  variants: data.variants.reduce((n, row) => n + row.runs.length, 0),
  resourceTrials: data.resourceTrials.reduce((n, row) => n + row.runs.length, 0),
};
for (const row of data.sensitivity) assert.equal(row.summary.timeouts, 0);
for (const row of data.ablations) {
  assert.equal(row.full.timeouts, 0);
  assert.equal(row.withoutConversions.timeouts, 0);
}
counts.total = Object.values(counts).reduce((n, count) => n + count, 0);
assert.deepEqual(data.counts, counts);
const report = read("./对比报告.md");
assert(report.includes(`共${counts.total}局`));
assert(report.includes(`检查${data.checks}项通过`));
for (const file of ["./README.md", "./对比报告.md", "./优化复测.md", "./逐回合战报.md"]) {
  for (const match of read(file).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const path = match[1].split("#")[0];
    if (path && !path.includes("://")) assert(existsSync(fileURLToPath(new URL(path, new URL(file, import.meta.url)))), `链接失效：${path}`);
  }
}
console.log(JSON.stringify({ verified: true, checks: data.checks, counts, pairedBuilds: data.optimization.pairs.length, matchingTraces: data.traces.length }));
