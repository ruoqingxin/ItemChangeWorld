const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const sharp = require("sharp");
const { componentBounds } = require("./map-node-art-bounds.cjs");

const root = path.resolve(__dirname, "..");
const reference = path.join(root, "art/reference/expedition/map-unified-2026-11-12");
const output = path.join(root, "tmp/map-unified");
const reportFile = path.join(reference, "import.json");
const art = "assets/ui/atlas/module/expedition/handpainted/";
const nodeArt = "assets/ui/image/expeditionNodes/";
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const supplied = {
    panels: "_cosres_apps-ai-tools_nextimage_storage_out_user_2682_1794480133691_2b856492b6c6476887d90a106ea928f0.png",
    nodes: "_cosres_apps-ai-tools_nextimage_storage_out_user_2682_1794480342920_1903cfa61192491f8a1471150b0439bf.png",
    icons: "_cosres_apps-ai-tools_nextimage_storage_out_user_2682_1794480554637_60e9da4de4604360b387e9e293aa7970.png",
    atmosphere: "_cosres_apps-ai-tools_nextimage_storage_out_user_2682_1794483208680_ef37f8c0fe7740aaa15961c75cccd655.png",
};
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const relative = file => path.relative(root, file).replaceAll("\\", "/");
const records = [];
const priorReport = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, "utf8")) : null;
const sources = {};
const nativeCuts = new Map();
const nodeFits = {
    start: [216, 216], transit: [232, 124],
    "enemy-normal": [156, 156], "enemy-elite": [192, 192], "enemy-boss": [218, 218],
    search: [242, 190], supply: [238, 200], recovery: [228, 210],
    borrow: [216, 216], insight: [224, 216], extract: [204, 216], "battle-loot": [226, 210],
};

async function raw(bytes) {
    return sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
function bounds(data, width, height, threshold = 16) {
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] < threshold) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    assert.ok(right >= left && bottom >= top, "A crop must contain visible artwork");
    return { left, top, width: right - left + 1, height: bottom - top + 1 };
}
async function clean(bytes, processPixel) {
    const { data, info } = await raw(bytes);
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        const at = (y * info.width + x) * 4;
        if (data[at + 3] < 8) { data.fill(0, at, at + 4); continue; }
        data[at + 3] = Math.min(255, Math.round(data[at + 3] * 255 / 253));
        if (processPixel) processPixel(data, at, x / info.width, y / info.height);
    }
    return sharp(data, { raw: info }).png().toBuffer();
}
async function cut(sheet, rectangle) {
    const m = await sharp(sources[sheet]).metadata();
    const [x, y, w, h] = rectangle, sx = m.width / 2048, sy = m.height / 1143;
    const rect = { left: Math.round(x * sx), top: Math.round(y * sy),
        width: Math.round(w * sx), height: Math.round(h * sy) };
    rect.width = Math.min(rect.width, m.width - rect.left);
    rect.height = Math.min(rect.height, m.height - rect.top);
    const bytes = await clean(await sharp(sources[sheet]).extract(rect).png().toBuffer());
    const probe = await raw(bytes), box = bounds(probe.data, probe.info.width, probe.info.height);
    assert.ok(box.left > 0 && box.top > 0 && box.left + box.width < probe.info.width &&
        box.top + box.height < probe.info.height, `${sheet}: crop clips artwork at ${rectangle}`);
    return sharp(bytes).extract(box).png().toBuffer();
}
async function cell(sheet, index, rows = 3) {
    return cut(sheet, [(index % 4) * 512, Math.floor(index / 4) * 1143 / rows, 512, 1143 / rows]);
}
async function canvas(bytes, width, height, maxWidth = width - 12, maxHeight = height - 12, bottom) {
    const image = await sharp(bytes).resize(maxWidth, maxHeight, { fit: "inside", kernel: "lanczos3" })
        .png().toBuffer();
    const m = await sharp(image).metadata();
    assert.ok(bottom === undefined || bottom >= m.height);
    return sharp({ create: { width, height, channels: 4, background: transparent } })
        .composite([{ input: image, left: Math.round((width - m.width) / 2),
            top: bottom === undefined ? Math.round((height - m.height) / 2) : bottom - m.height }])
        .png().toBuffer();
}
async function alignedNode(data, info, name, body) {
    const visible = bounds(data, info.width, info.height, 8);
    const [maxWidth, maxHeight] = nodeFits[name];
    const scale = Math.min(maxWidth / body.width, maxHeight / body.height,
        240 / visible.width, 224 / visible.height);
    const cropped = await sharp(data, { raw: info }).extract(visible).png().toBuffer();
    const resized = await sharp(cropped).resize(Math.round(visible.width * scale),
        Math.round(visible.height * scale)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Remove resampling's invisible fringe before setting the shared 16px bottom padding.
    for (let at = 0; at < resized.data.length; at += 4)
        if (resized.data[at + 3] < 8) resized.data.fill(0, at, at + 4);
    const finalBounds = bounds(resized.data, resized.info.width, resized.info.height, 8);
    const image = await sharp(resized.data, { raw: resized.info }).extract(finalBounds).png().toBuffer();
    return canvas(image, 256, 256, finalBounds.width, finalBounds.height, 240);
}
async function nineSlice(bytes, width, height, grid) {
    const m = await sharp(bytes).metadata();
    const [top, right, bottom, left] = grid;
    const ix = [0, left, m.width - right, m.width], iy = [0, top, m.height - bottom, m.height];
    const ox = [0, left, width - right, width], oy = [0, top, height - bottom, height];
    assert.ok(m.width > left + right && m.height > top + bottom && width > left + right && height > top + bottom);
    const layers = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
        const input = await sharp(bytes).extract({ left: ix[x], top: iy[y],
            width: ix[x + 1] - ix[x], height: iy[y + 1] - iy[y] })
            .resize(ox[x + 1] - ox[x], oy[y + 1] - oy[y], { fit: "fill" }).png().toBuffer();
        layers.push({ input, left: ox[x], top: oy[y] });
    }
    return sharp({ create: { width, height, channels: 4, background: transparent } })
        .composite(layers).png().toBuffer();
}
function oldGold(data, at) {
    const r = data[at], g = data[at + 1], b = data[at + 2];
    if (r < 85 || r < g * 0.95 || g < b * 1.15) return;
    const gray = r * 0.2126 + g * 0.7152 + b * 0.0722;
    for (let c = 0; c < 3; c++) data[at + c] = Math.round((data[at + c] * 0.76 + gray * 0.24) * 0.92);
}
async function save(name, bytes, origin, options = {}) {
    const file = path.join(root, options.node ? nodeArt : art, `${name}.png`);
    if (process.argv.includes("--nodes-only") &&
        !(options.node && !name.startsWith("clean/") || name === "map-transit-stone")) {
        const previous = priorReport?.files.find(record => record.file === relative(file));
        assert.ok(previous && fs.existsSync(file), `Preserved asset must already exist: ${name}`);
        records.push({ ...previous, sha256: hash(fs.readFileSync(file)) });
        return;
    }
    const metaFile = `${file}.meta`;
    const previous = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : {};
    const metadata = { ...previous, uuid: previous.uuid || crypto.randomUUID(), importer: {
        ...previous.importer, textureType: 2, sRGB: true, premultiplyAlpha: true,
        ...(options.grid ? { sizeGrid: options.grid } : {}),
    } };
    bytes = await clean(bytes);
    const safe = await raw(bytes);
    for (let y = 0; y < safe.info.height; y++) for (let x = 0; x < safe.info.width; x++)
        if (!x || !y || x === safe.info.width - 1 || y === safe.info.height - 1) {
            const at = (y * safe.info.width + x) * 4;
            safe.data.fill(0, at, at + 4);
        }
    bytes = await sharp(safe.data, { raw: safe.info }).png().toBuffer();
    const m = await sharp(bytes).metadata();
    const native = nativeCuts.get(origin);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    if (!fs.existsSync(metaFile) || !isDeepStrictEqual(previous, metadata))
        fs.writeFileSync(metaFile, JSON.stringify(metadata, null, 2) + "\n");
    records.push({ name, file: relative(file), size: [m.width, m.height], sha256: hash(bytes),
        uuid: metadata.uuid, previous_uuid: previous.uuid || null, origin, grid: options.grid || null,
        native_sha256: native ? hash(native) : null });
}
async function panels() {
    const buttonOutlines = new Map();
    const defs = [
        ["map-header-panel", [16, 24, 2016, 150], [1024, 81], [24, 32, 24, 32, 0], 64],
        ["map-player-panel", [24, 262, 555, 260], [300, 122], [24, 24, 24, 24, 0], 122],
        ["map-panel", [590, 175, 493, 445], [96, 96], [18, 18, 18, 18, 0], 144],
        ["map-notice-panel", [1095, 343, 605, 117], [160, 40], [10, 10, 10, 10, 0], 40],
    ];
    const row = [[24, 671, 488, 150], [532, 671, 482, 150], [1034, 671, 485, 150], [1539, 671, 485, 150]];
    const tools = [[224, 878, 226, 225], [681, 878, 226, 225], [1142, 878, 226, 225], [1600, 878, 226, 225]];
    for (const [i, state] of ["normal", "hover", "pressed", "disabled"].entries()) {
        defs.push([`map-button-${state}`, row[i], [128, 48], [10, 10, 10, 10, 0], 46]);
        defs.push([`map-toolbar-${state}`, tools[i], [96, 96], [18, 18, 18, 18, 0], 94]);
    }
    for (const [name, rect, size, grid, baseHeight] of defs) {
        const cutout = await cut("panels", rect);
        nativeCuts.set(name, cutout);
        const toned = await clean(cutout, oldGold);
        const scaled = await sharp(toned).resize({ height: baseHeight - 2 }).extend({
            top: 1, bottom: 1, left: 1, right: 1, background: transparent,
        }).png().toBuffer();
        let image = await nineSlice(scaled, ...size, grid);
        const stem = name.match(/^(map-button|map-toolbar)-/)?.[1];
        if (stem) {
            const probe = await raw(image);
            if (!buttonOutlines.has(stem)) buttonOutlines.set(stem, probe.data);
            const normal = buttonOutlines.get(stem), original = Buffer.from(probe.data);
            // Keep the generated material states, but use one alpha silhouette to prevent edge shimmer.
            for (let y = 0; y < probe.info.height; y++) for (let x = 0; x < probe.info.width; x++) {
                const at = (y * probe.info.width + x) * 4;
                if (normal[at + 3] && original[at + 3] < 8) {
                    let closest = at, alpha = 0;
                    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
                        if (x + dx < 0 || x + dx >= probe.info.width || y + dy < 0 || y + dy >= probe.info.height) continue;
                        const next = ((y + dy) * probe.info.width + x + dx) * 4;
                        if (original[next + 3] > alpha) { closest = next; alpha = original[next + 3]; }
                    }
                    for (let c = 0; c < 3; c++) probe.data[at + c] = alpha ? original[closest + c] : normal[at + c];
                }
                probe.data[at + 3] = normal[at + 3];
            }
            image = await sharp(probe.data, { raw: probe.info }).png().toBuffer();
        }
        await save(name, image, name, { grid });
    }
    const frame = await cut("panels", [1710, 241, 310, 330]);
    nativeCuts.set("map-avatar-frame", frame);
    await save("map-avatar-frame", await canvas(await clean(frame, oldGold), 128, 128, 120, 120), "map-avatar-frame");
}
async function atmosphericNode(index, name, muted = false) {
    const raised = name === "insight" ? 22 : 0;
    const rectangle = {
        left: index % 4 * 688, top: Math.floor(index / 4) * 512 - raised,
        // The insight stone crosses the sheet grid into the bottom of the package cell.
        width: 688, height: name === "search" ? 490 : 512 + raised,
    };
    const cutout = await sharp(sources.atmosphere).extract(rectangle)
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const box = name === "extract" ? { left: 120, top: 16, width: 435, height: 352 } :
        componentBounds(cutout.data, cutout.info.width, cutout.info.height);
    for (let at = 0; at < cutout.data.length; at += 4) {
        const alpha = Math.min(1, cutout.data[at + 3] / 252);
        cutout.data[at + 3] = alpha < 0.035 ? 0 :
            Math.round(255 * Math.pow(alpha, name === "transit" ? 2.6 : 1.6));
        if (!cutout.data[at + 3]) cutout.data.fill(0, at, at + 4);
        if (muted) for (let c = 0; c < 3; c++)
            cutout.data[at + c] = Math.round(cutout.data[at + c] * [0.76, 0.79, 0.72][c]);
    }
    const origin = `atmosphere-${name}${muted ? "-muted" : ""}`;
    nativeCuts.set(origin, await sharp(sources.atmosphere).extract(rectangle).png().toBuffer());
    if (!muted) return { image: await alignedNode(cutout.data, cutout.info, name, box), origin };
    // The existing faint transit underlay has its own authored placement; leave it unchanged.
    const scale = Math.min(208 / box.width, 110 / box.height), foot = 184;
    const width = Math.round(cutout.info.width * scale), height = Math.round(cutout.info.height * scale);
    const left = Math.round((256 - box.width * scale) / 2 - box.left * scale);
    const top = Math.round(foot - (box.top + box.height) * scale);
    const resized = await sharp(cutout.data, { raw: cutout.info }).resize(width, height).png().toBuffer();
    const rect = {
        left: Math.max(0, -left), top: Math.max(0, -top),
        width: Math.min(width, 256 - left) - Math.max(0, -left),
        height: Math.min(height, 256 - top) - Math.max(0, -top),
    };
    const layer = await sharp(resized).extract(rect).png().toBuffer();
    const pixels = await sharp({ create: { width: 256, height: 256, channels: 4, background: transparent } })
        .composite([{ input: layer, left: Math.max(0, left), top: Math.max(0, top) }])
        .raw().toBuffer();
    // Fade only the reserved outer effect margin; the sized subject stays inside it.
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
        const at = (y * 256 + x) * 4, edge = Math.min(x, y, 255 - x, 255 - y);
        pixels[at + 3] = Math.round(pixels[at + 3] * Math.min(1, edge / 8));
        if (!pixels[at + 3]) pixels.fill(0, at, at + 4);
    }
    return { image: await sharp(pixels, { raw: { width: 256, height: 256, channels: 4 } }).png().toBuffer(), origin };
}
async function nodes() {
    const names = ["start", "transit", "enemy-normal", "enemy-elite", "enemy-boss", "search",
        "supply", "recovery", "borrow", "insight", "extract", "battle-loot"];
    for (const [index, name] of names.entries()) {
        let cutout = await cell("nodes", index);
        nativeCuts.set(`node-${name}`, cutout);
        if (name === "start") cutout = await clean(cutout, (data, at, x, y) => {
            // Dim the portal, keeping the carved stone and source alpha intact.
            if (x > 0.2 && x < 0.83 && y > 0.28 && y < 0.92 && data[at] > 145 &&
                data[at + 1] >= data[at] * 0.95 && data[at + 2] >= data[at] * 0.9)
                for (let c = 0; c < 3; c++) data[at + c] = Math.round(data[at + c] * 0.72);
        });
        const enemy = name.startsWith("enemy-");
        const cleanImage = await canvas(cutout, 256, 256, enemy ? 240 : 224, enemy ? 240 : 224,
            enemy ? 248 : 240);
        await save(`clean/node-${name}`, cleanImage, `node-${name}`, { node: true });
        const { image, origin } = await atmosphericNode(index, name);
        await save(`node-${name}`, image, origin, { node: true });
        if (name === "transit") {
            await save("map-transit-stone", image, origin);
            const muted = await atmosphericNode(index, name, true);
            await save("map-transit-stone-muted", muted.image, muted.origin);
        }
    }
}
async function routeOutline(bytes) {
    const { data, info } = await raw(bytes), outline = Buffer.alloc(data.length);
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        let alpha = 0;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
            if (dx * dx + dy * dy > 9 || x + dx < 0 || x + dx >= info.width ||
                y + dy < 0 || y + dy >= info.height) continue;
            alpha = Math.max(alpha, data[((y + dy) * info.width + x + dx) * 4 + 3]);
        }
        const at = (y * info.width + x) * 4;
        if (alpha) {
            outline[at] = 24; outline[at + 1] = 33; outline[at + 2] = 28;
            outline[at + 3] = Math.round(alpha * 0.88);
        }
    }
    return sharp(outline, { raw: info }).composite([{ input: bytes }]).png().toBuffer();
}
async function icons() {
    const defs = [
        ["map-icon-inventory", 0], ["map-icon-build", 1], ["map-icon-exit", 2], ["map-icon-clock", 3],
        ["map-icon-hp", 4], ["map-icon-mp", 5], ["map-current-locator", 9],
        ["map-reachable-locator", 10], ["map-completed-badge", 11],
        ["map-route-dash", 12], ["inventory-search-spinner", 13],
    ];
    for (const [name, index] of defs) {
        const rectangles = {
            "map-current-locator": [580, 625, 400, 160],
            "map-reachable-locator": [1080, 625, 400, 160],
            "map-completed-badge": [1620, 610, 400, 180],
        };
        let cutout = rectangles[name] ? await cut("icons", rectangles[name]) : await cell("icons", index, 4);
        nativeCuts.set(name, cutout);
        if (name === "map-icon-hp") cutout = await clean(cutout, (data, at) => {
            const white = Math.max(0, Math.min(1, (Math.min(data[at], data[at + 1], data[at + 2]) - 160) / 70)) * 0.85;
            const gray = data[at] * 0.2126 + data[at + 1] * 0.7152 + data[at + 2] * 0.0722;
            for (let c = 0; c < 3; c++) data[at + c] = Math.round(
                (data[at + c] * 0.84 + gray * 0.16) * 0.95 * (1 - white) + [158, 190, 138][c] * white);
        });
        let image;
        if (name === "map-current-locator" || name === "map-reachable-locator") {
            const current = name === "map-current-locator", width = current ? 304 : 320, height = current ? 72 : 56;
            const ring = await sharp(cutout).resize(width - 12, height - 8, { fit: "fill" })
                .extend({ left: 6, right: 6, top: 4, bottom: 4, background: transparent }).png().toBuffer();
            image = current ? await clean(ring, oldGold) : ring;
        } else if (name === "map-route-dash") {
            cutout = await clean(cutout, (data, at) => {
                for (let c = 0; c < 3; c++) data[at + c] = Math.min(240, Math.round(data[at + c] * 1.16));
            });
            const stroke = await sharp(cutout).resize(44, 16, { fit: "fill" }).png().toBuffer();
            image = await canvas(stroke, 64, 32, 44, 16);
            await save("map-route-dash-contrast", await routeOutline(image), name);
        } else {
            const size = name === "map-completed-badge" ? 120 : 128;
            image = await canvas(cutout, size, size, size - 16, size - 16);
        }
        await save(name, image, name);
    }
    const portrait = await cut("icons", [1090, 818, 445, 325]);
    nativeCuts.set("map-player-portrait", portrait);
    const m = await sharp(portrait).metadata(), edge = Math.min(m.width, m.height);
    const square = await sharp(portrait).extract({ left: Math.round((m.width - edge) / 2), top: 0, width: edge, height: edge })
        .resize(128, 128).png().toBuffer();
    const rounded = await clean(square, (data, at, x, y) => {
        data[at + 3] = Math.round(data[at + 3] * Math.max(0, Math.min(1, (0.485 - Math.hypot(x - 0.5, y - 0.5)) * 128)));
    });
    await save("map-player-portrait", rounded, "map-player-portrait");
    const actor = await cut("icons", [1600, 804, 448, 339]);
    nativeCuts.set("map-player-traveler", actor);
    await save("map-player-traveler", await canvas(actor, 128, 160, 112, 138, 146), "map-player-traveler");
}
async function preview() {
    const bg = path.join(root, "assets/ui/texture/expedition/ancient-sect-ground-final.png");
    const layers = [];
    const selected = records.filter(r => r.file.startsWith(nodeArt) && !r.file.includes("/clean/") || [
        "map-player-traveler", "map-player-portrait", "map-avatar-frame", "map-icon-hp",
        "map-icon-mp", "map-current-locator", "map-reachable-locator", "inventory-search-spinner",
    ].includes(r.name));
    for (const [i, record] of selected.entries()) {
        const input = await sharp(path.join(root, record.file)).resize(120, 142, {
            fit: "contain", background: transparent,
        }).png().toBuffer();
        layers.push({ input, left: 24 + (i % 7) * 172, top: 20 + Math.floor(i / 7) * 168 });
    }
    await sharp(bg).resize(1240, 544, { fit: "cover" }).composite(layers).png()
        .toFile(path.join(output, "cutout-on-ground.png"));
    const nodes = records.filter(r => r.file.startsWith(nodeArt) && !r.file.includes("/clean/"));
    const gridWidth = 4 * 280 + 16, gridHeight = 3 * 300 + 16;
    const grid = Buffer.alloc(gridWidth * gridHeight * 4);
    for (let y = 0; y < gridHeight; y++) for (let x = 0; x < gridWidth; x++) {
        const at = (y * gridWidth + x) * 4;
        const inCell = x >= 16 && y >= 16 && (x - 16) % 280 < 256 && (y - 16) % 300 < 256;
        const shade = inCell ? ((Math.floor((x - 16) / 8) + Math.floor((y - 16) / 8)) % 2 ? 65 : 75) : 32;
        grid[at] = shade; grid[at + 1] = shade; grid[at + 2] = shade; grid[at + 3] = 255;
        if (inCell && (y - 16) % 300 === 240) {
            grid[at] = 98; grid[at + 1] = 174; grid[at + 2] = 149;
        }
    }
    await sharp(grid, { raw: { width: gridWidth, height: gridHeight, channels: 4 } }).composite(
        nodes.map((record, i) => ({ input: path.join(root, record.file),
            left: 16 + i % 4 * 280, top: 16 + Math.floor(i / 4) * 300 })))
        .png().toFile(path.join(output, "node-alignment-256.png"));
}
async function check() {
    const report = JSON.parse(fs.readFileSync(reportFile, "utf8")), ids = new Set();
    assert.equal(report.files.length, 53);
    for (const source of report.sources)
        assert.equal(hash(fs.readFileSync(path.join(root, source.file))), source.sha256, "Preserved source sheet");
    for (const record of report.files) {
        const file = path.join(root, record.file), bytes = fs.readFileSync(file);
        assert.equal(hash(bytes), record.sha256, record.name);
        const meta = JSON.parse(fs.readFileSync(`${file}.meta`, "utf8"));
        assert.equal(meta.uuid, record.uuid);
        if (record.previous_uuid) assert.equal(meta.uuid, record.previous_uuid, "Existing UUID is retained");
        assert.ok(!ids.has(meta.uuid), "Unique asset UUID"); ids.add(meta.uuid);
        assert.deepEqual([meta.importer.textureType, meta.importer.sRGB, meta.importer.premultiplyAlpha], [2, true, true]);
        if (record.grid) assert.deepEqual(meta.importer.sizeGrid, record.grid);
        const { data, info } = await raw(bytes);
        assert.deepEqual([info.width, info.height], record.size);
        let visible = 0;
        for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
            const at = (y * info.width + x) * 4, alpha = data[at + 3];
            if (alpha > 20) visible++;
            if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1)
                assert.equal(alpha, 0, `${record.name}: transparent safety border`);
            if (!alpha) assert.equal(data[at] + data[at + 1] + data[at + 2], 0, "Clean invisible RGB");
        }
        assert.ok(visible > 32, record.name);
        if (["map-current-locator", "map-reachable-locator", "inventory-search-spinner", "map-avatar-frame"].includes(record.name))
            assert.equal(data[(Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4 + 3], 0,
                `${record.name}: genuinely transparent interior`);
    }
    for (const entry of report.preserved_progress_bars)
        assert.equal(hash(fs.readFileSync(path.join(root, entry.file))), entry.sha256, "Progress artwork is unchanged");
    console.log("PASS unified map import: 53 sprites, 4 preserved sheets, all nodes 256px, UUIDs, alpha and unchanged progress art.");
}
async function main() {
    if (process.argv.includes("--check")) return check();
    assert.ok(process.argv.includes("--write"), "Use --write or --check");
    for (const directory of [reference, output]) fs.mkdirSync(directory, { recursive: true });
    for (const [name, filename] of Object.entries(supplied)) {
        const archived = path.join(reference, `${name}.png`);
        const input = fs.readFileSync(fs.existsSync(archived) ? archived :
            path.join(process.env.USERPROFILE || "C:/Users/Administrator", "Downloads", filename));
        const m = await sharp(input).metadata();
        assert.deepEqual([m.width, m.height, m.channels], [2752, 1536, 4]);
        if (!fs.existsSync(archived)) fs.writeFileSync(archived, input);
        sources[name] = input;
    }
    const progress = fs.readdirSync(path.join(root, art)).filter(name => name.startsWith("map-bar-") && name.endsWith(".png"))
        .flatMap(name => [name, `${name}.meta`]).map(name => {
            const file = path.join(root, art, name);
            return { file: relative(file), sha256: hash(fs.readFileSync(file)) };
        });
    await panels(); await nodes(); await icons();
    for (const [name, bytes] of nativeCuts) fs.writeFileSync(path.join(output, `${name}-native.png`), bytes);
    fs.writeFileSync(reportFile, JSON.stringify({
        sources: Object.keys(supplied).map(name => ({ file: relative(path.join(reference, `${name}.png`)),
            supplied_filename: supplied[name], sha256: hash(sources[name]) })),
        method: "Deterministic extraction of the supplied true-alpha sheets; normalize alpha and clear invisible RGB. " +
            "Tone down panel gold and the HP highlight; dim only the entrance portal. " +
            "Preserve panel corners with nine-slice. All 12 atmosphere nodes and 12 clean detail/counter variants use 256px canvases. " +
            "Balance the 12 map subjects optically: reduce the elite, enlarge the packages, preserve aspect ratios " +
            "and effects within a 240x224 envelope. Center the visible artwork horizontally with exactly 16px bottom " +
            "transparent padding on every 256px canvas. Include the insight stone's full tip. " +
            "Leave the existing faint transit underlay and clean UI variants unchanged; outline the supplied route dash. " +
            "Counters and action details retain the second sheet's clean artwork. No AI redraw.",
        preserved_progress_bars: progress,
        files: records,
    }, null, 2) + "\n");
    await preview(); await check();
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { check, nineSlice };
