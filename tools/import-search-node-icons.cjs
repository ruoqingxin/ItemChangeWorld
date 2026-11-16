const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const root = path.resolve(__dirname, ".."), catalog = require("./migrations/2026-11-14-search-nodes.json");
const source = path.join(root, "assets/ui/texture/test/ps"), target = path.join(root, "assets/ui/image/expeditionNodes");
const write = process.argv.includes("--write");
for (const node of catalog.nodes) {
    const original = fs.readFileSync(path.join(source, node.source));
    assert.equal(original.readUInt32BE(16), 256); assert.equal(original.readUInt32BE(20), 256);
    for (const folder of [target, path.join(target, "clean")]) {
        const file = path.join(folder, `node-${node.icon}.png`), metaFile = file + ".meta";
        if (write) {
            const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : { uuid: crypto.randomUUID() };
            meta.importer = { ...meta.importer, textureType: 2, sRGB: true, premultiplyAlpha: true };
            fs.copyFileSync(path.join(source, node.source), file);
            fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + "\n");
        }
        assert.ok(fs.readFileSync(file).equals(original), `Original pixels preserved: ${file}`);
        const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
        assert.deepEqual([meta.importer.textureType, meta.importer.sRGB, meta.importer.premultiplyAlpha], [2, true, true]);
    }
    console.log(`${node.source} -> node-${node.icon}.png (${node.name})`);
}
