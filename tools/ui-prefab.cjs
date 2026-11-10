const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const assets = path.join(root, "assets");
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);

function createPrefabResolver() {
    const uuids = new Map(), cache = new Map();
    for (const file of walk(path.join(assets, "ui")).filter(file => file.endsWith(".lh.meta"))) {
        const meta = JSON.parse(fs.readFileSync(file, "utf8"));
        uuids.set(meta.uuid, path.relative(assets, file.slice(0, -5)).replaceAll("\\", "/"));
    }
    function prefabPath(reference) {
        const key = reference.replace(/^res:\/\//, "");
        const file = uuids.get(key) || key;
        assert.ok(file.startsWith("ui/") && file.endsWith(".lh"), `Invalid prefab reference: ${reference}`);
        assert.ok(fs.existsSync(path.join(assets, file)), `Missing prefab: ${file}`);
        return file;
    }
    function read(file) {
        if (!cache.has(file)) cache.set(file, JSON.parse(fs.readFileSync(path.join(assets, file), "utf8")));
        return cache.get(file);
    }
    function expand(file, chain = []) {
        assert.ok(!chain.includes(file), `Cyclic prefab dependency: ${[...chain, file].join(" -> ")}`);
        const stack = [...chain, file];
        function value(v, scope) {
            if (Array.isArray(v)) return v.map(item => value(item, scope));
            if (!v || typeof v !== "object") return v;
            if (v._$ref) return { ...v, _$ref: [...scope, ...[v._$ref].flat()].join("/") };
            return Object.fromEntries(Object.entries(v).map(([key, item]) => [key, value(item, scope)]));
        }
        function node(raw, scope) {
            const id = [...scope, raw._$id].join("/");
            if (!raw._$prefab) {
                const result = value(Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "_$child")), scope);
                result._$id = id;
                if (raw._$child) result._$child = raw._$child.map(child => node(child, scope));
                return result;
            }
            const source = expand(prefabPath(raw._$prefab), stack);
            const prefix = [...scope, raw._$id];
            const localIds = new Map();
            function scopeNode(n, isRoot) {
                const localId = n._$id;
                const scoped = [...prefix, localId].join("/");
                localIds.set(scoped, n);
                n._$id = isRoot ? id : scoped;
                for (const child of n._$child || []) scopeNode(child, false);
            }
            scopeNode(source, true);
            for (const [key, v] of Object.entries(raw)) {
                if (!key.startsWith("_$")) source[key] = structuredClone(v);
            }
            for (const override of raw._$child || []) {
                assert.ok(override._$override, `Only native property overrides are supported here: ${file}`);
                const target = localIds.get([...prefix, ...[override._$override].flat()].join("/"));
                assert.ok(target, `Unresolved override ${JSON.stringify(override._$override)} in ${file}`);
                for (const [key, v] of Object.entries(override)) {
                    assert.ok(key === "_$override" || !key.startsWith("_$"), `Unsupported structural override: ${key}`);
                    if (key !== "_$override") target[key] = structuredClone(v);
                }
            }
            return source;
        }
        return node(read(file), []);
    }
    return { uuids, prefabPath, read, expand };
}

module.exports = { root, assets, walk, createPrefabResolver };
