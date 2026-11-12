const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const build = path.resolve(process.argv[2] || path.join(root, "bin/gameplay-tests"));
const modules = path.join(root, "src/script/module");
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const source = file => fs.readFileSync(path.join(modules, file), "utf8");
const load = file => require(path.join(build, "script/module", file));
let count = 0;
function test(name, fn) {
    fn();
    count++;
    console.log("PASS modules " + name);
}
test("all feature scripts have unique persistent metadata and no old newRules imports", () => {
    const uuids = new Set();
    for (const file of walk(modules).filter(file => file.endsWith(".ts"))) {
        const uuid = JSON.parse(fs.readFileSync(file + ".meta", "utf8")).uuid;
        assert.ok(uuid && !uuids.has(uuid), file);
        uuids.add(uuid);
        assert.doesNotMatch(fs.readFileSync(file, "utf8"), /(?:from\s+|import\()["'][^"']*newRules\//);
    }
});
test("feature managers own data, without importing UI or browser lifecycle", () => {
    for (const [feature, manager, data] of [
        ["skillBattle", "BattleTrialManager", "BattleTrialData"], ["build", "BuildManager", "BuildData"],
        ["inventory", "InventoryManager", "InventoryData"], ["expedition", "ExpeditionRunManager", "ExpeditionRunData"],
    ]) {
        const text = source(`${feature}/manager/${manager}.ts`);
        assert.match(text, new RegExp(`private readonly data = new ${data}\\(\\)`));
        assert.doesNotMatch(text, /from ["'][^"']*\/(?:view|ctrl)\//);
        assert.doesNotMatch(text, /\b(?:Laya|window|document)\./);
        assert.doesNotMatch(text, /from ["'][^"']*manager\/BattleTrialManager/);
    }
    const text = source("gameplay/manager/GameplayManager.ts");
    assert.doesNotMatch(text, /from ["'][^"']*\/view\//);
    assert.doesNotMatch(text, /ExpeditionLocalStorage|getExpedition\(/);
});
test("data objects are per-manager state, not new singleton saves", () => {
    for (const [file, name] of [
        ["skillBattle/data/BattleTrialData", "BattleTrialData"], ["build/data/BuildData", "BuildData"],
        ["inventory/data/InventoryData", "InventoryData"], ["expedition/data/ExpeditionRunData", "ExpeditionRunData"],
    ]) {
        const Data = load(file)[name], a = new Data(), b = new Data();
        a.savedText = "pending";
        a.writing = true;
        a.error = "disk";
        assert.equal(b.save, null);
        assert.equal(b.savedText, null);
        assert.equal(b.writing, false);
        assert.equal(b.error, "");
    }
});
test("foreground helper preserves pause, deadline retry and terminal notification", () => {
    const timer = [], windowEvents = new Map(), documentEvents = new Map();
    global.Laya = { timer: { loop: (...args) => timer.push(args) } };
    global.window = { addEventListener: (name, fn) => windowEvents.set(name, fn) };
    global.document = { hidden: false, addEventListener: (name, fn) => documentEvents.set(name, fn) };
    const { GameplayLifecycleHelper: Helper } = load("gameplay/utils/GameplayLifecycleHelper");
    let pauses = 0, checks = 0, expired = 0, timeout = false, fail = false;
    const run = { error: "", pauseSearch: () => pauses++, expire: () => {
        checks++;
        if (fail) throw Error("disk");
        const result = timeout;
        timeout = false;
        return result;
    } };
    Helper.watch({}, run, () => expired++);
    assert.equal(checks, 1);
    assert.equal(timer.length, 1);
    assert.equal(timer[0][0], 250);
    windowEvents.get("blur")();
    windowEvents.get("pagehide")();
    assert.equal(pauses, 2);
    document.hidden = true;
    documentEvents.get("visibilitychange")();
    assert.equal(pauses, 3);
    timeout = true;
    fail = true;
    const warn = console.warn;
    console.warn = () => {};
    try { timer[0][2](); } finally { console.warn = warn; }
    assert.equal(expired, 0);
    fail = false;
    windowEvents.get("focus")();
    assert.equal(expired, 1);
    timer[0][2]();
    assert.equal(expired, 1);
    run.error = "corrupt";
    const before = checks;
    timer[0][2]();
    assert.equal(checks, before);
});
console.log(`${count} feature module tests passed.`);
