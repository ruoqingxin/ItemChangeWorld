const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "../..");
const sharp = require(path.join(root, "node_modules/sharp"));
const output = path.join(root, "output/imagegen/naxu-icons-v2");
const columns = [0, 350, 651, 1029, 1369, 1708, 2048];
const rows = [[110, 572], [579, 1035]];
const assets = [
    ["pouch", 1, 0, 0, "素麻纳虚囊"],
    ["box", 1, 1, 0, "灰木纳虚匣"],
    ["gourd", 2, 0, 1, "青藤纳虚葫"],
    ["jade-box", 2, 1, 1, "青玉纳虚盒"],
    ["chest", 3, 0, 2, "玄铁纳虚匣"],
    ["cauldron", 3, 1, 2, "青铜纳虚鼎"],
    ["casket", 4, 0, 3, "紫阙纳虚匣"],
    ["gourd", 4, 1, 3, "紫玉纳虚葫"],
    ["orb", 5, 0, 4, "金阙纳虚仪"],
    ["mirror", 5, 1, 4, "金阙纳虚镜"],
    ["orb", 6, 0, 5, "赤霄纳虚珠"],
    ["cauldron", 6, 1, 5, "赤霄纳虚鼎"],
].map(([family, quality, row, column, name]) => ({
    id: `naxu-${family}-q${quality}`, family, quality, row, column, name,
    filename: `naxu-${family}-q${quality}.png`,
}));
const qualityNames = ["普通", "优秀", "精良", "稀有", "史诗", "传说"];
const colors = ["#e5e7eb", "#78c98e", "#78c4f0", "#ba9beb", "#f1cc62", "#f08383"];
const hash = buffer => crypto.createHash("sha256").update(buffer).digest("hex");

function bounds(data, width, height) {
    let left = width, top = height, right = -1, bottom = -1, transparent = 0, partial = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (!alpha) { transparent++; continue; }
        if (alpha < 255) partial++;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    assert.ok(right >= left && bottom >= top, "No visible icon in crop");
    return { left, top, width: right - left + 1, height: bottom - top + 1, transparent, partial };
}

function components(data, width, height) {
    const seen = new Uint8Array(width * height), queue = new Int32Array(width * height), sizes = [];
    for (let p = 0; p < seen.length; p++) {
        if (seen[p] || data[p * 4 + 3] === 0) continue;
        let head = 0, tail = 1; queue[0] = p; seen[p] = 1;
        while (head < tail) {
            const z = queue[head++], x = z % width, y = Math.floor(z / width);
            for (const next of [x > 0 ? z - 1 : -1, x < width - 1 ? z + 1 : -1,
                y > 0 ? z - width : -1, y < height - 1 ? z + width : -1]) {
                if (next >= 0 && !seen[next] && data[next * 4 + 3]) {
                    seen[next] = 1; queue[tail++] = next;
                }
            }
        }
        if (tail >= 4) sizes.push(tail);
    }
    return sizes.sort((a, b) => b - a);
}

async function qualityFrame(quality) {
    const filename = path.join(root, `assets/ui/atlas/module/inventory/quality-${quality}.png`);
    const metadata = await sharp(filename).metadata();
    const xs = [0, 8, metadata.width - 8], ys = [0, 8, metadata.height - 8];
    const widths = [8, metadata.width - 16, 8], heights = [8, metadata.height - 16, 8];
    const sizes = [8, 96, 8], offsets = [0, 8, 104], pieces = [];
    for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
        const input = await sharp(filename).extract({
            left: xs[column], top: ys[row], width: widths[column], height: heights[row],
        }).resize(sizes[column], sizes[row]).png().toBuffer();
        pieces.push({ input, left: offsets[column], top: offsets[row] });
    }
    return sharp({ create: { width: 112, height: 112, channels: 4, background: "#00000000" } })
        .composite(pieces).png().toBuffer();
}

function labelsSvg(width, height, labels) {
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
        + `<g font-family="Microsoft YaHei, sans-serif">${labels.join("")}</g></svg>`);
}

async function previews() {
    const width = 1008, height = 390, placements = [], labels = [], atlas = [];
    labels.push('<text x="24" y="30" font-size="20" fill="#edf0ef">纳虚器 · 第二批</text>');
    labels.push('<text x="984" y="30" text-anchor="end" font-size="14" fill="#abb5b3">112×112 · 2×2 格</text>');
    for (let quality = 1; quality <= 6; quality++) {
        const x = 24 + (quality - 1) * 164, frame = await qualityFrame(quality);
        labels.push(`<text x="${x + 56}" y="59" font-size="15" text-anchor="middle" `
            + `fill="${colors[quality - 1]}">${qualityNames[quality - 1]}</text>`);
        for (const asset of assets.filter(item => item.quality === quality)) {
            const y = 72 + asset.row * 151, filename = path.join(output, "112", asset.filename);
            placements.push({ input: frame, left: x, top: y }, { input: filename, left: x, top: y });
            labels.push(`<text x="${x + 56}" y="${y + 133}" font-size="13" text-anchor="middle" `
                + `fill="#d3d7d6">${asset.name}</text>`);
            atlas.push({ input: filename, left: (quality - 1) * 112, top: asset.row * 112 });
        }
    }
    await sharp({ create: { width, height, channels: 4, background: "#232a2c" } })
        .composite([...placements, { input: labelsSvg(width, height, labels), left: 0, top: 0 }])
        .png().toFile(path.join(output, "preview.png"));
    await sharp({ create: { width: 672, height: 224, channels: 4, background: "#00000000" } })
        .composite(atlas).png().toFile(path.join(output, "naxu-icons-atlas.png"));

    const checkHeight = 720, background = Buffer.alloc(width * checkHeight * 3);
    for (let y = 0; y < checkHeight; y++) for (let x = 0; x < width; x++) {
        const light = y < 360, alternate = (Math.floor(x / 8) + Math.floor(y / 8)) % 2;
        const value = light ? (alternate ? 236 : 250) : (alternate ? 57 : 43);
        const p = (y * width + x) * 3;
        background[p] = value; background[p + 1] = value; background[p + 2] = value;
    }
    const checks = [], checkLabels = [];
    for (let theme = 0; theme < 2; theme++) {
        const textColor = theme ? "#f0f0f0" : "#222222";
        checkLabels.push(`<text x="18" y="${theme * 360 + 26}" fill="${textColor}" font-size="18">`
            + `${theme ? "深色" : "浅色"}透明检查 · 112×112 原尺寸</text>`);
        for (const asset of assets) {
            const x = 24 + (asset.quality - 1) * 164, y = theme * 360 + 45 + asset.row * 156;
            checks.push({ input: path.join(output, "112", asset.filename), left: x, top: y });
            checkLabels.push(`<text x="${x + 56}" y="${y + 134}" fill="${textColor}" `
                + `font-size="13" text-anchor="middle">${asset.name}</text>`);
        }
    }
    await sharp(background, { raw: { width, height: checkHeight, channels: 3 } })
        .composite([...checks, { input: labelsSvg(width, checkHeight, checkLabels), left: 0, top: 0 }])
        .png().toFile(path.join(output, "transparency-check.png"));
}

(async () => {
    const source = process.argv[2];
    assert.ok(source && fs.existsSync(source), "Pass the source PNG path");
    const sourceBytes = fs.readFileSync(source), sourceHash = hash(sourceBytes);
    const metadata = await sharp(sourceBytes).metadata();
    assert.deepEqual([metadata.width, metadata.height], [2736, 1536]);
    assert.ok(metadata.hasAlpha, "Expected existing source alpha channel");
    const archived = path.join(root, "art/reference/naxu-icons/source", path.basename(source));
    fs.mkdirSync(path.dirname(archived), { recursive: true });
    if (fs.existsSync(archived)) assert.equal(hash(fs.readFileSync(archived)), sourceHash);
    else fs.copyFileSync(source, archived);
    for (const folder of ["112", "rgba"]) fs.mkdirSync(path.join(output, folder), { recursive: true });

    const reports = [];
    for (const asset of assets) {
        const left = Math.round(columns[asset.column] * metadata.width / 2048);
        const right = Math.round(columns[asset.column + 1] * metadata.width / 2048);
        const top = Math.round(rows[asset.row][0] * metadata.height / 1152);
        const bottom = Math.round(rows[asset.row][1] * metadata.height / 1152);
        const crop = { left, top, width: right - left, height: bottom - top };
        const { data, info } = await sharp(sourceBytes).extract(crop).ensureAlpha().raw()
            .toBuffer({ resolveWithObject: true });
        // Preserve the supplied matte and RGB; clear only nearly invisible alpha residue.
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] <= 8) data.fill(0, i, i + 4);
        }
        const object = bounds(data, info.width, info.height);
        assert.ok(object.left > 0 && object.top > 0
            && object.left + object.width < info.width && object.top + object.height < info.height,
        `${asset.id}: source crop cuts a visible component`);
        const objectRectangle = { left: object.left, top: object.top, width: object.width, height: object.height };
        const fullResolution = await sharp(data, { raw: info }).extract(objectRectangle)
            .extend({ top: 8, bottom: 8, left: 8, right: 8, background: "#00000000" })
            .png().toBuffer();
        fs.writeFileSync(path.join(output, "rgba", asset.filename), fullResolution);
        const resized = await sharp(data, { raw: info }).extract(objectRectangle)
            .resize(96, 96, { fit: "inside", kernel: "lanczos3" }).png().toBuffer();
        const resizedMetadata = await sharp(resized).metadata();
        const finalPath = path.join(output, "112", asset.filename);
        await sharp({ create: { width: 112, height: 112, channels: 4, background: "#00000000" } })
            .composite([{ input: resized, left: Math.floor((112 - resizedMetadata.width) / 2),
                top: Math.floor((112 - resizedMetadata.height) / 2) }]).png().toFile(finalPath);
        const final = await sharp(finalPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const visible = bounds(final.data, 112, 112);
        assert.deepEqual([final.info.width, final.info.height, final.info.channels], [112, 112, 4]);
        assert.ok(visible.left >= 8 && visible.top >= 8
            && visible.left + visible.width <= 104 && visible.top + visible.height <= 104);
        assert.ok(visible.transparent > 2000);
        const componentSizes = components(final.data, 112, 112);
        if (asset.quality >= 5) assert.ok(componentSizes.length >= 2, `${asset.id}: missing floating parts`);
        reports.push({ ...asset, source_crop: crop, source_object_bounds: objectRectangle,
            source_component_sizes: components(data, info.width, info.height),
            full_resolution_file: `rgba/${asset.filename}`, final_file: `112/${asset.filename}`,
            size: [112, 112], visible_bounds: visible, final_component_sizes: componentSizes,
            sha256: hash(fs.readFileSync(finalPath)) });
    }
    await previews();
    const manifest = {
        method: "Local cropping using the existing source alpha; no image-generation API",
        source: path.relative(root, archived).replaceAll("\\", "/"), source_sha256: sourceHash,
        source_size: [metadata.width, metadata.height], source_alpha_preserved: true,
        alpha_cleanup: "Alpha values <= 8 cleared; other RGB and alpha values preserved before resizing",
        count: reports.length, final_size: [112, 112], grid_cells: [2, 2], grid_pitch: 56,
        minimum_padding: 8, quality_frame_baked: false, names_are_art_proposals: true, files: reports,
    };
    fs.writeFileSync(path.join(output, "sheet-extraction.json"), JSON.stringify(manifest, null, 2) + "\n");
    fs.writeFileSync(path.join(output, "validation.json"), JSON.stringify({
        expected: 12, completed: reports.length, files: reports.map(record => ({
            id: record.id, name: record.name, quality: record.quality, file: record.final_file,
            size: record.size, visible_bounds: record.visible_bounds,
            components: record.final_component_sizes, sha256: record.sha256,
        })),
    }, null, 2) + "\n");
    console.log(JSON.stringify({ completed: reports.length, original_preserved: archived,
        final_icons: path.join(output, "112"), preview: path.join(output, "preview.png"),
        component_counts: reports.map(record => ({ id: record.id, count: record.final_component_sizes.length })) }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
