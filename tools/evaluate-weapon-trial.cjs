const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const {load, root} = require("./config-fixture.cjs");
const {QingmingRules: R} = load("module/skillBattle/utils/QingmingRules.js");
const {QingmingConfig: C} = load("module/skillBattle/utils/QingmingConfig.js");
const {WeaponTrialConfig: T} = load("module/manualTest/utils/WeaponTrialConfig.js");
const {WeaponTrialRules: W} = load("module/skillBattle/utils/WeaponTrialRules.js");
const out = path.join(root, "bin/weapon-trial"), seedCount = Number(process.env.WEAPON_SEEDS || 4);
fs.mkdirSync(out, {recursive: true});
const policies = ["burst", "balanced"], rows = [];
function choose(s, policy) {
    const slim = {...s, logs: [], reports: [], rewards: []};
    const scale = s.setup.player.attack / 100;
    const candidates = ["basic", "guard", "edge", "wind", "fall", "end"].map(move => ({move}));
    for (let enemyAction = 1; enemyAction <= 3; enemyAction++) candidates.push({move: "guide", enemyAction});
    let best = null, bestScore = -Infinity;
    for (const action of candidates) {
        const r = R.resolve(slim, action); if (!r.ok) continue;
        const n = r.state, ended = n.round > s.round || n.phase !== "fighting";
        const gain = n.totals.damage - s.totals.damage;
        const hpLoss = s.player.hp - n.player.hp, mpLoss = s.player.mp - n.player.mp;
        const extra = ((n.flying - s.flying) * 40 + (n.wounds - s.wounds) * 18 +
            (n.momentum - s.momentum) * 22 + (n.forms.length - s.forms.length) * 20) * scale;
        const shield = ended ? 0 : Math.min(n.player.shield - s.player.shield, s.enemy.attack * 2);
        const suppression = (n.suppression.reduce((a, b) => a + b, 0) - s.suppression.reduce((a, b) => a + b, 0)) / 100;
        const score = gain - hpLoss * (policy === "balanced" ? 2 : .5) -
            mpLoss * scale * (policy === "balanced" ? 2 : .25) + extra +
            shield * (policy === "balanced" ? .9 : .1) + suppression * s.enemy.attack * (policy === "balanced" ? .8 : .1) +
            (n.pendingSword - s.pendingSword) * .7 -
            (action.move === "end" ? s.ap * s.player.attack * .4 : 0) +
            (["complete", "between", "reward"].includes(n.phase) ? 10000 : 0) - (n.phase === "defeat" ? 100000 : 0);
        if (score > bestScore) { best = action; bestScore = score; }
    }
    assert.ok(best, "存在合法行动"); return best;
}
function run(profile, seed, policy, arm, label = "") {
    const setup = C.defaults(); T.apply(setup, profile);
    setup.seed = seed; if (arm) setup.weaponTrial = arm;
    let s = R.start(setup), steps = 0;
    const initial = {...s.player}, lineup = s.enemyPlan.slice();
    for (; steps < 1500 && ["fighting", "reward", "between"].includes(s.phase); steps++) {
        let action;
        if (s.phase === "reward") {
            // 按固定顺序选奖；独立装备随机不改变候选，同种子配对不根据装备偏向选奖。
            const priority = ["swordcraft", "flyingEdge", "swordUnity", "wound", "breathing", "riposte", "delayedFall", "storedEdge", "tempo"];
            const choice = priority.find(k => s.offers.includes(k)) || s.offers[0];
            action = {move: "choose", choice};
        } else if (!s.potionUsed && s.potions.heal && s.player.hp <= s.player.maxHp * .65) action = {move: "heal"};
        else if (!s.potionUsed && s.potions.mana && s.player.mp <= s.player.maxMp * .5) action = {move: "mana"};
        else if (s.phase === "between") action = {move: "next"};
        else action = choose(s, policy);
        const result = R.resolve(s, action); assert.ok(result.ok, result.reason); s = result.state;
    }
    assert.notEqual(steps, 1500, "行动上限内结束");
    const r = {profile: T.presets[profile].name, seed, policy, arm: label || (arm ? `${arm.base}/${arm.quality}` : "none"),
        phase: s.phase, completed: s.reports.filter(r => r.won).length, initial,
        hp: s.player.hp, mp: s.player.mp, durability: s.weapon?.durability ?? null, roll: s.weapon?.roll,
        totals: s.totals, lineup, rewards: s.rewards.map(r => r.choice),
        reports: s.reports.map(r => ({tier: r.tier, rounds: r.rounds, won: r.won, events: r.events,
            damage: r.damage, taken: r.taken, endHp: r.endHp, endMp: r.endMp}))};
    rows.push(r); return r;
}
for (let profile = 0; profile < T.presets.length; profile++) {
    for (let i = 0; i < seedCount; i++) for (const policy of policies) {
        const seed = 17 + i * 101, naked = run(profile, seed, policy, null);
        for (let base = 1; base <= 12; base++) for (let quality = 1; quality <= 6; quality++) {
            const row = run(profile, seed, policy, {base, quality});
            assert.deepEqual(row.lineup, naked.lineup);
            const common = Math.min(row.rewards.length, naked.rewards.length);
            assert.deepEqual(row.rewards.slice(0, common), naked.rewards.slice(0, common),
                "生存更久时仅追加奖励，已取得部分保持同输入");
        }
        for (const passive of Object.keys(W.names)) for (const quality of [1, 3, 6])
            run(profile, seed, policy, {base: 1, quality, passive}, `${passive}/${quality}`);
    }
    console.log(`完成 ${T.presets[profile].name}：${rows.length} 局`);
}
function summarize(selected) {
    const reports = selected.flatMap(r => r.reports), mean = values => values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : 0;
    return {runs: selected.length, wins: selected.filter(r => r.phase === "complete").length,
        winRate: mean(selected.map(r => r.phase === "complete" ? 100 : 0)),
        battles: reports.length, avgCompleted: mean(selected.map(r => r.completed)),
        avgRounds: Object.fromEntries(["普通", "精英", "首领"].map(t => [t, mean(reports.filter(r => r.tier === t).map(r => r.rounds))])),
        firstTurnWins: reports.filter(r => r.won && r.rounds === 1).length,
        ordinaryFirstTurnRate: mean(reports.filter(r => r.tier === "普通").map(r => r.won && r.rounds === 1 ? 100 : 0)),
        avgTaken: mean(selected.map(r => r.totals.taken)), avgManaSpent: mean(selected.map(r => r.totals.mpSpent)),
        avgWeaponDamage: mean(selected.map(r => r.totals.events.weaponDamage || 0)),
        avgWeaponHeal: mean(selected.map(r => r.totals.events.weaponHeal || 0)),
        avgWeaponMana: mean(selected.map(r => r.totals.events.weaponMana || 0)),
        brokenRuns: selected.filter(r => r.durability === 0).length};
}
const summary = {};
for (const {name} of T.presets) {
    const profile = rows.filter(r => r.profile === name);
    summary[name] = {naked: summarize(profile.filter(r => r.arm === "none")), qualities: {}, passives: {}};
    for (let q = 1; q <= 6; q++) summary[name].qualities[q] = summarize(profile.filter(r => /^\d+\/\d+$/.test(r.arm) && r.roll.quality === q));
    for (const code of Object.keys(W.names)) summary[name].passives[code] = summarize(profile.filter(r => r.arm.startsWith(code + "/")));
}
fs.writeFileSync(path.join(out, "results.json"), JSON.stringify({seedCount, policies, rows, summary}, null, 2));
console.log(JSON.stringify(summary, null, 2));
