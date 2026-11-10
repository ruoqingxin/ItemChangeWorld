"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const text = fs.readFileSync(path.join(__dirname, "..", "阶段4_正式地图与敌人掉落确认包.md"), "utf8");
const lines = text.split(/\r?\n/);
const cells = line => line.trim().slice(1, -1).split("|").map(value => value.trim());
const battleKinds = new Set(["normal", "elite", "boss"]);
let checks = 0;
function check(condition, message) {
    assert.ok(condition, message);
    checks++;
}
function table(headers) {
    const index = lines.findIndex(line => line.startsWith("|") &&
        JSON.stringify(cells(line)) === JSON.stringify(headers));
    assert.ok(index >= 0, `Missing table: ${headers.join(",")}`);
    assert.match(lines[index + 1], /^\|(?:\s*:?-+:?\s*\|)+$/);
    const rows = [];
    for (let i = index + 2; i < lines.length && lines[i].startsWith("|"); i++) {
        const values = cells(lines[i]);
        assert.equal(values.length, headers.length, `Column count at line ${i + 1}`);
        rows.push(Object.fromEntries(headers.map((header, j) => [header, values[j]])));
    }
    assert.ok(rows.length > 0);
    return rows;
}
function numeric(value) {
    assert.match(value, /^\d+$/);
    return Number(value);
}
function probabilityRows(rows, columns) {
    for (const row of rows) {
        const weights = columns.map(column => numeric(row[column]));
        check(weights.every(weight => weight >= 0 && weight <= 100), "Invalid weight");
        check(weights.reduce((sum, weight) => sum + weight, 0) === 100, "Weights must sum to 100");
    }
}

check(text.includes("整包获准作为可调整测试起点实施"), "Approval boundary must remain explicit");
const main = table(["ID", "类型", "功能名", "战斗键", "next"]);
const extra = table(["ID", "类型", "功能名", "战斗键"]);
const branches = table(["支路", "from", "path", "to"]);
const nodes = new Map();
const graph = new Map();
for (const row of [...main, ...extra]) {
    check(!nodes.has(row.ID), `Duplicate node ${row.ID}`);
    nodes.set(row.ID, row);
    graph.set(row.ID, new Set());
}
function edge(a, b) {
    assert.ok(nodes.has(a) && nodes.has(b), `Unknown edge ${a}-${b}`);
    assert.notEqual(a, b);
    assert.ok(!graph.get(a).has(b), `Duplicate edge ${a}-${b}`);
    graph.get(a).add(b);
    graph.get(b).add(a);
}
check(main.length === 16, "Expected 16 main nodes");
main.forEach((row, index) => {
    check(row.ID === `H${String(index).padStart(2, "0")}`, "Main nodes must be ordered");
    check(row.next === (main[index + 1]?.ID ?? "-"), "Broken main sequence");
    if (row.next !== "-") edge(row.ID, row.next);
});
const branchMembers = new Set();
for (const row of branches) {
    check(main.some(node => node.ID === row.from) && main.some(node => node.ID === row.to),
        "Branch endpoints must be main nodes");
    const route = [row.from, ...row.path.split(","), row.to];
    check(main.find(node => node.ID === row.from).next === row.to, "Branch skips a main node");
    for (const id of route.slice(1, -1)) {
        check(extra.some(node => node.ID === id) && !branchMembers.has(id), "Invalid branch member");
        branchMembers.add(id);
    }
    for (let i = 1; i < route.length; i++) edge(route[i - 1], route[i]);
}
check(branchMembers.size === extra.length, "Unconnected extra node");
const crossLinks=table(["补充连接","from","to"]);
for(const row of crossLinks) edge(row.from,row.to);
check(crossLinks.length===7,"Seven additional branch links");
check([...graph.values()].reduce((n,neighbors)=>n+neighbors.size,0)/2===37,"37 fixed edges");
const count = (rows, kind) => rows.filter(row => row["类型"] === kind).length;
check(count(main, "normal") === 6 && count(main, "elite") === 2 && count(main, "boss") === 1,
    "Main encounter count");
check(count([...nodes.values()], "normal") === 11 && count([...nodes.values()], "elite") === 3 &&
    count([...nodes.values()], "boss") === 1, "Full encounter count");
check(main.filter(row => row["类型"] === "borrow").map(row => row.ID).join(",") === "H03,H08,H13",
    "Three borrow stations must share the main route");
check(count([...nodes.values()], "insight") === 1 && count([...nodes.values()], "search") === 5,
    "Insight/search node count");
check(main.at(-2)["类型"] === "boss" && main.at(-1)["类型"] === "extract", "Boss/final exit ordering");
check([...graph.get("H15")].join(",") === "H14", "Final exit must only connect to boss");

function reachable(start, cleared) {
    const visited = new Set([start]);
    const pending = [start];
    for (let i = 0; i < pending.length; i++) {
        const id = pending[i];
        if (battleKinds.has(nodes.get(id)["类型"]) && !cleared.has(id)) continue;
        for (const next of graph.get(id)) {
            if (visited.has(next)) continue;
            visited.add(next);
            pending.push(next);
        }
    }
    return visited;
}
const eight = new Set(main.filter(row => ["normal", "elite"].includes(row["类型"])).map(row => row.ID));
check(eight.size === 8, "Common route must have eight battles");
check(reachable("H00", new Set(["H01"])).has("H02") &&
    !reachable("H00", new Set(["H01"])).has("H03"), "Unbeaten enemy must block transit");
check(reachable("H00", new Set(["H01", "H02"])).has("H03"), "Two-battle early exit route");
const eightReachable = reachable("H13", eight);
check(!eightReachable.has("H15"), "Eight-battle route must not bypass boss");
const allCleared = new Set([...nodes.values()].filter(row => battleKinds.has(row["类型"])).map(row => row.ID));
check(reachable("H00", allCleared).size === nodes.size, "Full graph connectivity");
check(reachable("W01", new Set(["H01", "H02", "H04", "H05", "B01", "B02"])).has("H07"),
    "Insight must leave a future encounter");
const exitRows = table(["总撤离数", "随机结果", "条件权重百分比"]);
const anchors = { XA: "H03", XB: "H08", XC: "H13" };
const selections = new Set();
for (const row of exitRows) {
    const exits = row["随机结果"].split("+");
    check(exits.length + 1 === numeric(row["总撤离数"]) && new Set(exits).size === exits.length,
        "Exit count or uniqueness");
    check(exits.every(id => anchors[id] && eightReachable.has(anchors[id])), "No non-boss return exit");
    check(!selections.has(row["随机结果"]), "Duplicate exit outcome");
    selections.add(row["随机结果"]);
}
for (const total of ["2", "3"]) {
    probabilityRows([{ weight: String(exitRows.filter(row => row["总撤离数"] === total)
        .reduce((sum, row) => sum + numeric(row["条件权重百分比"]), 0)) }], ["weight"]);
}
check([...selections].sort().join(",") === ["XA", "XB", "XC", "XA+XB", "XA+XC", "XB+XC"].sort().join(","),
    "Exit outcome coverage");

const enemies = table(["key", "类别", "功能名", "HP", "意图循环", "道韵"]);
const enemyKeys = new Set(enemies.map(row => row.key));
check(enemyKeys.size === 7 && enemies.length === 7, "Seven unique enemies required");
for (const row of enemies) {
    check(numeric(row.HP) > 0 && row["意图循环"].split(",").every(intent => /^(攻|盾|蓄)[1-9]\d*$/.test(intent)),
        "Enemy HP/intents invalid");
    check(numeric(row["道韵"]) === ({ normal: 10, elite: 20, boss: 30 })[row["类别"]],
        "Daoyun mismatch");
}
for (const node of nodes.values()) {
    check(battleKinds.has(node["类型"]) === enemyKeys.has(node["战斗键"]), "Unknown enemy key");
    if (battleKinds.has(node["类型"])) {
        check(enemies.find(row => row.key === node["战斗键"])["类别"] === node["类型"], "Enemy category mismatch");
    }
}
const earned = rows => rows.reduce((sum, row) =>
    sum + (enemies.find(enemy => enemy.key === row["战斗键"]) ? numeric(enemies.find(enemy =>
        enemy.key === row["战斗键"])["道韵"]) : 0), 0);
const eightRows = main.filter(row => eight.has(row.ID));
check(earned(eightRows) === 100 && earned([...nodes.values()]) === 200, "Daoyun budgets");
const passiveBudget = total => total < 30 ? [0, total] : [1 + Math.floor((total - 30) / 40), (total - 30) % 40];
check(JSON.stringify(passiveBudget(100)) === "[2,30]" &&
    JSON.stringify(passiveBudget(200)) === "[5,10]", "Passive thresholds");

const categories = ["血药", "蓝药", "修补", "灵草", "矿材", "小材料", "书籍", "容器", "武器"];
const pools = table(["pool", ...categories]);
probabilityRows(pools, categories);
const qualities = ["普通", "优秀", "精良", "稀有", "史诗", "传说"];
const containerPools = table(["pool", ...qualities]);
probabilityRows(containerPools, qualities);
check(pools.map(row => row.pool).sort().join(",") === "boss,elite,normal,risk,search" &&
    containerPools.map(row => row.pool).sort().join(",") === "boss,elite,normal,risk,search", "Pool coverage");
check(qualities.every(quality => containerPools.some(row => numeric(row[quality]) > 0)), "Unreachable container tier");
const books = table(["主题", "书籍目标名单", "每本占格", "推荐品质"]);
const bookNames = books.flatMap(row => row["书籍目标名单"].split("、"));
check(bookNames.length === 14 && new Set(bookNames).size === 14, "Fourteen unique books");
check(books.map(row => row["书籍目标名单"].split("、").length).join(",") === "6,6,2", "Book theme sizes");
const sources = table(["来源键", "来源", "件数分布", "类别池"]);
const means = new Map();
for (const row of sources) {
    check(row["类别池"] === "supply" || pools.some(pool => pool.pool === row["类别池"]), "Unknown source pool");
    if (row["类别池"] === "supply") {
        check(row["件数分布"].startsWith("固定3件"), "Supply size");
        means.set(row["来源键"], 3);
        continue;
    }
    const distribution = row["件数分布"].split("，").map(item => {
        const match = /^(\d+)件(\d+)%$/.exec(item);
        assert.ok(match, `Invalid count distribution ${item}`);
        return [Number(match[1]), Number(match[2])];
    });
    check(distribution.every(([size, weight]) => size > 0 && weight >= 0 && weight <= 100) &&
        distribution.reduce((sum, [, weight]) => sum + weight, 0) === 100, "Count weights");
    means.set(row["来源键"], distribution.reduce((sum, [size, weight]) => sum + size * weight / 100, 0));
}
check(sources.length === 8 && new Set(sources.map(row => row["来源键"])).size === 8, "Source coverage");
const expected = category => 6 * means.get("normal") * numeric(pools.find(row =>
    row.pool === "normal")[category]) / 100 + 2 * means.get("elite") * numeric(pools.find(row =>
    row.pool === "elite")[category]) / 100;
const nearly = (actual, expectedValue) => Math.abs(actual - expectedValue) < 1e-9;
check(nearly(6 * means.get("normal") + 2 * means.get("elite"), 12.6), "Main route loot mean");
check(nearly(expected("血药") + 1.5, 4.41) && nearly(expected("蓝药") + 1.35, 3.63) &&
    nearly(expected("修补") + 0.15, 1.02), "Supply budget arithmetic");
const bossSlot = numeric(pools.find(row => row.pool === "boss")["容器"]) / 100 *
    numeric(containerPools.find(row => row.pool === "boss")["传说"]) / 100;
const bossAtLeastOne = 0.5 * (1 - (1 - bossSlot) ** 3) + 0.5 * (1 - (1 - bossSlot) ** 4);
check(nearly(bossSlot, 0.0012) && Math.abs(bossAtLeastOne * 100 - 0.419) < 0.0005, "Conditional drop probability");
const acceptance = table(["编号", "计划验收，不是当前成绩"]);
check(acceptance.map(row => row["编号"]).join(",") === Array.from({ length: 18 }, (_, i) =>
    `D${String(i + 1).padStart(2, "0")}`).join(","), "D01-D18 coverage");

console.log(`PASS: ${checks} documentation assertions; ${nodes.size} fixed nodes, 15 encounters, 6 exit outcomes.`);
console.log("PASS: graph reachability, eight-battle return, boss gate, weights, books, loot and daoyun arithmetic.");
console.log("Proposal consistency only. No game code, exports, saves, gameplay tests or balance validation.");
