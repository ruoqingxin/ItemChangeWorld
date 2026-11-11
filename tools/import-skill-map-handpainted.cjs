const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const sourceFile = process.env.MAP_HANDPAINTED_SOURCE ||
    "C:/Users/Administrator/Downloads/bb97c47f-11f0-4b05-a79f-592fa62fba6f_0_7d14c8ca.png";
const reference = path.join(root, "art/reference/expedition/skill-map-handpainted-source.png");
const target = path.join(root, "assets/ui/atlas/module/expedition/handpainted");
const pack = path.join(root, "output/imagegen/skill-map-handpainted");
const reportFile = path.join(pack, "extraction-report.json");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const relative = file => path.relative(root, file).replaceAll("\\", "/");
const definitions = [
    { id: "A01", name: "map-player-traveler", rect: [72,48,408,530], size: [128,160], padding: 5 },
    { id: "A02", name: "map-player-portrait", rect: [532,80,330,438], size: [128,128], padding: 4, portrait: true },
    { id: "A03", name: "map-icon-clock", rect: [965,120,390,390], size: [128,128], padding: 6 },
    { id: "A04", name: "map-icon-inventory", rect: [1400,125,390,385], size: [128,128], padding: 6 },
    { id: "A05", name: "map-icon-build", rect: [1835,120,410,390], size: [128,128], padding: 6 },
    { id: "A06", name: "map-icon-exit", rect: [2285,120,400,390], size: [128,128], padding: 6 },
    { id: "B01", name: "map-panel", rect: [76,650,438,428], size: [64,64], padding: 1, grid: 16 },
    { id: "B02", name: "map-slot", rect: [552,650,427,428], size: [32,32], padding: 1, grid: 6 },
    { id: "B03", name: "map-avatar-frame", rect: [1020,640,452,438], size: [128,128], padding: 2 },
    { id: "B04", name: "map-button-normal", rect: [64,1180,596,205], size: [64,48], grid: 10, button: true },
    { id: "B05", name: "map-button-hover", rect: [730,1180,610,205], size: [64,48], grid: 10, button: true },
    { id: "B06", name: "map-button-pressed", rect: [1392,1180,610,205], size: [64,48], grid: 10, button: true },
    { id: "B07", name: "map-button-disabled", rect: [2056,1180,620,205], size: [64,48], grid: 10, button: true },
];

async function pixels(bytes) {
    return sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
function bounds(data, width, height, threshold = 32) {
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] < threshold) continue;
        left = Math.min(left,x); top = Math.min(top,y);
        right = Math.max(right,x); bottom = Math.max(bottom,y);
    }
    assert.ok(right >= left && bottom >= top, "Visible artwork must exist");
    return { left, top, width: right-left+1, height: bottom-top+1 };
}
async function cleanAlpha(bytes) {
    const { data, info } = await pixels(bytes);
    for (let p = 0; p < data.length; p += 4)
        if (data[p+3] < 8) data.fill(0,p,p+4);
    return sharp(data, { raw: info }).png().toBuffer();
}
async function paddedCrop(bytes, box) {
    const meta = await sharp(bytes).metadata();
    const left = Math.max(0,box.left), top = Math.max(0,box.top);
    const right = Math.min(meta.width,box.left+box.width);
    const bottom = Math.min(meta.height,box.top+box.height);
    return sharp(bytes).extract({ left,top,width:right-left,height:bottom-top })
        .extend({ left:left-box.left,top:top-box.top,
            right:box.left+box.width-right,bottom:box.top+box.height-bottom,
            background: { r:0,g:0,b:0,alpha:0 } }).png().toBuffer();
}
async function nineSlice(bytes, width, height, inset) {
    const meta = await sharp(bytes).metadata(), inputX = [0,inset,meta.width-inset,meta.width],
        inputY = [0,inset,meta.height-inset,meta.height],
        outputX = [0,inset,width-inset,width], outputY = [0,inset,height-inset,height];
    assert.ok(width > inset*2 && height > inset*2, "Nine-slice target must fit its corners");
    const layers = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
        const input = await sharp(bytes).extract({ left:inputX[x],top:inputY[y],
            width:inputX[x+1]-inputX[x],height:inputY[y+1]-inputY[y] })
            .resize(outputX[x+1]-outputX[x],outputY[y+1]-outputY[y],{ fit:"fill" }).png().toBuffer();
        layers.push({ input,left:outputX[x],top:outputY[y] });
    }
    return sharp({ create:{ width,height,channels:4,background:{ r:0,g:0,b:0,alpha:0 } } })
        .composite(layers).png().toBuffer();
}
async function runtimeImage(def, cut) {
    if (def.button) {
        const probe = await pixels(cut), core = bounds(probe.data,probe.info.width,probe.info.height);
        const native = await paddedCrop(cut,{ left:core.left-12,top:core.top-12,
            width:core.width+24,height:core.height+24 });
        const aligned = await sharp(native).resize(576,192,{ fit:"fill" }).png().toBuffer();
        await fs.promises.writeFile(path.join(pack,"aligned-buttons",`${def.name}.png`),aligned);
        const scaled = await sharp(aligned).resize(144,48,{ fit:"fill" }).png().toBuffer();
        return nineSlice(scaled,64,48,10);
    }
    const probe = await pixels(cut), core = bounds(probe.data,probe.info.width,probe.info.height);
    let crop = { left:core.left-6,top:core.top-6,width:core.width+12,height:core.height+12 };
    if (def.portrait) {
        const edge = Math.max(core.width+16,320);
        crop = { left:Math.round(core.left+core.width/2-edge/2),top:core.top-8,width:edge,height:edge };
    }
    const trimmed = await paddedCrop(cut,crop), [width,height] = def.size, pad = def.padding;
    return sharp(trimmed).resize(width-pad*2,height-pad*2,{ fit:"contain",
        background:{ r:0,g:0,b:0,alpha:0 },kernel:"lanczos3" })
        .extend({ top:pad,bottom:pad,left:pad,right:pad,background:{ r:0,g:0,b:0,alpha:0 } })
        .png().toBuffer();
}
async function validate(bytes,def) {
    const { data,info } = await pixels(bytes), [width,height] = def.size;
    assert.deepEqual([info.width,info.height,info.channels],[width,height,4],def.name);
    let transparent = 0, partial = 0, solid = 0, edgeMax = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const p = (y*width+x)*4, a = data[p+3];
        if (!x || !y || x === width-1 || y === height-1) edgeMax = Math.max(edgeMax,a);
        if (!a) { transparent++; assert.equal(data[p]+data[p+1]+data[p+2],0,"Transparent RGB must be clean"); }
        else if (a < 240) partial++;
        else solid++;
    }
    assert.equal(edgeMax,0,`${def.name}: transparent safety border`);
    assert.ok(solid > width*height*0.08 && transparent > 0 && partial > 0,def.name);
    const centerAlpha = data[(Math.floor(height/2)*width+Math.floor(width/2))*4+3];
    if (def.id === "B03") assert.equal(centerAlpha,0,"Avatar frame must have a true alpha hole");
    if (def.grid) assert.ok(centerAlpha >= 230,`${def.name}: panel/button center stays opaque`);
    return { transparent_pixels:transparent,partial_alpha_pixels:partial,solid_pixels:solid,
        center_alpha:centerAlpha,visible_bounds:bounds(data,width,height) };
}
function textLayer(text,width,height,fontSize = 16,color = "#eceee9") {
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="8" y="${fontSize+4}" font-family="Arial" font-size="${fontSize}" fill="${color}">${text}</text></svg>`);
}
async function previews(images) {
    for (const [name,color] of [["preview-dark","#25312e"],["preview-light","#dce0dc"]]) {
        const layers = [], textColor = name === "preview-light" ? "#1e2b26" : "#eceee9";
        for (let i = 0; i < definitions.length; i++) {
            const def = definitions[i], x = 24+(i%4)*264, y = 24+Math.floor(i/4)*232;
            const image = def.grid ? await nineSlice(images[i],216,144,def.grid) :
                await sharp(images[i]).resize(176,176,{ fit:"contain",background:{ r:0,g:0,b:0,alpha:0 } }).png().toBuffer();
            layers.push({ input:image,left:x+12,top:y+8 });
            layers.push({ input:await sharp(textLayer(`${def.id} ${def.name}`,252,32,14,textColor))
                .png().toBuffer(),left:x,top:y+188 });
            layers.push({ input:await sharp(textLayer(`${def.size[0]} x ${def.size[1]} px${def.grid ? " / nine-slice" : ""}`,252,28,13,textColor))
                .png().toBuffer(),left:x,top:y+214 });
        }
        await sharp({ create:{ width:1080,height:980,channels:4,background:color } })
            .composite(layers).png().toFile(path.join(pack,`${name}.png`));
    }
    const layers = [], normal = images[9];
    for (const [i,[width,height]] of [[112,104],[120,64],[208,64]].entries())
        layers.push({ input:await nineSlice(normal,width,height,10),left:28+i*256,top:52 });
    layers.push({ input:await nineSlice(images[6],780,80,16),left:20,top:212 });
    layers.push({ input:await nineSlice(images[7],204,22,6),left:32,top:330 });
    for (const [i,logical] of [[0,[56,60]],[1,[64,64]],[2,[24,24]],[3,[46,46]],[4,[46,46]],[5,[30,30]]].entries()) {
        const index = logical[0];
        const [width,height] = logical[1];
        layers.push({ input:await sharp(images[index]).resize(width,height,{ fit:"contain",background:{ r:0,g:0,b:0,alpha:0 } }).png().toBuffer(),
            left:32+i*124,top:410 });
    }
    await sharp({ create:{ width:824,height:500,channels:4,background:"#394640" } })
        .composite(layers).png().toFile(path.join(pack,"preview-actual-sizes.png"));
}
async function check() {
    const report = JSON.parse(fs.readFileSync(reportFile,"utf8")), uuids = new Set(), buttonBounds = [];
    assert.equal(report.files.length,13);
    assert.equal(hash(fs.readFileSync(reference)),report.source_sha256);
    for (const def of definitions) {
        const record = report.files.find(item => item.id === def.id);
        const file = path.join(root,record.file), bytes = fs.readFileSync(file);
        assert.equal(hash(bytes),record.sha256);
        const metadata = JSON.parse(fs.readFileSync(`${file}.meta`,"utf8"));
        assert.equal(metadata.uuid,record.uuid);
        assert.ok(!uuids.has(metadata.uuid),"Unique asset UUIDs"); uuids.add(metadata.uuid);
        assert.deepEqual([metadata.importer.textureType,metadata.importer.sRGB,metadata.importer.premultiplyAlpha],[2,true,true]);
        if (def.grid) assert.deepEqual(metadata.importer.sizeGrid,[def.grid,def.grid,def.grid,def.grid,0]);
        const stats = await validate(bytes,def);
        if (def.button) buttonBounds.push(stats.visible_bounds);
    }
    for (const box of buttonBounds) assert.deepEqual(box,buttonBounds[0],"All four states share the same visible bounds");
    console.log("PASS: 13 RGBA map assets; dimensions, hashes, alpha borders, avatar hole and nine-slice metadata verified.");
}
async function main() {
    if (process.argv.includes("--check")) return check();
    assert.ok(process.argv.includes("--write"),"Use --write or --check");
    const input = fs.readFileSync(fs.existsSync(reference) ? reference : sourceFile);
    const metadata = await sharp(input).metadata();
    assert.deepEqual([metadata.width,metadata.height,metadata.channels],[2736,1536,4]);
    if (fs.existsSync(reference) && fs.existsSync(sourceFile))
        assert.equal(hash(input),hash(fs.readFileSync(sourceFile)),"Preserved source must match supplied sheet");
    for (const directory of [target,path.dirname(reference),pack,path.join(pack,"native-cuts"),path.join(pack,"aligned-buttons")])
        fs.mkdirSync(directory,{ recursive:true });
    if (!fs.existsSync(reference)) fs.writeFileSync(reference,input);
    const images = [], files = [];
    for (const def of definitions) {
        const [left,top,width,height] = def.rect;
        const cut = await cleanAlpha(await sharp(input).extract({ left,top,width,height }).png().toBuffer());
        await fs.promises.writeFile(path.join(pack,"native-cuts",`${def.name}.png`),cut);
        const bytes = await cleanAlpha(await runtimeImage(def,cut));
        const stats = await validate(bytes,def);
        const file = path.join(target,`${def.name}.png`), metaFile = `${file}.meta`;
        const existing = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile,"utf8")) : {};
        const meta = { ...existing,uuid:existing.uuid || crypto.randomUUID(),
            importer:{ ...existing.importer,textureType:2,sRGB:true,premultiplyAlpha:true,
                ...(def.grid ? { sizeGrid:[def.grid,def.grid,def.grid,def.grid,0] } : {}) } };
        fs.writeFileSync(file,bytes); fs.writeFileSync(metaFile,JSON.stringify(meta,null,2)+"\n");
        files.push({ id:def.id,file:relative(file),source_rect:def.rect,size:def.size,
            sha256:hash(bytes),uuid:meta.uuid,...stats });
        images.push(bytes);
    }
    await previews(images);
    fs.writeFileSync(reportFile,JSON.stringify({ source:relative(reference),source_sha256:hash(input),
        source_size:[2736,1536],count:13,runtime_directory:relative(target),
        method:"Crop supplied true-alpha artwork; remove alpha below 8/255 and zero invisible RGB. Preserve all other alpha and colors. Crop portrait to square head-and-shoulders. Align four button canvases and compress only their horizontal center with nine-slice resampling. No AI redraw or color key.",
        bound_to_prefab:false,gameplay_changed:false,files },null,2)+"\n");
    await check();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
