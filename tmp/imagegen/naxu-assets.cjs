const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
const sharp = require(path.join(root, "node_modules/sharp"));
const specPath = path.join(root, "art/reference/naxu-icons/prompts.json");
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const output = path.join(root, "output/imagegen/naxu-icons");
const folders = ["raw", "rgba", "112"];
for (const folder of folders) fs.mkdirSync(path.join(output, folder), { recursive: true });

function prepare() {
    const common = spec.common_prompt.split("\n")
        .filter(line => !line.startsWith("Scene/backdrop:"))
        .join("\n")
        .replace("matching the provided style reference:", "with the established visual direction:")
        .replace("Preserve true transparency when saving.",
            "The temporary production key background will be converted locally to true transparency.");
    const jobs = spec.assets.map(asset => {
        const key = asset.quality === 2 ? "#FF00FF" : "#00FF00";
        const prompt = [
            common,
            `Subject: ${asset.subject}`,
            `Production backdrop: perfectly flat, completely uniform ${key} chroma-key background, `
                + "including all negative spaces inside the ring. This is a temporary removable matte, "
                + "not part of the icon. No background texture, gradients, floor, shadows or checkerboard. "
                + "No key-color highlights or reflections on the subject. Keep all object colors distinct "
                + "from the key. Sharp clean silhouette, fully opaque object materials.",
        ].join("\n");
        return { prompt, out: asset.output_filename, model: "gpt-image-2", n: 1,
            size: "1024x1024", quality: "medium", background: "opaque", output_format: "png" };
    });
    for (const [name, group] of [["pilot", jobs.slice(0, 1)], ["remaining", jobs.slice(1)], ["all", jobs]]) {
        fs.writeFileSync(path.join(__dirname, `naxu-${name}.jsonl`),
            group.map(job => JSON.stringify(job)).join("\n") + "\n");
    }
    fs.writeFileSync(path.join(output, "generation-prompts.json"), JSON.stringify({
        method: "imagegen bundled CLI API fallback",
        prompt_revision: spec.prompt_revision,
        model: "gpt-image-2",
        transparency_method: "chroma key removal, then RGBA export",
        jobs,
    }, null, 2) + "\n");
    console.log(JSON.stringify({ jobs: jobs.length, pilot: jobs[0].out, output }, null, 2));
}

function bounds(data, width, height, channels, threshold = 0) {
    let minX = width, minY = height, maxX = -1, maxY = -1;
    let transparent = 0, partial = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * channels + 3];
        if (alpha === 0) transparent++;
        else if (alpha < 255) partial++;
        if (alpha > threshold) {
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
    }
    assert.ok(maxX >= minX && maxY >= minY, "Image has no visible subject");
    return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1,
        transparent, partial };
}

async function exportIcons() {
    const reports = [];
    for (const asset of spec.assets) {
        const source = path.join(output, "rgba", asset.output_filename);
        if (!fs.existsSync(source)) continue;
        const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        for (let i = 3; i < data.length; i += 4) if (data[i] < 8) data[i] = 0;
        const box = bounds(data, info.width, info.height, info.channels);
        const subject = await sharp(data, { raw: info })
            .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
            .resize(96, 96, { fit: "inside", kernel: "lanczos3" }).png().toBuffer();
        const metadata = await sharp(subject).metadata();
        const destination = path.join(output, "112", asset.output_filename);
        await sharp({ create: { width: 112, height: 112, channels: 4, background: "#00000000" } })
            .composite([{ input: subject, left: Math.floor((112 - metadata.width) / 2),
                top: Math.floor((112 - metadata.height) / 2) }])
            .png().toFile(destination);
        const final = await sharp(destination).raw().toBuffer({ resolveWithObject: true });
        const actual = bounds(final.data, 112, 112, 4);
        assert.equal(final.info.width, 112);
        assert.equal(final.info.height, 112);
        assert.equal(final.info.channels, 4);
        assert.ok(actual.left >= 8 && actual.top >= 8, `${asset.id}: insufficient padding`);
        assert.ok(actual.left + actual.width <= 104 && actual.top + actual.height <= 104,
            `${asset.id}: subject exceeds safety margin`);
        assert.ok(actual.transparent > 2000, `${asset.id}: alpha background missing`);
        reports.push({ id: asset.id, name: asset.suggested_name, quality: asset.quality,
            family: asset.family, file: `112/${asset.output_filename}`, size: [112, 112],
            visible_bounds: actual, sha256: require("node:crypto")
                .createHash("sha256").update(fs.readFileSync(destination)).digest("hex") });
    }
    fs.writeFileSync(path.join(output, "validation.json"), JSON.stringify({
        expected: 12, completed: reports.length, files: reports,
    }, null, 2) + "\n");
    console.log(JSON.stringify({ completed: reports.length, files: reports.map(report => report.file) }, null, 2));
}

async function nineSliceFrame(quality) {
    const filename = path.join(root, `assets/ui/atlas/module/inventory/quality-${quality}.png`);
    const meta = await sharp(filename).metadata();
    const xs = [0, 8, meta.width - 8], ys = [0, 8, meta.height - 8];
    const ws = [8, meta.width - 16, 8], hs = [8, meta.height - 16, 8];
    const ds = [8, 96, 8], offsets = [0, 8, 104], pieces = [];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        const input = await sharp(filename).extract({ left: xs[col], top: ys[row],
            width: ws[col], height: hs[row] }).resize(ds[col], ds[row]).png().toBuffer();
        pieces.push({ input, left: offsets[col], top: offsets[row] });
    }
    return sharp({ create: { width: 112, height: 112, channels: 4, background: "#00000000" } })
        .composite(pieces).png().toBuffer();
}

async function preview() {
    const width = 1008, height = 420, placements = [], text = [];
    const colors = ["#e5e7eb", "#78c98e", "#78c4f0", "#ba9beb", "#f1cc62", "#f08383"];
    const names = ["普通", "优秀", "精良", "稀有", "史诗", "传说"];
    text.push(`<text x="24" y="34" font-size="22" fill="#edf0ef">纳虚器 · 六档品质</text>`);
    text.push(`<text x="984" y="33" text-anchor="end" font-size="14" fill="#abb5b3">112×112 · 2×2 格</text>`);
    const atlas = [];
    for (const [row, label] of ["提案一", "提案二"].entries()) {
        const y = 88 + row * 158;
        text.push(`<text x="24" y="${y + 62}" font-size="17" fill="#c9d2ce">${label}</text>`);
        for (let quality = 1; quality <= 6; quality++) {
            const candidates = spec.assets.filter(item => item.quality === quality);
            assert.equal(candidates.length, 2, `Expected two proposals for quality ${quality}`);
            const asset = candidates[row];
            const filename = path.join(output, "112", asset.output_filename);
            assert.ok(fs.existsSync(filename), `Missing icon ${asset.id}`);
            const x = 112 + (quality - 1) * 148;
            if (row === 0) text.push(`<text x="${x + 56}" y="70" text-anchor="middle" `
                + `font-size="15" fill="${colors[quality - 1]}">${names[quality - 1]}</text>`);
            placements.push({ input: await nineSliceFrame(quality), left: x, top: y });
            placements.push({ input: filename, left: x, top: y });
            text.push(`<text x="${x + 56}" y="${y + 134}" text-anchor="middle" `
                + `font-size="13" fill="#c0c9c6">${asset.suggested_name}</text>`);
            atlas.push({ input: filename, left: (quality - 1) * 112, top: row * 112 });
        }
    }
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
        + `<g font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif">${text.join("")}</g></svg>`);
    placements.push({ input: svg, left: 0, top: 0 });
    await sharp({ create: { width, height, channels: 4, background: "#232a2c" } })
        .composite(placements).png().toFile(path.join(output, "preview.png"));
    await sharp({ create: { width: 672, height: 224, channels: 4, background: "#00000000" } })
        .composite(atlas).png().toFile(path.join(output, "naxu-icons-atlas.png"));
    console.log(JSON.stringify({ preview: path.join(output, "preview.png"),
        atlas: path.join(output, "naxu-icons-atlas.png") }, null, 2));
}

(async () => {
    const command = process.argv[2];
    if (command === "prepare") prepare();
    else if (command === "export") await exportIcons();
    else if (command === "preview") await preview();
    else throw new Error("Expected prepare, export or preview");
})().catch(error => { console.error(error); process.exitCode = 1; });
