const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const sourceFile = process.env.MAP_NODE_STATE_SOURCE ||
    "C:/Users/Administrator/Downloads/e8fdfd1f-7fb3-49ff-985e-3576daa2f12c_0_24686f54.png";
const reference = path.join(root, "art/reference/expedition/map-node-state-source.png");
const target = path.join(root, "assets/ui/atlas/module/expedition/handpainted");
const pack = path.join(root, "output/imagegen/map-node-state-art");
const reportFile = path.join(pack, "extraction-report.json");
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const relative = file => path.relative(root, file).replaceAll("\\", "/");
const definitions = [
    { name: "map-transit-stone", rect: [0, 500, 670, 480],
        size: [128, 128], display: [104, 104], padding: [4, 4] },
    { name: "map-current-locator", rect: [1940, 320, 770, 300],
        size: [304, 72], display: [76, 18], padding: [6, 2], marker: true },
    { name: "map-reachable-locator", rect: [1940, 650, 770, 350],
        size: [320, 56], display: [80, 14], padding: [10, 2], marker: true },
    { name: "map-completed-badge", rect: [2070, 980, 500, 380],
        size: [120, 120], display: [30, 30], padding: [4, 4] },
];

async function pixels(bytes) {
    return sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function cleanAlpha(bytes) {
    const { data, info } = await pixels(bytes);
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 8) data.fill(0, i, i + 4);
    }
    return sharp(data, { raw: info }).png().toBuffer();
}

function bounds(data, width, height) {
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (!data[(y * width + x) * 4 + 3]) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    assert.ok(right >= left && bottom >= top, "Cutout must contain visible artwork");
    return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function components(data, width, height) {
    const visited = new Uint8Array(width * height), sizes = [];
    for (let start = 0; start < visited.length; start++) {
        if (visited[start] || data[start * 4 + 3] < 32) continue;
        const queue = [start];
        visited[start] = 1;
        for (let head = 0; head < queue.length; head++) {
            const p = queue[head], x = p % width, y = Math.floor(p / width);
            for (const next of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1,
                y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]) {
                if (next < 0 || visited[next] || data[next * 4 + 3] < 32) continue;
                visited[next] = 1;
                queue.push(next);
            }
        }
        if (queue.length > 4) sizes.push(queue.length);
    }
    return sizes.sort((a, b) => b - a);
}

async function validate(bytes, def) {
    const { data, info } = await pixels(bytes), [width, height] = def.size;
    assert.deepEqual([info.width, info.height, info.channels], [width, height, 4], def.name);
    let solid = 0, partial = 0, empty = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4, alpha = data[i + 3];
        if (!x || !y || x === width - 1 || y === height - 1)
            assert.equal(alpha, 0, `${def.name}: transparent safety border`);
        if (!alpha) {
            empty++;
            assert.equal(data[i] + data[i + 1] + data[i + 2], 0, "Clean invisible RGB");
        } else if (alpha >= 240) solid++;
        else partial++;
    }
    assert.ok(solid > 100 && partial > 0 && empty > 0, `${def.name}: alpha and subject`);
    const centerAlpha = data[(Math.floor(height / 2) * width + Math.floor(width / 2)) * 4 + 3];
    const parts = components(data, width, height);
    if (def.marker) {
        assert.equal(centerAlpha, 0, `${def.name}: transparent interior`);
        assert.equal(parts.length, def.name === "map-reachable-locator" ? 2 : 1,
            `${def.name}: one closed ring or two separate arcs`);
    } else {
        assert.ok(centerAlpha >= 240, `${def.name}: opaque subject center`);
        assert.equal(parts.length, 1, `${def.name}: intact subject`);
    }
    if (def.name === "map-reachable-locator") {
        for (let y = 0; y < height; y++)
            assert.equal(data[(y * width + width / 2) * 4 + 3], 0, "Both center gaps stay open");
    }
    return { solid_pixels: solid, partial_pixels: partial, transparent_pixels: empty,
        center_alpha: centerAlpha, components: parts, visible_bounds: bounds(data, width, height) };
}

function label(text, width = 250) {
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24">` +
        `<text x="8" y="17" font-family="Arial" font-size="13" fill="#b2beb7">${text}</text></svg>`);
}

async function preview(images) {
    const layers = [];
    for (const [row, color] of ["#35423b", "#e0e5e1"].entries()) {
        layers.push({ input: await sharp({ create: {
            width: 1024, height: 256, channels: 4, background: color,
        } }).png().toBuffer(), left: 0, top: row * 256 });
        for (let i = 0; i < definitions.length; i++) {
            const def = definitions[i], x = i * 256, y = row * 256;
            const large = await sharp(images[i]).resize(224, 132, {
                fit: "contain", background: transparent,
            }).png().toBuffer();
            layers.push({ input: large, left: x + 16, top: y + 24 });
            layers.push({ input: await sharp(label(def.name)).png().toBuffer(), left: x, top: y + 4 });
            const [width, height] = def.display;
            const small = await sharp(images[i]).resize(width, height).png().toBuffer();
            layers.push({ input: small, left: x + Math.floor((256 - width) / 2),
                top: y + 200 - Math.floor(height / 2) });
            layers.push({ input: await sharp(label(`PNG ${def.size.join("x")} / display ${def.display.join("x")}`))
                .png().toBuffer(), left: x, top: y + 232 });
        }
    }
    await sharp({ create: { width: 1024, height: 512, channels: 4, background: transparent } })
        .composite(layers).png().toFile(path.join(pack, "preview-dark-light.png"));
}

async function check() {
    const report = JSON.parse(fs.readFileSync(reportFile, "utf8")), uuids = new Set();
    assert.equal(report.source_sha256, hash(fs.readFileSync(reference)));
    assert.equal(report.files.length, 4, "Only four non-ground assets");
    assert.equal(report.ground_exported, false);
    for (const def of definitions) {
        const entry = report.files.find(record => record.name === def.name);
        const file = path.join(root, entry.file), bytes = fs.readFileSync(file);
        assert.equal(hash(bytes), entry.sha256, def.name);
        const meta = JSON.parse(fs.readFileSync(`${file}.meta`, "utf8"));
        assert.equal(meta.uuid, entry.uuid);
        assert.ok(!uuids.has(meta.uuid), "Unique sprite UUIDs");
        uuids.add(meta.uuid);
        assert.deepEqual([meta.importer.textureType, meta.importer.sRGB, meta.importer.premultiplyAlpha],
            [2, true, true]);
        await validate(bytes, def);
        const native = fs.readFileSync(path.join(root, entry.native_file));
        assert.equal(hash(native), entry.native_sha256);
    }
    console.log("PASS: four map sprites; sizes, clean alpha, closed gold ring, separate cyan arcs, hashes and sprite import settings.");
}

async function main() {
    if (process.argv.includes("--check")) return check();
    assert.ok(process.argv.includes("--write"), "Use --write to extract, or --check to validate");
    const input = fs.readFileSync(fs.existsSync(reference) ? reference : sourceFile);
    if (fs.existsSync(reference) && fs.existsSync(sourceFile))
        assert.equal(hash(input), hash(fs.readFileSync(sourceFile)), "Source sheet identity");
    const metadata = await sharp(input).metadata();
    assert.deepEqual([metadata.width, metadata.height, metadata.channels], [2736, 1536, 4]);
    const results = [];
    for (const def of definitions) {
        const [left, top, width, height] = def.rect;
        const cut = await cleanAlpha(await sharp(input).extract({ left, top, width, height }).png().toBuffer());
        const probe = await pixels(cut), box = bounds(probe.data, width, height);
        assert.ok(box.left > 0 && box.top > 0 &&
            box.left + box.width < width && box.top + box.height < height, "No clipped artwork");
        const trimmed = await sharp(cut).extract(box).png().toBuffer();
        const native = await sharp(trimmed).extend({
            top: 4, bottom: 4, left: 4, right: 4, background: transparent,
        }).png().toBuffer();
        const [outWidth, outHeight] = def.size, [px, py] = def.padding;
        // Only foot markers are fitted to their established display footprint.
        const bytes = await cleanAlpha(await sharp(trimmed).resize(outWidth - px * 2, outHeight - py * 2, {
            fit: def.marker ? "fill" : "contain", background: transparent, kernel: "lanczos3",
        }).extend({ left: px, right: px, top: py, bottom: py, background: transparent }).png().toBuffer());
        const stats = await validate(bytes, def);
        const file = path.join(target, `${def.name}.png`);
        const metaFile = `${file}.meta`;
        const existing = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : {};
        const meta = { ...existing, uuid: existing.uuid || crypto.randomUUID(),
            importer: { ...existing.importer, textureType: 2, sRGB: true, premultiplyAlpha: true } };
        results.push({ def, bytes, native, file, meta, stats,
            sourceBounds: [left + box.left, top + box.top, box.width, box.height] });
    }
    for (const dir of [target, path.dirname(reference), pack, path.join(pack, "native-cuts")])
        fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(reference)) fs.writeFileSync(reference, input);
    const files = [];
    for (const result of results) {
        const { def, bytes, native, file, meta, stats, sourceBounds } = result;
        const nativeFile = path.join(pack, "native-cuts", `${def.name}.png`);
        fs.writeFileSync(file, bytes);
        fs.writeFileSync(`${file}.meta`, JSON.stringify(meta, null, 2) + "\n");
        fs.writeFileSync(nativeFile, native);
        files.push({ name: def.name, file: relative(file), native_file: relative(nativeFile),
            source_rect: def.rect, source_bounds: sourceBounds, size: def.size, display_size: def.display,
            sha256: hash(bytes), native_sha256: hash(native), uuid: meta.uuid, ...stats });
    }
    await preview(results.map(result => result.bytes));
    fs.writeFileSync(reportFile, JSON.stringify({
        source: relative(reference), source_sha256: hash(input), source_size: [2736, 1536],
        count: 4, runtime_directory: relative(target), ground_exported: false,
        bound_to_runtime: false, gameplay_changed: false, saves_changed: false,
        method: "Crop supplied true-alpha artwork; drop alpha below 8/255 and zero invisible RGB. " +
            "Preserve source colors, remaining alpha and native cutout proportions. " +
            "Fit only the two runtime foot markers to existing display proportions; " +
            "stone and badge use uniform scaling. No color key, redraw or ground export.",
        files,
    }, null, 2) + "\n");
    await check();
}

main().catch(error => { console.error(error); process.exitCode = 1; });
