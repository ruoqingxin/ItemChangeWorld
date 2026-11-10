const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "output/imagegen/DZfYmrak.webp");
const output = path.join(root, "output/imagegen/naxu-icons-v3");
const runtime = path.join(root, "assets/ui/image/naxu2");
const refresh = process.argv.includes("--refresh");
const columns = [0, 192, 384, 576, 768];
const rows = [0, 151, 285, 429];
const key = [137, 16, 57];
const assets = [
    ["pouch", 1, "素麻纳虚囊"],
    ["box", 1, "灰木纳虚匣"],
    ["pendant", 2, "云纹纳虚佩"],
    ["gourd", 2, "青藤纳虚葫"],
    ["box", 3, "玄纹纳虚匣"],
    ["cauldron", 3, "青铜纳虚鼎"],
    ["seal", 4, "云阙纳虚印"],
    ["ring", 4, "玄玉纳虚戒"],
    ["gourd", 5, "金络纳虚葫"],
    ["mirror", 5, "承虚纳虚镜"],
    ["orb", 6, "须弥纳虚珠"],
    ["cauldron", 6, "太虚纳虚鼎"],
].map(([family, quality, name], index) => ({
    family, quality, name, index,
    filename: `naxu-${family}-q${quality}.png`,
}));
const relative = filename => path.relative(root, filename).replaceAll("\\", "/");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function snapshotExistingBatches() {
    const result = new Map();
    for (const batch of ["naxu", "naxu1"]) {
        const directory = path.join(root, "assets/ui/image", batch);
        for (const name of fs.readdirSync(directory)) {
            const filename = path.join(directory, name);
            if (fs.statSync(filename).isFile()) result.set(filename, hash(fs.readFileSync(filename)));
        }
    }
    return result;
}

function alphaBounds(data, width, height, threshold = 0) {
    let left = width, top = height, right = -1, bottom = -1;
    let transparent = 0, partial = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha === 0) transparent++;
        else if (alpha < 255) partial++;
        if (alpha <= threshold) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    assert.ok(right >= left && bottom >= top, "Missing visible subject");
    return { left, top, width: right - left + 1, height: bottom - top + 1,
        transparent_pixels: transparent, partial_pixels: partial };
}

function clearTinyComponents(rgba, width, height) {
    const seen = new Uint8Array(width * height), queue = new Int32Array(width * height);
    let removed = 0;
    for (let start = 0; start < seen.length; start++) {
        if (seen[start] || rgba[start * 4 + 3] === 0) continue;
        let head = 0, tail = 1;
        seen[start] = 1; queue[0] = start;
        while (head < tail) {
            const current = queue[head++], x = current % width, y = Math.floor(current / width);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if ((!dx && !dy) || x + dx < 0 || x + dx >= width
                    || y + dy < 0 || y + dy >= height) continue;
                const next = (y + dy) * width + x + dx;
                if (seen[next] || !rgba[next * 4 + 3]) continue;
                seen[next] = 1; queue[tail++] = next;
            }
        }
        if (tail >= 4) continue;
        for (let i = 0; i < tail; i++) rgba.fill(0, queue[i] * 4, queue[i] * 4 + 4);
        removed += tail;
    }
    return removed;
}

function removeBurgundy(rgb, width, height) {
    const pixels = width * height, core = new Uint8Array(pixels);
    const distance = new Float32Array(pixels), matte = new Uint8Array(pixels);
    for (let p = 0; p < pixels; p++) {
        const i = p * 3, red = rgb[i], green = rgb[i + 1], blue = rgb[i + 2];
        const redGreen = red - green, blueGreen = blue - green;
        const ratio = blueGreen / Math.max(1, redGreen);
        distance[p] = Math.max(Math.abs(red - key[0]), Math.abs(green - key[1]),
            Math.abs(blue - key[2]));
        matte[p] = distance[p] <= 20
            || (redGreen > 12 && blueGreen > 3 && ratio > 0.12 && ratio < 0.8) ? 1 : 0;
        core[p] = matte[p] ? 0 : 1;
    }

    const rgba = Buffer.alloc(pixels * 4);
    let corrected = 0;
    for (let p = 0; p < pixels; p++) {
        const i = p * 3, j = p * 4;
        if (core[p]) {
            rgba[j] = rgb[i]; rgba[j + 1] = rgb[i + 1];
            rgba[j + 2] = rgb[i + 2]; rgba[j + 3] = 255;
            continue;
        }
        if (distance[p] <= 20) continue;
        const x = p % width, y = Math.floor(p / width);
        let nearest = -1, nearestDistance = Infinity;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
            const nx = x + dx, ny = y + dy, squared = dx * dx + dy * dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height
                || squared > 9 || squared >= nearestDistance) continue;
            const candidate = ny * width + nx;
            if (!core[candidate]) continue;
            nearest = candidate; nearestDistance = squared;
        }
        if (nearest < 0) continue;

        // Reconstruct edge color from nearby foreground to avoid amplified WebP chroma noise.
        const fi = nearest * 3;
        let numerator = 0, denominator = 0;
        for (let c = 0; c < 3; c++) {
            const direction = rgb[fi + c] - key[c];
            numerator += (rgb[i + c] - key[c]) * direction;
            denominator += direction * direction;
        }
        const alpha = clamp(numerator / Math.max(1, denominator), 0, 1);
        if (alpha < 0.08) continue;
        for (let c = 0; c < 3; c++) {
            rgba[j + c] = rgb[fi + c];
        }
        rgba[j + 3] = Math.round(alpha * 255);
        corrected++;
    }
    const removedSpecks = clearTinyComponents(rgba, width, height);
    return { rgba, corrected_edge_pixels: corrected, removed_speck_pixels: removedSpecks };
}

function svg(width, height, text) {
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
        + `<g font-family="Microsoft YaHei, sans-serif">${text.join("")}</g></svg>`);
}

async function qualityFrame(quality) {
    const filename = path.join(root, `assets/ui/atlas/module/inventory/quality-${quality}.png`);
    const metadata = await sharp(filename).metadata(), pieces = [];
    const xs = [0, 8, metadata.width - 8], ys = [0, 8, metadata.height - 8];
    const widths = [8, metadata.width - 16, 8], heights = [8, metadata.height - 16, 8];
    const sizes = [8, 96, 8], offsets = [0, 8, 104];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        pieces.push({ input: await sharp(filename).extract({
            left: xs[col], top: ys[row], width: widths[col], height: heights[row],
        }).resize(sizes[col], sizes[row]).png().toBuffer(), left: offsets[col], top: offsets[row] });
    }
    return sharp({ create: { width: 112, height: 112, channels: 4, background: "#00000000" } })
        .composite(pieces).png().toBuffer();
}

async function previews() {
    const atlas = [], width = 1008, height = 760, layers = [], text = [];
    const backgrounds = ["#eeeeee", "#292d30"];
    const qualityNames = ["普通", "优秀", "精良", "稀有", "史诗", "传说"];
    for (let theme = 0; theme < 2; theme++) {
        const top = theme * 380, color = theme ? "#f0f0f0" : "#222222";
        layers.push({ input: await sharp({ create: {
            width, height: 380, channels: 4, background: backgrounds[theme],
        } }).png().toBuffer(), left: 0, top });
        text.push(`<text x="24" y="${top + 29}" font-size="18" fill="${color}">`
            + `${theme ? "深色" : "浅色"}背景检查  112×112 原尺寸</text>`);
        for (const asset of assets) {
            const variant = asset.index % 2, x = 24 + (asset.quality - 1) * 164;
            const y = top + 65 + variant * 150;
            if (!variant) text.push(`<text x="${x + 56}" y="${top + 53}" `
                + `font-size="14" fill="${color}" text-anchor="middle">${qualityNames[asset.quality - 1]}</text>`);
            layers.push({ input: path.join(runtime, asset.filename), left: x, top: y });
            text.push(`<text x="${x + 56}" y="${y + 131}" font-size="13" `
                + `fill="${color}" text-anchor="middle">${asset.name}</text>`);
            if (theme === 0) atlas.push({ input: path.join(runtime, asset.filename),
                left: (asset.index % 4) * 112, top: Math.floor(asset.index / 4) * 112 });
        }
    }
    await sharp({ create: { width, height, channels: 4, background: "#00000000" } })
        .composite([...layers, { input: svg(width, height, text), left: 0, top: 0 }])
        .png().toFile(path.join(output, "transparency-check.png"));
    await sharp({ create: { width: 448, height: 336, channels: 4, background: "#00000000" } })
        .composite(atlas).png().toFile(path.join(output, "naxu-icons-atlas.png"));

    const frames = [], labels = [];
    for (const asset of assets) {
        const x = 24 + (asset.quality - 1) * 164, y = 64 + (asset.index % 2) * 154;
        frames.push({ input: await qualityFrame(asset.quality), left: x, top: y },
            { input: path.join(runtime, asset.filename), left: x, top: y });
        labels.push(`<text x="${x + 56}" y="${y + 134}" font-size="13" `
            + `text-anchor="middle" fill="#e0e0e0">${asset.name}</text>`);
        if (asset.index % 2 === 0) labels.push(`<text x="${x + 56}" y="48" font-size="14" `
            + `text-anchor="middle" fill="#e0e0e0">${qualityNames[asset.quality - 1]}</text>`);
    }
    labels.push('<text x="24" y="25" font-size="18" fill="#eeeeee">纳虚器第三批  品质框组合预览</text>');
    await sharp({ create: { width, height: 380, channels: 4, background: "#24292c" } })
        .composite([...frames, { input: svg(width, 380, labels), left: 0, top: 0 }])
        .png().toFile(path.join(output, "preview.png"));
}

async function main() {
    const previous = snapshotExistingBatches(), sourceBytes = fs.readFileSync(source);
    const sourceHash = hash(sourceBytes), metadata = await sharp(sourceBytes).metadata();
    assert.deepEqual([metadata.width, metadata.height], [768, 429], "Unexpected source sheet size");
    for (const folder of ["rgba", "112", "crops"]) {
        fs.mkdirSync(path.join(output, folder), { recursive: true });
    }
    fs.mkdirSync(runtime, { recursive: true });
    const sourcePath = path.join(output, "source.webp");
    if (fs.existsSync(sourcePath)) assert.equal(hash(fs.readFileSync(sourcePath)), sourceHash);
    else fs.copyFileSync(source, sourcePath);
    const reports = [];
    for (const asset of assets) {
        const col = asset.index % 4, row = Math.floor(asset.index / 4);
        const crop = { left: columns[col], top: rows[row],
            width: columns[col + 1] - columns[col], height: rows[row + 1] - rows[row] };
        if (asset.index === 5) {
            crop.top = 145;
            crop.height = 144;
        }
        if (asset.index === 8 || asset.index === 11) {
            crop.top = 279;
            crop.height = 150;
        }
        const { data, info } = await sharp(sourceBytes).extract(crop).removeAlpha().raw()
            .toBuffer({ resolveWithObject: true });
        const extracted = removeBurgundy(data, info.width, info.height);
        const bounds = alphaBounds(extracted.rgba, info.width, info.height);
        assert.ok(bounds.left > 0 && bounds.top > 0
            && bounds.left + bounds.width < info.width
            && bounds.top + bounds.height < info.height, `${asset.filename}: crop cuts the icon`);
        const rectangle = { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
        await sharp(data, { raw: info }).png().toFile(path.join(output, "crops", asset.filename));
        const trimmed = await sharp(extracted.rgba, {
            raw: { width: info.width, height: info.height, channels: 4 },
        }).extract(rectangle).png().toBuffer();
        await sharp(trimmed).extend({
            top: 8, bottom: 8, left: 8, right: 8, background: "#00000000",
        }).png().toFile(path.join(output, "rgba", asset.filename));
        const subject = await sharp(trimmed).resize(96, 96, {
            fit: "inside", kernel: "lanczos3",
        }).png().toBuffer();
        const subjectSize = await sharp(subject).metadata();
        const final = await sharp({ create: {
            width: 112, height: 112, channels: 4, background: "#00000000",
        } }).composite([{ input: subject, left: Math.floor((112 - subjectSize.width) / 2),
            top: Math.floor((112 - subjectSize.height) / 2) }]).png().toBuffer();
        const finalPath = path.join(runtime, asset.filename), metaPath = finalPath + ".meta";
        if (fs.existsSync(finalPath)) {
            const unchanged = hash(fs.readFileSync(finalPath)) === hash(final);
            assert.ok(unchanged || refresh, `Refusing to replace a different image: ${finalPath}`);
            if (!unchanged) fs.writeFileSync(finalPath, final);
        } else fs.writeFileSync(finalPath, final);
        fs.writeFileSync(path.join(output, "112", asset.filename), final);
        const previousMeta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : {};
        const meta = { ...previousMeta, uuid: previousMeta.uuid || crypto.randomUUID(),
            importer: { ...previousMeta.importer, textureType: 2, sRGB: true, premultiplyAlpha: true } };
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");

        const finalRaw = await sharp(final).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const visible = alphaBounds(finalRaw.data, 112, 112);
        assert.deepEqual([finalRaw.info.width, finalRaw.info.height, finalRaw.info.channels], [112, 112, 4]);
        assert.ok(visible.left >= 8 && visible.top >= 8
            && visible.left + visible.width <= 104 && visible.top + visible.height <= 104,
        `${asset.filename}: insufficient transparent padding`);
        assert.ok(visible.transparent_pixels > 2000);
        assert.ok(visible.partial_pixels > 0, "Missing antialiased edges");
        reports.push({ ...asset, crop, source_subject_bounds: rectangle,
            source_size: [info.width, info.height],
            corrected_edge_pixels: extracted.corrected_edge_pixels,
            removed_speck_pixels: extracted.removed_speck_pixels,
            runtime_path: relative(finalPath), uuid: meta.uuid, size: [112, 112],
            alpha_bounds: visible, sha256: hash(final) });
    }
    assert.equal(new Set(reports.map(record => record.uuid)).size, 12, "Duplicate image UUID");
    for (const [filename, before] of previous) {
        assert.equal(hash(fs.readFileSync(filename)), before, `Changed existing asset: ${filename}`);
    }
    assert.equal(hash(fs.readFileSync(source)), sourceHash, "Changed source sheet");

    // The ring hole is background; mirror and pearl centers must remain solid.
    const probes = [
        { index: 7, point: [671, 235], transparent: true, label: "ring-hole" },
        { index: 9, point: [286, 355], transparent: false, label: "mirror-center" },
        { index: 10, point: [485, 350], transparent: false, label: "pearl-core" },
    ];
    for (const probe of probes) {
        const report = reports[probe.index], [x, y] = probe.point;
        const { data, info } = await sharp(sourceBytes).extract(report.crop).removeAlpha().raw()
            .toBuffer({ resolveWithObject: true });
        const result = removeBurgundy(data, info.width, info.height);
        const alpha = result.rgba[((y - report.crop.top) * info.width + x - report.crop.left) * 4 + 3];
        assert.equal(alpha, probe.transparent ? 0 : 255, `Failed alpha probe: ${probe.label}`);
        probe.alpha = alpha;
    }
    await previews();
    const manifest = {
        method: "Local cropping and burgundy matte removal; no image-generation API",
        source: relative(source), source_sha256: sourceHash, source_size: [768, 429],
        source_background_rgb: key, source_has_alpha: false,
        matte_method: "Burgundy chroma classification; local edge coverage and foreground-color reconstruction",
        runtime_directory: relative(runtime), count: reports.length, final_size: [112, 112],
        minimum_padding: 8, quality_frame_baked: false, quality_values_are_art_hints_only: true,
        config_tables_changed: false, save_data_changed: false,
        previous_batches_unchanged: true, alpha_probes: probes, files: reports,
    };
    fs.writeFileSync(path.join(output, "sheet-extraction.json"), JSON.stringify(manifest, null, 2) + "\n");
    console.log(JSON.stringify({ completed: reports.length, runtime: relative(runtime),
        source_preserved: true, old_batch_files_verified: previous.size, alpha_probes: probes,
        files: reports.map(record => ({ file: record.filename, bounds: record.alpha_bounds })) }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
