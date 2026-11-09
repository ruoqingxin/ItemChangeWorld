const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const sharp = require(path.join(root, "node_modules/sharp"));
const output = path.join(root, "output/imagegen/naxu-icons");
const spec = JSON.parse(fs.readFileSync(path.join(root, "art/reference/naxu-icons/prompts.json"), "utf8"));
const columns = [0, 361, 723, 1084, 1446];
const rows = [[24, 334], [385, 670], [729, 1014]];
const settings = [
    { holes: [[258, 132], [244, 131]] },
    {},
    { holes: [[918, 127]] },
    {},
    {},
    {},
    { holes: [[897, 429]] },
    { holes: [[1295, 539]] },
    {},
    { holes: [[667, 895], [447, 886], [463, 911], [675, 893], [671, 861], [674, 912], [454, 898]] },
    { protectedEllipse: [912, 879, 61, 68] },
    { protectedRectangle: [1193, 889, 93, 62] },
];

function isProtected(x, y, config) {
    if (config.protectedEllipse) {
        const [cx, cy, rx, ry] = config.protectedEllipse;
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) return true;
    }
    if (config.protectedRectangle) {
        const [left, top, width, height] = config.protectedRectangle;
        if (x >= left && x < left + width && y >= top && y < top + height) return true;
    }
    return false;
}

function extractMask(rgb, width, height, left, top, config) {
    const size = width * height;
    const background = new Uint8Array(size);
    const eligible = new Uint8Array(size);
    const queue = new Int32Array(size);
    for (let p = 0; p < size; p++) {
        const i = p * 3;
        eligible[p] = Math.max(rgb[i], rgb[i + 1], rgb[i + 2]) <= 12
            && !isProtected(left + p % width, top + Math.floor(p / width), config) ? 1 : 0;
    }
    let head = 0, tail = 0;
    const seed = p => {
        if (p >= 0 && p < size && eligible[p] && !background[p]) {
            background[p] = 1;
            queue[tail++] = p;
        }
    };
    for (let x = 0; x < width; x++) { seed(x); seed((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { seed(y * width); seed(y * width + width - 1); }
    for (const [x, y] of config.holes || []) {
        const p = (y - top) * width + x - left;
        assert.ok(eligible[p], `Hole seed is not background at ${x},${y}`);
        seed(p);
    }
    // Only connected exterior black and explicitly identified holes are removed.
    while (head < tail) {
        const p = queue[head++], x = p % width, y = Math.floor(p / width);
        if (x > 0) seed(p - 1);
        if (x < width - 1) seed(p + 1);
        if (y > 0) seed(p - width);
        if (y < height - 1) seed(p + width);
    }

    const seen = new Uint8Array(size);
    let removedSpecks = 0;
    for (let p = 0; p < size; p++) {
        if (background[p] || seen[p]) continue;
        head = 0; tail = 1; queue[0] = p; seen[p] = 1;
        while (head < tail) {
            const z = queue[head++], x = z % width, y = Math.floor(z / width);
            for (const a of [x > 0 ? z - 1 : -1, x < width - 1 ? z + 1 : -1,
                y > 0 ? z - width : -1, y < height - 1 ? z + width : -1]) {
                if (a >= 0 && !background[a] && !seen[a]) {
                    seen[a] = 1; queue[tail++] = a;
                }
            }
        }
        if (tail < 12) {
            for (let n = 0; n < tail; n++) background[queue[n]] = 1;
            removedSpecks += tail;
        }
    }

    const rgba = Buffer.alloc(size * 4);
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let p = 0; p < size; p++) {
        if (background[p]) continue;
        const i = p * 3, j = p * 4, x = p % width, y = Math.floor(p / width);
        rgba[j] = rgb[i]; rgba[j + 1] = rgb[i + 1]; rgba[j + 2] = rgb[i + 2]; rgba[j + 3] = 255;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    assert.ok(maxX > minX && maxY > minY, "No object remained after extraction");
    for (const [x, y] of config.holes || []) {
        assert.equal(rgba[((y - top) * width + x - left) * 4 + 3], 0);
    }
    const core = config.protectedEllipse || config.protectedRectangle;
    if (core) {
        const x = config.protectedEllipse ? core[0] : core[0] + Math.floor(core[2] / 2);
        const y = config.protectedEllipse ? core[1] : core[1] + Math.floor(core[3] / 2);
        assert.equal(rgba[((y - top) * width + x - left) * 4 + 3], 255);
    }
    return { rgba, bounds: { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
        removedBackgroundPixels: background.reduce((a, b) => a + b, 0), removedSpecks };
}

async function checkerReview() {
    const width = 1008, height = 720;
    const bg = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const light = y < 360;
        const v = (Math.floor(x / 8) + Math.floor(y / 8)) % 2
            ? (light ? 236 : 57) : (light ? 250 : 43);
        const p = (y * width + x) * 3;
        bg[p] = v; bg[p + 1] = v; bg[p + 2] = v;
    }
    const placements = [], labels = [];
    for (let theme = 0; theme < 2; theme++) {
        const color = theme ? "#f0f0f0" : "#222222";
        labels.push(`<text x="18" y="${theme * 360 + 26}" fill="${color}" font-size="18">`
            + `${theme ? "深色" : "浅色"}透明检查 · 112×112 原尺寸</text>`);
        for (let q = 1; q <= 6; q++) {
            const candidates = spec.assets.filter(a => a.quality === q);
            for (let row = 0; row < 2; row++) {
                const asset = candidates[row], x = 28 + (q - 1) * 164, y = theme * 360 + 45 + row * 156;
                placements.push({ input: path.join(output, "112", asset.output_filename), left: x + 12, top: y });
                labels.push(`<text x="${x + 68}" y="${y + 134}" fill="${color}" font-size="13" text-anchor="middle">`
                    + `${asset.suggested_name}</text>`);
            }
        }
    }
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
        + `<g font-family="Microsoft YaHei, sans-serif">${labels.join("")}</g></svg>`);
    await sharp(bg, { raw: { width, height, channels: 3 } })
        .composite([...placements, { input: svg, left: 0, top: 0 }])
        .png().toFile(path.join(output, "transparency-check.png"));
}

(async () => {
    const source = process.argv[2];
    assert.ok(source && fs.existsSync(source), "Pass the source sheet path");
    const metadata = await sharp(source).metadata();
    assert.equal(metadata.width, 1446);
    assert.equal(metadata.height, 1080);
    assert.equal(spec.assets.length, 12);
    const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex");
    const archived = path.join(root, "art/reference/naxu-icons/source/7uqhRPxi.png");
    fs.mkdirSync(path.dirname(archived), { recursive: true });
    if (fs.existsSync(archived)) {
        assert.equal(crypto.createHash("sha256").update(fs.readFileSync(archived)).digest("hex"), sourceHash,
            "A different source image is already archived at the destination");
    } else {
        fs.copyFileSync(source, archived);
    }
    fs.mkdirSync(path.join(output, "rgba"), { recursive: true });
    const reports = [];
    for (let index = 0; index < spec.assets.length; index++) {
        const asset = spec.assets[index], row = Math.floor(index / 4), col = index % 4;
        const crop = { left: columns[col], top: rows[row][0],
            width: columns[col + 1] - columns[col], height: rows[row][1] - rows[row][0] };
        const { data, info } = await sharp(archived).extract(crop).removeAlpha().raw()
            .toBuffer({ resolveWithObject: true });
        const result = extractMask(data, info.width, info.height, crop.left, crop.top, settings[index]);
        const filename = path.join(output, "rgba", asset.output_filename);
        await sharp(result.rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
            .extract(result.bounds)
            .extend({ top: 8, bottom: 8, left: 8, right: 8, background: "#00000000" })
            .png().toFile(filename);
        reports.push({ id: asset.id, name: asset.suggested_name, quality: asset.quality, source_crop: crop,
            source_object_bounds: result.bounds, hole_seeds: settings[index].holes || [],
            protected_core: settings[index].protectedEllipse || settings[index].protectedRectangle || null,
            removed_background_pixels: result.removedBackgroundPixels, removed_speck_pixels: result.removedSpecks,
            full_resolution_file: `rgba/${asset.output_filename}`, final_file: `112/${asset.output_filename}` });
    }
    execFileSync(process.execPath, [path.join(__dirname, "naxu-assets.cjs"), "export"], { cwd: root });
    execFileSync(process.execPath, [path.join(__dirname, "naxu-assets.cjs"), "preview"], { cwd: root });
    await checkerReview();
    const manifest = { method: "Local extraction from user-supplied sheet; no image-generation API used",
        source: "art/reference/naxu-icons/source/7uqhRPxi.png", source_sha256: sourceHash,
        count: reports.length, final_size: [112, 112], format: "RGBA PNG", minimum_padding: 8,
        quality_frame_baked: false, files: reports };
    fs.writeFileSync(path.join(output, "sheet-extraction.json"), JSON.stringify(manifest, null, 2) + "\n");
    console.log(JSON.stringify({ completed: reports.length, original_preserved: archived,
        final_icons: path.join(output, "112"), previews: ["preview.png", "transparency-check.png"],
        manifest: path.join(output, "sheet-extraction.json") }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
