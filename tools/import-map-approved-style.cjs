const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const root = path.resolve(__dirname, "..");
const art = "assets/ui/atlas/module/expedition/handpainted/";
const reference = path.join(root, "art/reference/expedition/map-style-2026-11-13");
const manifest = path.join(reference, "import.json");
const source = path.join(reference, "panel-source.png");
const grid = [18, 18, 18, 18, 0];
const hash = data => crypto.createHash("sha256").update(data).digest("hex");

async function material(state = "normal") {
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let at = 0; at < data.length; at += 4) {
        if (!data[at + 3]) continue;
        const r = data[at], g = data[at + 1], b = data[at + 2];
        if (r > 85 && r > g * 1.04 && g > b * 1.12) {
            data[at] = Math.min(255, Math.round(r * 1.08));
            data[at + 1] = Math.min(255, Math.round(g * 1.04));
            data[at + 2] = Math.round(b * 0.86);
        } else {
            const light = r * 0.2126 + g * 0.7152 + b * 0.0722;
            data[at] = Math.round(light * 0.18);
            data[at + 1] = Math.round(light * 0.72);
            data[at + 2] = Math.round(light * 0.57);
        }
        const gray = data[at] * 0.2126 + data[at + 1] * 0.7152 + data[at + 2] * 0.0722;
        for (let c = 0; c < 3; c++) {
            const value = data[at + c];
            data[at + c] = state === "hover" ? Math.min(255, Math.round(value * 1.12 + 3)) :
                state === "pressed" ? Math.round(value * 0.8) :
                state === "disabled" ? Math.round((value * 0.45 + gray * 0.55) * 0.65) : value;
        }
    }
    return sharp(data, { raw: info }).png().toBuffer();
}

async function check() {
    const report = JSON.parse(fs.readFileSync(manifest, "utf8"));
    assert.equal(hash(fs.readFileSync(source)), report.source_sha256);
    const alpha = (await sharp(source).ensureAlpha().raw().toBuffer()).filter((_, i) => i % 4 === 3);
    for (const entry of report.files) {
        const bytes = fs.readFileSync(path.join(root, entry.file));
        assert.equal(hash(bytes), entry.sha256, entry.name);
        assert.deepEqual(bytes, await material(entry.state), "Approved material is reproducible");
        const meta = JSON.parse(fs.readFileSync(path.join(root, entry.file + ".meta"), "utf8"));
        assert.equal(meta.uuid, entry.uuid, "Keep existing asset UUID");
        assert.deepEqual(meta.importer.sizeGrid, grid);
        assert.deepEqual([meta.importer.textureType, meta.importer.sRGB, meta.importer.premultiplyAlpha], [2, true, true]);
        const pixels = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        assert.deepEqual([pixels.info.width, pixels.info.height], [96, 96]);
        assert.deepEqual(pixels.data.filter((_, i) => i % 4 === 3), alpha, "Every skin/state retains the same silhouette");
    }
    assert.equal(report.files.length, 11);
    console.log("PASS approved map material: 7 matching surfaces, 4 button states, unchanged alpha, UUIDs and 18px nine-slice.");
}

async function main() {
    if (process.argv.includes("--check")) return check();
    assert.ok(process.argv.includes("--write"), "Use --write or --check");
    fs.mkdirSync(reference, { recursive: true });
    if (!fs.existsSync(source)) fs.copyFileSync(path.join(root, art, "map-panel.png"), source);
    const files = [];
    for (const name of ["map-panel", "map-header-panel", "map-player-panel",
        ...["map-toolbar", "map-button"].flatMap(stem =>
            ["normal", "hover", "pressed", "disabled"].map(state => `${stem}-${state}`))]) {
        const state = name.match(/-(normal|hover|pressed|disabled)$/)?.[1] || "normal";
        const file = art + name + ".png", absolute = path.join(root, file);
        const meta = JSON.parse(fs.readFileSync(absolute + ".meta", "utf8"));
        const bytes = await material(state);
        fs.writeFileSync(absolute, bytes);
        meta.importer = { ...meta.importer, textureType: 2, sRGB: true, premultiplyAlpha: true, sizeGrid: grid };
        fs.writeFileSync(absolute + ".meta", JSON.stringify(meta, null, 2) + "\n");
        files.push({ name, file, state, size: [96, 96], grid, uuid: meta.uuid, sha256: hash(bytes) });
    }
    fs.writeFileSync(manifest, JSON.stringify({
        source_sha256: hash(fs.readFileSync(source)),
        method: "User-approved serif preview: shared emerald material and fine gold edge, with same-alpha interaction states.",
        files,
    }, null, 2) + "\n");
    await check();
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { check, manifest };
