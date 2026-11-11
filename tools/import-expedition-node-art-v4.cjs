const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const pack = path.join(root, "output/imagegen/expedition-node-icons-v4");
const target = path.join(root, "assets/ui/image/expeditionNodes");
const reportFile = path.join(pack, "integration-report.json");
const extraction = JSON.parse(fs.readFileSync(path.join(pack, "extraction-report.json"), "utf8"));
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const relative = file => path.relative(root, file).replaceAll("\\", "/");
const active = new Set(["start", "transit", "enemy-normal", "enemy-elite", "enemy-boss",
    "supply", "search", "borrow", "insight", "recovery", "extract", "battle-loot", "base"]);

async function validate(bytes) {
    const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height, info.channels], [128, 128, 4]);
    let partial = 0, subject = 0;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        const i = (y*128+x)*4, a = data[i+3];
        if (!x || !y || x === 127 || y === 127) assert.equal(a, 0, "Transparent border");
        if (!a) assert.equal(data[i]+data[i+1]+data[i+2], 0, "Clean transparent RGB");
        if (a > 0 && a < 255) partial++;
        if (a > 200) subject++;
    }
    assert.ok(partial > 300 && subject > 300, "Original partial alpha and visible subject");
}

async function check() {
    const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
    assert.equal(report.source_sha256, extraction.source_sha256);
    assert.equal(report.files.length, 19);
    const uuids = new Set();
    for (const entry of report.files) {
        const bytes = fs.readFileSync(path.join(root, entry.file));
        assert.equal(hash(bytes), entry.sha256, entry.file);
        assert.equal(hash(fs.readFileSync(path.join(pack, "png128", path.basename(entry.file)))), entry.sha256);
        const metaBytes = fs.readFileSync(path.join(root, `${entry.file}.meta`));
        assert.equal(hash(metaBytes), entry.meta_sha256, "Existing metadata unchanged");
        const meta = JSON.parse(metaBytes);
        assert.equal(meta.uuid, entry.uuid);
        assert.ok(!uuids.has(meta.uuid), "Unique resource UUID");
        uuids.add(meta.uuid);
        assert.deepEqual([meta.importer.textureType, meta.importer.sRGB, meta.importer.premultiplyAlpha],
            [2, true, true]);
        await validate(bytes);
    }
    console.log("PASS node art v4: 19 exact 128px RGBA copies, original alpha, unchanged UUIDs and metadata.");
}

async function main() {
    if (process.argv.includes("--check")) return check();
    assert.ok(process.argv.includes("--write"), "Use --write to import or --check to validate.");
    const previous = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, "utf8")) : null;
    const files = [];
    // Validate the full pack before replacing any existing asset.
    for (const entry of extraction.files) {
        assert.equal(path.basename(entry.file), entry.file);
        const bytes = fs.readFileSync(path.join(pack, "png128", entry.file));
        assert.equal(hash(bytes), entry.sha256, "Approved cutout unchanged");
        await validate(bytes);
        const file = path.join(target, entry.file);
        const before = fs.readFileSync(file);
        const metaBytes = fs.readFileSync(`${file}.meta`);
        const meta = JSON.parse(metaBytes);
        const old = previous?.files.find(record => record.file === relative(file));
        files.push({ key: entry.key, file: relative(file), sha256: hash(bytes),
            previous_sha256: old?.previous_sha256 || hash(before),
            uuid: meta.uuid, meta_sha256: hash(metaBytes), runtime_used: active.has(entry.key) });
    }
    assert.equal(files.length, 19);
    for (const entry of files)
        fs.copyFileSync(path.join(pack, "png128", path.basename(entry.file)), path.join(root, entry.file));
    fs.writeFileSync(reportFile, JSON.stringify({
        source_sha256: extraction.source_sha256, size: [128, 128], count: 19,
        method: "Direct copy of approved V4 true-alpha cutouts. No recropping or alpha normalization.",
        metadata_changed: false, config_changed: false, saves_changed: false,
        library_only: files.filter(entry => !entry.runtime_used).map(entry => entry.key), files,
    }, null, 2) + "\n");
    await check();
}

main().catch(error => { console.error(error); process.exitCode = 1; });
