const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const source = process.env.MAP_UI_SOURCE ||
    "C:/Users/Administrator/Downloads/oVUMnQV0.png";
const reference = path.join(root, "art/reference/expedition/skill-battle-map-ui-sheet.png");
const output = path.join(root, "assets/ui/atlas/module/expedition");
const preview = path.join(root, "output/imagegen/skill-map-ui");
const sourceHash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const palette = [[235, 235, 235], [194, 191, 186]];
const matteRadius = 32;
const featherRadius = 68;

const regions = [
    ["map-resource-strip.png", { left: 38, top: 108, width: 1124, height: 64 }],
    ["map-footer-strip.png", { left: 0, top: 236, width: 1920, height: 68 }],
    ["map-bottom-trim.png", { left: 0, top: 908, width: 1920, height: 76 }],
    ["map-timer-frame.png", { left: 1676, top: 26, width: 206, height: 100 }],
    ["map-current-ring.png", { left: 163, top: 356, width: 216, height: 216 }],
    ["map-button.png", { left: 48, top: 716, width: 236, height: 108 }],
    ["map-button-alt.png", { left: 309, top: 716, width: 238, height: 108 }],
    ["map-button-danger.png", { left: 1604, top: 716, width: 276, height: 108 }],
    ["map-icon-life.png", { left: 1207, top: 48, width: 78, height: 84 }],
    ["map-icon-spirit.png", { left: 1324, top: 46, width: 86, height: 88 }],
    ["map-icon-guard.png", { left: 1435, top: 44, width: 84, height: 92 }],
    ["map-icon-battle.png", { left: 1543, top: 43, width: 88, height: 94 }],
];

function closestMatte(data, offset) {
    let best = palette[0], distance = Infinity;
    for (const color of palette) {
        const dr = data[offset] - color[0], dg = data[offset + 1] - color[1],
            db = data[offset + 2] - color[2];
        const next = Math.sqrt(dr * dr + dg * dg + db * db);
        if (next < distance) { best = color; distance = next; }
    }
    return { color: best, distance };
}

async function removeCheckerboard(bytes, region) {
    const { data, info } = await sharp(bytes).extract(region).removeAlpha()
        .raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info, count = width * height;
    const candidates = new Uint8Array(count), removed = new Uint8Array(count);
    const distance = new Float32Array(count), background = new Uint8Array(count);
    const queue = new Int32Array(count);

    for (let i = 0; i < count; i++) {
        const { color, distance: d } = closestMatte(data, i * 3);
        distance[i] = d;
        background[i] = palette.indexOf(color);
        if (d <= matteRadius) candidates[i] = 1;
    }

    let head = 0, tail = 0;
    const enqueue = i => {
        if (candidates[i] && !removed[i]) {
            removed[i] = 1;
            queue[tail++] = i;
        }
    };
    for (let x = 0; x < width; x++) {
        enqueue(x);
        enqueue((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y++) {
        enqueue(y * width);
        enqueue(y * width + width - 1);
    }
    while (head < tail) {
        const i = queue[head++], x = i % width;
        if (x) enqueue(i - 1);
        if (x + 1 < width) enqueue(i + 1);
        if (i >= width) enqueue(i - width);
        if (i + width < count) enqueue(i + width);
        if (x && i >= width) enqueue(i - width - 1);
        if (x + 1 < width && i >= width) enqueue(i - width + 1);
        if (x && i + width < count) enqueue(i + width - 1);
        if (x + 1 < width && i + width < count) enqueue(i + width + 1);
    }

    // Large enclosed checker regions, such as the inside of the selection ring, are matte too.
    const seen = new Uint8Array(count), minHole = Math.max(256, Math.floor(count * 0.002));
    for (let i = 0; i < count; i++) {
        if (!candidates[i] || removed[i] || seen[i]) continue;
        let size = 0, touchesEdge = false, cursor = 0;
        queue[cursor++] = i;
        seen[i] = 1;
        while (size < cursor) {
            const at = queue[size++], x = at % width;
            if (!x || x === width - 1 || at < width || at >= count - width) touchesEdge = true;
            const neighbors = [x ? at - 1 : -1, x + 1 < width ? at + 1 : -1,
                at >= width ? at - width : -1, at + width < count ? at + width : -1,
                x && at >= width ? at - width - 1 : -1,
                x + 1 < width && at >= width ? at - width + 1 : -1,
                x && at + width < count ? at + width - 1 : -1,
                x + 1 < width && at + width < count ? at + width + 1 : -1];
            for (const next of neighbors) {
                if (next >= 0 && candidates[next] && !removed[next] && !seen[next]) {
                    seen[next] = 1;
                    queue[cursor++] = next;
                }
            }
        }
        if (touchesEdge || size >= minHole)
            for (let j = 0; j < size; j++) removed[queue[j]] = 1;
    }

    const rgba = Buffer.alloc(count * 4);
    for (let i = 0; i < count; i++) {
        const p = i * 3, q = i * 4;
        rgba[q] = data[p];
        rgba[q + 1] = data[p + 1];
        rgba[q + 2] = data[p + 2];
        if (removed[i]) continue;
        let alpha = 1;
        const x = i % width;
        let nearRemoved = false;
        for (let dy = -1; dy <= 1 && !nearRemoved; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx, ny = Math.floor(i / width) + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height &&
                    removed[ny * width + nx]) { nearRemoved = true; break; }
            }
        }
        if (nearRemoved && distance[i] < featherRadius) alpha = 0;
        rgba[q + 3] = Math.round(alpha * 255);
    }
    return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function saveAsset(name, region, originalBytes, report) {
    const bytes = await removeCheckerboard(originalBytes, region);
    const file = path.join(output, name);
    const existingMeta = fs.existsSync(`${file}.meta`)
        ? JSON.parse(fs.readFileSync(`${file}.meta`, "utf8")) : {};
    await fs.promises.mkdir(output, { recursive: true });
    await fs.promises.writeFile(file, bytes);
    await fs.promises.writeFile(`${file}.meta`, JSON.stringify({
        ...existingMeta,
        uuid: existingMeta.uuid || crypto.randomUUID(),
        importer: { ...existingMeta.importer, textureType: 2, sRGB: true, premultiplyAlpha: true },
    }, null, 2) + "\n");
    const metadata = await sharp(bytes).metadata();
    const probe = await sharp(bytes).ensureAlpha().raw().toBuffer();
    const transparentPixels = probe.filter((_, index) => index % 4 === 3 && probe[index] === 0).length;
    assert.ok(metadata.width > 0 && metadata.height > 0);
    assert.ok(transparentPixels > 0, `${name} did not retain a transparent background`);
    report.push({ file: `assets/ui/atlas/module/expedition/${name}`, size: [metadata.width, metadata.height],
        sha256: sourceHash(bytes), transparent_pixels: transparentPixels });
    return bytes;
}

async function main() {
    assert.ok(fs.existsSync(source), `Missing reference sheet: ${source}`);
    const originalBytes = fs.readFileSync(source);
    const meta = await sharp(originalBytes).metadata();
    assert.deepEqual([meta.width, meta.height], [1920, 1072]);
    fs.mkdirSync(path.dirname(reference), { recursive: true });
    if (fs.existsSync(reference)) {
        assert.equal(sourceHash(fs.readFileSync(reference)), sourceHash(originalBytes),
            "The preserved reference sheet differs from the supplied image.");
    } else {
        fs.copyFileSync(source, reference);
    }

    const records = [];
    const buffers = [];
    for (const [name, region] of regions) {
        const bytes = await saveAsset(name, region, originalBytes, records);
        buffers.push({ input: bytes, left: region.left, top: region.top });
    }
    await fs.promises.mkdir(preview, { recursive: true });
    await sharp({ create: { width: 1920, height: 1072, channels: 4, background: "#28332c" } })
        .composite(buffers).png().toFile(path.join(preview, "components-dark.png"));
    await sharp({ create: { width: 1920, height: 1072, channels: 4, background: "#e8e9e6" } })
        .composite(buffers).png().toFile(path.join(preview, "components-light.png"));
    fs.writeFileSync(path.join(preview, "sheet-extraction.json"), JSON.stringify({
        source: "art/reference/expedition/skill-battle-map-ui-sheet.png",
        source_sha256: sourceHash(originalBytes),
        source_size: [meta.width, meta.height],
        checkerboard_removed: true,
        removable_palette: palette,
        method: "Color-distance matte removal with border-connected flood fill, enclosed-hole cleanup and one-pixel edge unmatting.",
        map_routes_and_nodes: "Not extracted; route drawing, map nodes and labels remain data-driven UI.",
        assets: records,
    }, null, 2) + "\n");
    console.log(JSON.stringify({ count: records.length, source_sha256: sourceHash(originalBytes),
        runtime_directory: "assets/ui/atlas/module/expedition" }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
