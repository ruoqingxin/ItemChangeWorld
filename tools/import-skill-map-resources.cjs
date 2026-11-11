const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const supplied = process.env.MAP_RESOURCE_SOURCE ||
    "C:/Users/Administrator/Downloads/e508957e-57cc-47ed-8f4c-bc58e432f5d8_0_857ce4b3.png";
const reference = path.join(root, "art/reference/expedition/skill-map-resources-source.png");
const target = path.join(root, "assets/ui/atlas/module/expedition/handpainted");
const pack = path.join(root, "output/imagegen/skill-map-resources");
const reportFile = path.join(pack, "extraction-report.json");
const rel = file => path.relative(root, file).replaceAll("\\", "/");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const definitions = [
    { id: "C01", name: "map-meter-track", native: [90,108,1500,224], interior: [326,164,1024,128], size: [512,64] },
    { id: "C02", name: "map-meter-hp", native: [90,352,1500,226], interior: [326,408,1024,128], size: [512,64] },
    { id: "C03", name: "map-meter-mp", native: [90,602,1500,228], interior: [326,656,1024,128], size: [512,64] },
    { id: "C04", name: "map-meter-stamina", native: [90,854,1500,224], interior: [326,908,1024,128], size: [512,64] },
    { id: "C05", name: "map-meter-weight", native: [90,1113,1500,229], interior: [326,1168,1024,128], size: [512,64] },
    { id: "D01", name: "map-route-dash", native: [1696,288,1120,144], size: [64,32] },
    { id: "E01", name: "inventory-search-spinner", native: [1960,592,768,768], size: [128,128] },
];

async function crop(bytes, rect) {
    const [left,top,width,height] = rect;
    return sharp(bytes).extract({ left,top,width,height }).png().toBuffer();
}
async function pixels(bytes) {
    return sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
async function cleanAlpha(bytes) {
    const { data,info } = await pixels(bytes);
    for (let p = 0; p < data.length; p += 4)
        if (data[p+3] < 8) data.fill(0,p,p+4);
    return sharp(data, { raw:info }).png().toBuffer();
}
function bounds(data,width,height,threshold = 32) {
    let left = width,top = height,right = -1,bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (data[(y*width+x)*4+3] < threshold) continue;
        left = Math.min(left,x); top = Math.min(top,y);
        right = Math.max(right,x); bottom = Math.max(bottom,y);
    }
    assert.ok(right >= left && bottom >= top,"Visible artwork is required");
    return { left,top,width:right-left+1,height:bottom-top+1 };
}
async function shortDash(native) {
    const probe = await pixels(native), box = bounds(probe.data,probe.info.width,probe.info.height);
    const input = await sharp(native).extract({ left:box.left-3,top:box.top-3,
        width:box.width+6,height:box.height+6 }).resize({ height:24 }).png().toBuffer();
    const metadata = await sharp(input).metadata(), cap = 8, bodyWidth = 40;
    // Keep the original end caps and shorten only the long, uniform center.
    const sections = [[0,cap,cap,0],[cap,metadata.width-cap*2,bodyWidth-cap*2,cap],
        [metadata.width-cap,cap,cap,bodyWidth-cap]];
    const layers = [];
    for (const [left,width,outputWidth,x] of sections) {
        layers.push({ input:await sharp(input).extract({ left,top:0,width,height:24 })
            .resize(outputWidth,24).png().toBuffer(),left:x+12,top:4 });
    }
    return sharp({ create:{ width:64,height:32,channels:4,background:{ r:0,g:0,b:0,alpha:0 } } })
        .composite(layers).png().toBuffer();
}
async function validate(bytes,def) {
    const { data,info } = await pixels(bytes), [width,height] = def.size;
    assert.deepEqual([info.width,info.height,info.channels],[width,height,4],def.name);
    let transparent = 0,partial = 0,solid = 0,borderMax = 0,minAlpha = 255;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const p = (y*width+x)*4, a = data[p+3];
        minAlpha = Math.min(minAlpha,a);
        if (!x || !y || x === width-1 || y === height-1) borderMax = Math.max(borderMax,a);
        if (!a) {
            transparent++;
            assert.equal(data[p]+data[p+1]+data[p+2],0,"Invisible RGB must be zero");
        } else if (a < 240) partial++;
        else solid++;
    }
    const center = (Math.floor(height/2)*width+Math.floor(width/2))*4;
    if (def.interior) {
        assert.equal(minAlpha,255,"Meter interiors must be opaque, including every edge");
        assert.equal(solid,width*height);
    } else {
        assert.equal(borderMax,0,"Transparent safety border");
        assert.ok(transparent > 0 && partial > 0 && solid > 100,"Antialiased original silhouette");
        if (def.id === "D01") {
            assert.ok(data[center+3] >= 240,"Dash must be solid");
            assert.ok(data[center] > 180 && data[center+1] > 180 && data[center+2] > 180,"Original jade-white core");
        } else {
            assert.equal(data[center+3],0,"Spinner hole must be transparent");
            const gap = (7*width+Math.floor(width/2))*4;
            assert.equal(data[gap+3],0,"Spinner opening must remain transparent");
        }
    }
    return { transparent_pixels:transparent,partial_alpha_pixels:partial,solid_pixels:solid,
        min_alpha:minAlpha,center_alpha:data[center+3],visible_bounds:bounds(data,width,height) };
}
async function label(text,width,color) {
    return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="30"><text x="0" y="20" fill="${color}" font-family="Arial" font-size="16">${text}</text></svg>`))
        .png().toBuffer();
}
async function previews(images) {
    for (const [theme,background,color] of [
        ["dark","#283630","#ebf0eb"],["light","#e1e5e0","#24342a"],
    ]) {
        const layers = [];
        for (let i = 0; i < 5; i++) {
            const def = definitions[i], top = 28+i*138;
            layers.push({ input:await label(`${def.id}  ${def.name}  /  512 x 64`,580,color),left:28,top });
            layers.push({ input:images[i],left:28,top:top+36 });
            const full = await sharp(images[i]).resize(204,12).png().toBuffer();
            layers.push({ input:full,left:28,top:top+110 });
            layers.push({ input:await sharp(full).extract({ left:0,top:0,width:102,height:12 }).png().toBuffer(),
                left:248,top:top+110 });
            layers.push({ input:await sharp(full).extract({ left:0,top:0,width:20,height:12 }).png().toBuffer(),
                left:366,top:top+110 });
        }
        layers.push({ input:await label("D01  map-route-dash  /  64 x 32",430,color),left:620,top:28 });
        layers.push({ input:await sharp(images[5]).resize(192,96).png().toBuffer(),left:664,top:74 });
        layers.push({ input:images[5],left:892,top:108 });
        layers.push({ input:await label("E01  inventory-search-spinner  /  128 x 128",430,color),left:620,top:224 });
        layers.push({ input:await sharp(images[6]).resize(256,256).png().toBuffer(),left:664,top:276 });
        layers.push({ input:await label("44 x 44 display",260,color),left:620,top:574 });
        layers.push({ input:await sharp(images[6]).resize(44,44).png().toBuffer(),left:628,top:618 });
        await sharp({ create:{ width:1080,height:740,channels:4,background } })
            .composite(layers).png().toFile(path.join(pack,`preview-${theme}.png`));
    }
}
async function check() {
    const report = JSON.parse(fs.readFileSync(reportFile,"utf8"));
    assert.equal(report.files.length,7);
    assert.equal(hash(fs.readFileSync(reference)),report.source_sha256);
    const allUuids = new Set();
    for (const filename of fs.readdirSync(target).filter(name => name.endsWith(".png.meta"))) {
        const metadata = JSON.parse(fs.readFileSync(path.join(target,filename),"utf8"));
        assert.ok(!allUuids.has(metadata.uuid),"Unique UUIDs across both sprite sheets");
        allUuids.add(metadata.uuid);
    }
    for (const def of definitions) {
        const record = report.files.find(item => item.id === def.id);
        const bytes = fs.readFileSync(path.join(root,record.file));
        assert.equal(hash(bytes),record.sha256,def.name);
        const metadata = JSON.parse(fs.readFileSync(path.join(root,record.file+".meta"),"utf8"));
        assert.equal(metadata.uuid,record.uuid);
        assert.deepEqual([metadata.importer.textureType,metadata.importer.sRGB,metadata.importer.premultiplyAlpha],
            [2,true,true]);
        assert.equal(metadata.importer.sizeGrid,undefined,"Fill textures and silhouettes are not nine-sliced");
        await validate(bytes,def);
        if (def.interior) {
            const expected = await sharp(await crop(fs.readFileSync(reference),def.interior))
                .removeAlpha().resize(...def.size).ensureAlpha(1).png().toBuffer();
            assert.equal(hash(expected),record.sha256,"Meter colors must come directly from the recorded source crop");
        }
    }
    console.log("PASS: 7 map resources; hashes, sizes, opaque meter edges, solid dash, spinner hole/opening and unique metadata verified.");
}
async function main() {
    if (process.argv.includes("--check")) return check();
    assert.ok(process.argv.includes("--write"),"Use --write or --check");
    const input = fs.readFileSync(fs.existsSync(reference) ? reference : supplied);
    const metadata = await sharp(input).metadata();
    assert.deepEqual([metadata.width,metadata.height,metadata.channels],[2896,1440,4]);
    if (fs.existsSync(reference) && fs.existsSync(supplied))
        assert.equal(hash(input),hash(fs.readFileSync(supplied)),"Preserved source must match supplied image");
    const products = [];
    for (const def of definitions) {
        const native = await crop(input,def.native);
        let bytes;
        if (def.interior)
            bytes = await sharp(await crop(input,def.interior)).removeAlpha()
                .resize(...def.size).ensureAlpha(1).png().toBuffer();
        else if (def.id === "D01") bytes = await cleanAlpha(await shortDash(await cleanAlpha(native)));
        else bytes = await cleanAlpha(await sharp(await cleanAlpha(native)).resize(...def.size).png().toBuffer());
        const stats = await validate(bytes,def);
        products.push({ def,native,bytes,stats });
    }
    for (const folder of [path.dirname(reference),target,pack,path.join(pack,"native-cuts"),path.join(pack,"interior-cuts")])
        fs.mkdirSync(folder,{ recursive:true });
    if (!fs.existsSync(reference)) fs.writeFileSync(reference,input);
    const files = [];
    for (const { def,native,bytes,stats } of products) {
        const file = path.join(target,`${def.name}.png`), metaFile = file+".meta";
        const existing = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile,"utf8")) : {};
        const metadata = { ...existing,uuid:existing.uuid || crypto.randomUUID(),
            importer:{ ...existing.importer,textureType:2,sRGB:true,premultiplyAlpha:true } };
        fs.writeFileSync(file,bytes);
        fs.writeFileSync(metaFile,JSON.stringify(metadata,null,2)+"\n");
        fs.writeFileSync(path.join(pack,"native-cuts",`${def.name}.png`),native);
        if (def.interior) fs.writeFileSync(path.join(pack,"interior-cuts",`${def.name}.png`),await crop(input,def.interior));
        files.push({ id:def.id,file:rel(file),native_rect:def.native,interior_rect:def.interior,
            size:def.size,sha256:hash(bytes),uuid:metadata.uuid,...stats });
    }
    await previews(products.map(product => product.bytes));
    fs.writeFileSync(reportFile,JSON.stringify({
        source:rel(reference),source_size:[2896,1440],source_sha256:hash(input),count:7,
        runtime_directory:rel(target),bound_to_prefab:false,gameplay_changed:false,
        method:"Five meter textures are cropped from border-free source interiors and made opaque without RGB recoloring. Dash preserves original end caps and compresses its horizontal middle. Spinner retains original alpha, hole and gap. Transparent assets discard alpha below 8/255 and zero invisible RGB. No AI redraw.",
        files,
    },null,2)+"\n");
    await check();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
