const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const directory = path.join(root, "art/reference/cultivation");
const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8").replace(/^\uFEFF/, ""));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const inside = (base, relative) => {
    assert.equal(typeof relative, "string");
    assert.ok(!path.isAbsolute(relative), `Absolute relative path: ${relative}`);
    const resolved = path.resolve(base, relative);
    assert.ok(resolved.startsWith(base + path.sep), `Path escapes base: ${relative}`);
    return resolved;
};

assert.equal(manifest.version, 1);
assert.equal(manifest.status, "reference-only-not-runtime");
assert.ok(manifest.assets.length > 0);
const files = new Set(), sources = new Set();
const categories = ["controls", "items", "panels", "grids", "frames", "maps"];
for (const asset of manifest.assets) {
    assert.match(asset.file, /^(controls|items|panels|grids|frames|maps)\/[a-z0-9-]+\.png$/);
    assert.match(asset.source, /^sprites\/[^/]+\.png$/);
    assert.ok(!files.has(asset.file), `Duplicate destination: ${asset.file}`);
    assert.ok(!sources.has(asset.source), `Duplicate source: ${asset.source}`);
    files.add(asset.file);
    sources.add(asset.source);
    const file = inside(directory, asset.file), bytes = fs.readFileSync(file);
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `Not PNG: ${asset.file}`);
    assert.equal(bytes.readUInt32BE(16), asset.width);
    assert.equal(bytes.readUInt32BE(20), asset.height);
    assert.equal(hash(file), asset.sha256, `Reference changed: ${asset.file}`);
    assert.equal(asset.status, "reference-only");
    if (process.argv.includes("--source")) {
        assert.equal(hash(inside(manifest.sourceRoot, asset.source)), asset.sha256,
            `Source changed: ${asset.source}`);
    }
}
for (const reference of manifest.uiReferences) {
    assert.match(reference.file, /^document\/UI参考\/[a-f0-9]{32}\.jpg$/);
    assert.equal(hash(inside(root, reference.file)), reference.sha256, `UI reference changed: ${reference.file}`);
}
for (const category of categories) {
    for (const file of fs.readdirSync(path.join(directory, category))) {
        assert.ok(files.has(`${category}/${file}`), `Unregistered reference: ${category}/${file}`);
    }
}
console.log(`PASS: ${files.size} reference PNGs, dimensions/hashes and ${manifest.uiReferences.length} UI references${process.argv.includes("--source") ? ", external source hashes" : ""}.`);
const runtimeManifest=path.join(root,"assets/ui/atlas/module/inventory/sources.json");
if(fs.existsSync(runtimeManifest)){
    const runtime=JSON.parse(fs.readFileSync(runtimeManifest,"utf8")),seen=new Set();
    for(const asset of runtime.assets){
        assert.match(asset.file,/^ui\/(atlas\/module\/inventory|texture\/inventory)\/[a-z0-9-]+\.png$/);
        assert.ok(!seen.has(asset.file),`Duplicate runtime asset: ${asset.file}`);seen.add(asset.file);
        const file=inside(path.join(root,"assets"),asset.file);
        assert.equal(hash(file),asset.sha256,`Runtime asset changed: ${asset.file}`);
        assert.ok(fs.existsSync(file+".meta"),`Missing metadata: ${asset.file}`);
        if(process.argv.includes("--source"))assert.equal(hash(asset.source),asset.sha256);
    }
    console.log(`PASS: ${seen.size} runtime PNGs, unchanged source hashes and metadata.`);
}
