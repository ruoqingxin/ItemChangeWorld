const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const pack = path.join(root, "output/imagegen/expedition-node-icons-v2");
const target = path.join(root, "assets/ui/image/expeditionNodes");
const compact = path.join(pack, "runtime128");
const reportFile = path.join(pack, "integration-report.json");
const extraction = JSON.parse(fs.readFileSync(path.join(pack, "extraction-report.json"), "utf8"));
const relative = file => path.relative(root, file).replaceAll("\\", "/");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const active = new Set(["start", "transit", "enemy-normal", "enemy-elite", "enemy-boss",
    "supply", "search", "borrow", "insight", "recovery", "extract", "battle-loot", "base"]);
const bossBounds = extraction.files.find(entry => entry.key === "enemy-boss").source_subject_bounds;
const enemyReference = Math.max(bossBounds[2] - bossBounds[0], bossBounds[3] - bossBounds[1]);

function alphaBounds(data, width, height) {
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (!data[(y * width + x) * 4 + 3]) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    assert.ok(right >= left && bottom >= top, "Nonempty cutout");
    return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function recut(entry) {
    const source = fs.readFileSync(path.join(pack, "native", path.basename(entry.file)));
    const { data, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true });
    const crop = alphaBounds(data, info.width, info.height);
    // Keep the enemy family's face scale: filling each silhouette independently enlarges the normal mask too much.
    const longAxis = entry.key.startsWith("enemy-")
        ? Math.round(Math.max(crop.width, crop.height) * 116 / enemyReference) : 116;
    const resized = await sharp(source).extract(crop).resize(longAxis, longAxis, { fit: "inside" }).png().toBuffer();
    const size = await sharp(resized).metadata();
    const raw = await sharp({ create: { width: 128, height: 128, channels: 4, background: "#00000000" } })
        .composite([{ input: resized, left: Math.floor((128 - size.width) / 2),
            top: Math.floor((128 - size.height) / 2) }]).raw().toBuffer();
    for (let i = 0; i < raw.length; i += 4) if (!raw[i + 3]) raw.fill(0, i, i + 3);
    const bytes = await sharp(raw, { raw: { width: 128, height: 128, channels: 4 } }).png().toBuffer();
    return { bytes, source_sha256: hash(source), source_crop: crop, target_long_axis: longAxis,
        alpha_bounds: alphaBounds(raw, 128, 128) };
}

async function preview(files) {
    const layers = [], labels = [];
    for (const [index, entry] of files.entries()) {
        const x = index % 5 * 180, y = Math.floor(index / 5) * 176;
        layers.push({ input: path.join(root, entry.file), left: x + 26, top: y + 8 });
        labels.push(`<text x="${x + 90}" y="${y + 158}" text-anchor="middle">${entry.key}</text>`);
    }
    const text = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="704">`
        + `<g font-family="Arial" font-size="13" fill="#edf0ee">${labels.join("")}</g></svg>`;
    await sharp({ create: { width: 900, height: 704, channels: 4, background: "#27312f" } })
        .composite([...layers, { input: Buffer.from(text), left: 0, top: 0 }])
        .png().toFile(path.join(pack, "preview-compact.png"));
    const comparisons = [], captions = [];
    const { execFileSync } = require("node:child_process");
    for (const [row, key] of ["enemy-boss", "extract"].entries()) {
        const name = `node-${key}.png`, file = `assets/ui/image/expeditionNodes/${name}`;
        const images = [execFileSync("git", ["show", `HEAD:${file}`], { cwd: root }),
            fs.readFileSync(path.join(pack, "png128", name)), fs.readFileSync(path.join(target, name))];
        for (const [column, image] of images.entries()) {
            comparisons.push({ input: await sharp(image).resize(256, 256).png().toBuffer(),
                left: column * 300 + 22, top: row * 300 + 30 });
            captions.push(`<text x="${column * 300 + 150}" y="${row * 300 + 22}" text-anchor="middle">`
                + `${["old", "before recut", "recut"][column]} / ${key}</text>`);
        }
    }
    await sharp({ create: { width: 900, height: 600, channels: 4, background: "#34413d" } })
        .composite([...comparisons, { input: Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600">`
            + `<g font-family="Arial" font-size="15" fill="#edf0ee">${captions.join("")}</g></svg>`),
            left: 0, top: 0 }]).png().toFile(path.join(pack, "crop-comparison.png"));
}

async function check() {
    const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
    assert.equal(report.source_sha256, extraction.source_sha256);
    assert.equal(report.files.length, 19);
    const uuids = new Set();
    for (const entry of report.files) {
        const file = path.join(root, entry.file), bytes = fs.readFileSync(file);
        assert.equal(hash(bytes), entry.sha256, entry.file);
        assert.equal(hash(fs.readFileSync(path.join(compact, path.basename(file)))), entry.sha256);
        const rebuilt = await recut(entry);
        assert.equal(rebuilt.source_sha256, entry.source_sha256, "Original cutout unchanged");
        assert.equal(hash(rebuilt.bytes), entry.sha256, "Reproducible tight crop");
        const meta = JSON.parse(fs.readFileSync(`${file}.meta`, "utf8"));
        assert.equal(meta.uuid, entry.uuid);
        if (entry.previous_uuid) assert.equal(meta.uuid, entry.previous_uuid, "Keep existing references");
        assert.ok(!uuids.has(meta.uuid), "Unique UUID");
        uuids.add(meta.uuid);
        assert.deepEqual([meta.importer.textureType, meta.importer.sRGB, meta.importer.premultiplyAlpha],
            [2, true, true], entry.file);
        const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
        assert.deepEqual([info.width, info.height, info.channels], [128, 128, 4]);
        let visible = 0, partial = 0, solid = 0;
        for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
            const offset = (y * 128 + x) * 4, alpha = data[offset + 3];
            if (x === 0 || y === 0 || x === 127 || y === 127) assert.equal(alpha, 0, "Transparent border");
            if (!alpha) assert.equal(data[offset] + data[offset + 1] + data[offset + 2], 0);
            else visible++;
            if (alpha > 0 && alpha < 255) partial++;
            if (alpha === 255) solid++;
        }
        assert.ok(visible > 300 && visible < 14000 && partial > 0 && solid > 0, entry.file);
        const bounds = alphaBounds(data, 128, 128);
        assert.deepEqual(bounds, entry.alpha_bounds);
        assert.ok(Math.max(bounds.width, bounds.height) >= entry.target_long_axis - 2, "Subject fills its target long axis");
        assert.ok(bounds.left >= 6 && bounds.top >= 6 &&
            bounds.left + bounds.width <= 122 && bounds.top + bounds.height <= 122, "Safe edge padding");
    }
    console.log("PASS node art v2: 19 RGBA sprites, source hashes, alpha, UUIDs and sprite/sRGB/premultiplied import settings.");
}

async function main() {
    if (fs.existsSync(path.join(root, "output/imagegen/expedition-node-icons-v4/integration-report.json"))) {
        if (process.argv.includes("--check")) return require("./import-expedition-node-art-v4.cjs");
        throw new Error("V2 artwork is superseded. Use tools/import-expedition-node-art-v4.cjs --write.");
    }
    if (process.argv.includes("--check")) return check();
    assert.ok(process.argv.includes("--write"), "Use --write to import or --check to validate.");
    const previous = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, "utf8")) : null;
    fs.mkdirSync(compact, { recursive: true });
    const files = [];
    for (const entry of extraction.files) {
        const file = path.join(target, entry.file), metaFile = `${file}.meta`;
        const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : {};
        const previousEntry = previous?.files.find(record => record.file === relative(file));
        const previousUuid = previousEntry ? previousEntry.previous_uuid : meta.uuid || null;
        meta.uuid ||= crypto.randomUUID();
        meta.importer = { ...meta.importer, textureType: 2, sRGB: true, premultiplyAlpha: true };
        const { bytes, ...crop } = await recut(entry);
        fs.writeFileSync(path.join(compact, entry.file), bytes);
        fs.writeFileSync(file, bytes);
        const metaBytes = JSON.stringify(meta, null, 2);
        if (!fs.existsSync(metaFile) || fs.readFileSync(metaFile, "utf8") !== metaBytes)
            fs.writeFileSync(metaFile, metaBytes);
        files.push({ key: entry.key, file: relative(file), uuid: meta.uuid, previous_uuid: previousUuid,
            sha256: hash(bytes), runtime_used: active.has(entry.key), ...crop });
    }
    fs.writeFileSync(reportFile, JSON.stringify({
        source_sha256: extraction.source_sha256, size: [128, 128],
        existing_icons_replaced: 12, new_assets: 7,
        sizing: "Crop native alpha bounds, fit 116px long axis, center on 128px canvas with 6px minimum padding. Enemy family retains a common scale anchored to the boss's 116px width.",
        map_rendering: "Separate shared base below center sprite; existing marker and hit areas retained.",
        config_changed: false, saves_changed: false,
        library_only: files.filter(entry => !entry.runtime_used).map(entry => entry.key), files,
    }, null, 2) + "\n");
    await check();
    await preview(files);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
