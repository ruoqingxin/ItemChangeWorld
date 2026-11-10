const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "output/imagegen/n8PNXpZH.webp");
const output = path.join(root, "output/imagegen/expedition-node-icons");
const target = path.join(root, "assets/ui/image/expeditionNodes");
const refresh = process.argv.includes("--refresh");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const relative = file => path.relative(root, file).replaceAll("\\", "/");
const clamp = n => Math.max(0, Math.min(1, n));
const probes = {
    start: [[83, 60, false], [103, 64, true]],
    "enemy-elite": [[531, 43, true]],
    extract: [[242, 330, false], [226, 330, true]],
    "battle-loot": [[380, 350, true]],
};
const entries = [
    ["start", "入境处", 96, 113,
        "M54 31L89 32L100 32L105 40L109 33L125 32L133 30L138 32L138 37L136 43L135 50L130 56L129 101L132 106L129 111L114 112L109 108L112 101L112 57L108 53L81 53L76 57L76 101L80 105L79 110L65 112L60 108L62 102L62 57L58 53L56 46L54 41L52 36Z"],
    ["transit", "通行岔口", 242, 113,
        "M201 49Q211 41 225 47L241 53L260 46Q275 41 282 49L283 58L280 67L266 76L266 106L259 112L242 118L217 110L216 77L202 68L199 60Z"],
    ["enemy-normal", "普通敌人", 387, 113,
        "M352 53L363 47L371 46L370 39L380 36L386 31L391 34L391 45L400 44L413 29L414 25L420 25L426 30L425 35L422 36L410 53L415 58L420 62L422 79L416 96L406 104L401 103L391 111L379 104L353 118L357 100L352 90L350 80L353 73L351 64Z"],
    ["enemy-elite", "精英敌人", 532, 113,
        "M480 28L488 31L506 48L512 46L518 53L509 61L519 68L530 56L544 67L554 59L550 53L555 46L561 49L577 31L584 29L583 37L578 41L573 62L579 72L581 81L577 86L570 85L566 81L568 74L570 72L568 59L563 65L556 65L553 72L544 82L555 101L570 120L551 110L539 100L532 115L520 104L496 119L509 99L517 86L511 73L504 66L500 68L494 63L489 77L497 80L494 86L487 84L482 77L481 70L485 63L488 45L481 38Z M519 32L525 38L530 30L534 39L543 33L539 48L523 49Z"],
    ["enemy-boss", "首领", 677, 113,
        "M634 39Q629 55 637 69L637 88Q642 110 666 116Q683 122 702 108L716 94L718 73L718 60Q722 50 718 40L711 53Q692 27 665 35Q650 37 640 49Z"],
    ["supply", "补给处", 96, 245,
        "M69 181L79 179L81 175L92 173L101 174L104 179L114 179L116 183L108 190L106 196L117 207L123 225L130 224L137 228L140 237L139 245L132 251L111 254L102 250L94 253L79 254L74 249L64 247L56 241L61 228L62 217L70 204L78 197L78 191L68 187L66 184Z"],
    ["search", "搜索点", 242, 245,
        "M201 198L237 181L281 197L284 207L280 211L280 237L259 250L241 255L204 240L202 217L200 211Z"],
    ["borrow", "借法台", 387, 245,
        "M348 220L365 213L381 208L400 211L421 219L425 224L426 230L423 234L427 242L427 249L414 252L408 247L401 249L400 257L386 262L378 258L378 250L362 245L357 247L347 245L345 239L347 229Z M369 204L378 191L387 176L389 170L398 176L402 173L408 175L409 180L398 201L392 213L387 215L378 211Z"],
    ["insight", "悟道处", 532, 245,
        "M507 179L516 170L524 167L530 169L537 178L547 179L550 185L557 192L558 209L557 233L560 245L548 252L534 247L524 246L507 240L505 215L507 199L504 191Z"],
    ["recovery", "恢复点", 96, 375,
        "M62 345Q62 334 81 333L79 327L70 320L65 307L80 310L87 316L93 328L95 337L100 325L111 321L125 322L114 327L107 334L120 335L132 343L132 355L127 371L116 377L91 380L76 376L65 369Z M94 305L100 309L102 316L99 319L94 313Z"],
    ["extract", "撤离点", 242, 375,
        "M218 351C215 335 221 314 231 305Q245 292 257 306C267 315 271 336 265 352L269 355L271 362L266 370L251 377L235 378L216 373L213 366L215 358Z"],
    ["battle-loot", "战后遗藏", 387, 375,
        "M351 318L359 316L398 321L408 323L417 332L417 335L421 330L428 334L432 344L438 361L439 372L435 376L421 373L414 367L405 377L393 380L346 364L345 347L349 345L373 338L360 332L351 329L347 324Z"],
].map(([key, name, cx, cy, subject]) => ({ key, name, cx, cy, subject, file: `node-${key}.png` }));

function baseShape(cx, cy) {
    return `M${cx - 53} ${cy - 4}C${cx - 53} ${cy - 19} ${cx - 30} ${cy - 28} ${cx} ${cy - 28}`
        + `C${cx + 30} ${cy - 28} ${cx + 53} ${cy - 19} ${cx + 53} ${cy - 4}`
        + `L${cx + 53} ${cy + 3}C${cx + 53} ${cy + 18} ${cx + 30} ${cy + 28} ${cx} ${cy + 28}`
        + `C${cx - 30} ${cy + 28} ${cx - 53} ${cy + 18} ${cx - 53} ${cy + 3}Z`;
}

function bounds(data, width, height) {
    let left = width, top = height, right = -1, bottom = -1, partial = 0, transparent = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (!alpha) transparent++;
        if (alpha > 0 && alpha < 255) partial++;
        if (alpha <= 0) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    assert.ok(right >= left, "Missing subject");
    return { left, top, width: right - left + 1, height: bottom - top + 1, partial, transparent };
}

async function tracedMask(entry) {
    const holes = entry.key === "extract"
        ? '<path d="M233 348C230 337 232 321 238 315Q242 310 247 316C252 324 253 337 249 348Z" fill="black"/>'
        : "";
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="429">`
        + `<path fill="white" d="${baseShape(entry.cx, entry.cy)}"/>`
        + `<path fill="white" d="${entry.subject}"/>${holes}</svg>`;
    const mask = await sharp(Buffer.from(xml)).resize(3072, 1716).resize(768, 429).ensureAlpha().raw()
        .toBuffer();
    for (let p = 0; p < 768 * 429; p++) {
        mask[p * 4 + 3] = Math.round(mask[p * 4 + 3] * mask[p * 4] / 255);
    }
    return mask;
}

function glows(entry, rgb, rgba) {
    const patches = entry.key === "start" ? [[77, 54, 112, 98, "white"]]
        : entry.key === "borrow" ? [[350, 178, 426, 207, "gold"]]
        : entry.key === "extract" ? [[202, 298, 282, 365, "cyan"]] : [];
    for (const [left, top, right, bottom, color] of patches) {
        for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
            const p = (y * 768 + x) * 4;
            if (rgba[p + 3]) continue;
            if (entry.key === "extract" && x >= 230 && x <= 252 && y >= 311 && y <= 348) continue;
            const i = (y * 768 + x) * 3;
            const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
            // Paper is warm gray; isolate only the brighter, cooler/more saturated painted wisps.
            const alpha = color === "gold" ? clamp((r - 145) / 100) * clamp((g - b - 10) / 35)
                : color === "cyan" ? clamp((g - r - 4) / 35) * clamp((b - r) / 30)
                : clamp((Math.min(r, g, b) - 145) / 95);
            if (alpha < 0.07) continue;
            const a = Math.round(alpha * 255);
            const foreground = color === "gold" ? [255, 240, 155]
                : color === "cyan" ? [170, 245, 222] : [234, 247, 242];
            for (let c = 0; c < 3; c++) rgba[p + c] = foreground[c];
            rgba[p + 3] = a;
        }
    }
}

async function writeAsset(file, bytes) {
    if (fs.existsSync(file)) {
        assert.ok(hash(fs.readFileSync(file)) === hash(bytes) || refresh,
            `Refusing to replace a different existing image: ${relative(file)}`);
        if (hash(fs.readFileSync(file)) !== hash(bytes)) fs.writeFileSync(file, bytes);
    } else fs.writeFileSync(file, bytes);
    const metaFile = `${file}.meta`;
    const previous = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : {};
    const meta = { ...previous, uuid: previous.uuid || crypto.randomUUID(),
        importer: { ...previous.importer, textureType: 2, sRGB: true, premultiplyAlpha: true } };
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + "\n");
    return meta.uuid;
}

async function preview() {
    const width = 1008, height = 660, layers = [], labels = [];
    for (let theme = 0; theme < 2; theme++) {
        const top = theme * 330, color = theme ? "#e4e9e5" : "#252b2e";
        layers.push({ input: await sharp({ create: { width, height: 330, channels: 4,
            background: theme ? "#12231e" : "#e7eaec" } }).png().toBuffer(), left: 0, top });
        for (const [index, entry] of entries.entries()) {
            const x = 18 + index % 6 * 165, y = top + 12 + Math.floor(index / 6) * 160;
            layers.push({ input: path.join(target, entry.file), left: x, top: y });
            labels.push(`<text x="${x + 64}" y="${y + 147}" fill="${color}" text-anchor="middle">`
                + `${String(index + 1).padStart(2, "0")} ${entry.name}</text>`);
        }
    }
    const text = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
        + `<g font-family="Microsoft YaHei" font-size="15">${labels.join("")}</g></svg>`;
    await sharp({ create: { width, height, channels: 4, background: "#00000000" } })
        .composite([...layers, { input: Buffer.from(text), left: 0, top: 0 }])
        .png().toFile(path.join(output, "transparency-check.png"));
    const sizes = [84, 64], smallLayers = [];
    for (const [row, size] of sizes.entries()) for (const [index, entry] of entries.entries()) {
        smallLayers.push({ input: await sharp(path.join(target, entry.file)).resize(size, size).png().toBuffer(),
            left: 10 + index * 88 + Math.floor((84 - size) / 2), top: 8 + row * 96 });
    }
    await sharp({ create: { width: 1076, height: 200, channels: 4, background: "#12231e" } })
        .composite(smallLayers).png().toFile(path.join(output, "small-size-check.png"));
}

async function check() {
    const report = JSON.parse(fs.readFileSync(path.join(output, "sheet-extraction.json"), "utf8"));
    assert.equal(hash(fs.readFileSync(source)), report.source_sha256);
    assert.equal(report.files.length, 12);
    const uuids = new Set();
    for (const record of report.files) {
        const file = path.join(root, record.file), bytes = fs.readFileSync(file);
        const metadata = await sharp(bytes).metadata();
        assert.deepEqual([metadata.width, metadata.height, metadata.channels], [128, 128, 4]);
        assert.equal(hash(bytes), record.sha256);
        const meta = JSON.parse(fs.readFileSync(`${file}.meta`, "utf8"));
        assert.equal(meta.uuid, record.uuid);
        assert.equal(meta.importer.textureType, 2);
        assert.equal(meta.importer.sRGB, true);
        assert.equal(meta.importer.premultiplyAlpha, true);
        assert.ok(!uuids.has(meta.uuid));
        uuids.add(meta.uuid);
        const data = await sharp(bytes).ensureAlpha().raw().toBuffer(), visible = bounds(data, 128, 128);
        assert.ok(visible.left >= 8 && visible.top >= 8);
        assert.ok(visible.left + visible.width <= 120 && visible.top + visible.height <= 120);
        assert.ok(visible.transparent > 3000 && visible.partial > 0);
        for (const offset of [0, 127, 128 * 127, 128 * 128 - 1]) assert.equal(data[offset * 4 + 3], 0);
    }
    for (const [file, digest] of Object.entries(report.previous_expedition_hashes)) {
        assert.equal(hash(fs.readFileSync(path.join(root, file))), digest);
    }
    console.log("PASS: 12 RGBA icons, padding, alpha, hashes, UUIDs, import settings, source and 36 old files.");
}

async function main() {
    if (process.argv.includes("--check")) return check();
    const original = fs.readFileSync(source), sourceHash = hash(original);
    const metadata = await sharp(original).metadata();
    assert.deepEqual([metadata.width, metadata.height], [768, 429]);
    fs.mkdirSync(target, { recursive: true });
    fs.mkdirSync(path.join(output, "rgba"), { recursive: true });
    const existing = new Map();
    const old = path.join(root, "assets/ui/atlas/module/expedition");
    for (const name of fs.readdirSync(old)) {
        const file = path.join(old, name);
        if (fs.statSync(file).isFile()) existing.set(file, hash(fs.readFileSync(file)));
    }
    const rgb = await sharp(original).removeAlpha().raw().toBuffer(), records = [];
    for (const entry of entries) {
        const mask = await tracedMask(entry), rgba = Buffer.alloc(768 * 429 * 4);
        for (let p = 0; p < 768 * 429; p++) {
            if (!mask[p * 4 + 3]) continue;
            for (let c = 0; c < 3; c++) rgba[p * 4 + c] = rgb[p * 3 + c];
            rgba[p * 4 + 3] = mask[p * 4 + 3];
        }
        glows(entry, rgb, rgba);
        for (const [x, y, opaque] of probes[entry.key] || []) {
            const alpha = rgba[(y * 768 + x) * 4 + 3];
            assert.ok(opaque ? alpha > 0 : alpha === 0, `Failed alpha probe: ${entry.key} ${x},${y} = ${alpha}`);
        }
        const fullBounds = bounds(rgba, 768, 429);
        const rectangle = { left: fullBounds.left, top: fullBounds.top,
            width: fullBounds.width, height: fullBounds.height };
        const trimmed = await sharp(rgba, { raw: { width: 768, height: 429, channels: 4 } })
            .extract(rectangle).png().toBuffer();
        await sharp(trimmed).extend({ top: 8, bottom: 8, left: 8, right: 8, background: "#00000000" })
            .png().toFile(path.join(output, "rgba", entry.file));
        const subject = await sharp(trimmed).resize(108, 108, { fit: "inside", kernel: "lanczos3" })
            .png().toBuffer();
        const dimensions = await sharp(subject).metadata();
        const bytes = await sharp({ create: { width: 128, height: 128, channels: 4, background: "#00000000" } })
            .composite([{ input: subject, left: Math.floor((128 - dimensions.width) / 2),
                top: Math.floor((128 - dimensions.height) / 2) }]).png().toBuffer();
        const file = path.join(target, entry.file), uuid = await writeAsset(file, bytes);
        const raw = await sharp(bytes).ensureAlpha().raw().toBuffer();
        const visible = bounds(raw, 128, 128);
        assert.ok(visible.left >= 8 && visible.top >= 8
            && visible.left + visible.width <= 120 && visible.top + visible.height <= 120);
        assert.ok(visible.partial > 0 && visible.transparent > 3000);
        const rowBottom = entry.cy < 150 ? 143 : entry.cy < 300 ? 274 : 404;
        assert.ok(rectangle.top + rectangle.height <= rowBottom, "Label region included");
        records.push({ key: entry.key, name: entry.name, file: relative(file), uuid,
            source_bounds: rectangle, sha256: hash(bytes), size: [128, 128], alpha_bounds: visible });
    }
    assert.equal(new Set(records.map(record => record.uuid)).size, 12);
    assert.equal(hash(fs.readFileSync(source)), sourceHash);
    for (const [file, before] of existing) assert.equal(hash(fs.readFileSync(file)), before);
    await preview();
    const report = { source: relative(source), source_sha256: sourceHash, source_size: [768, 429],
        method: "Local hand-traced silhouette masks, retained painted bases, selective glow extraction; no generation API",
        source_preserved: true, selected_loot: "left open-lid variant",
        excluded: ["duplicate open-box variant", "standalone base", "paper background", "labels"],
        runtime_bound: false, config_changed: false, saves_changed: false,
        alpha_probes: probes,
        previous_expedition_hashes: Object.fromEntries([...existing].map(([file, digest]) => [relative(file), digest])),
        previous_expedition_files_verified: existing.size, count: records.length, files: records };
    fs.writeFileSync(path.join(output, "sheet-extraction.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ count: records.length, directory: relative(target),
        old_files_unchanged: existing.size, source_sha256: sourceHash }, null, 2));
    await check();
}

main().catch(error => { console.error(error); process.exitCode = 1; });
