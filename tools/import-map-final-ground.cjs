const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const source = path.join(root,"assets/ui/texture/test/bg.png");
const reference = path.join(root,"art/reference/expedition/ancient-sect-ground-final-source.png");
const runtime = path.join(root,"assets/ui/texture/expedition/ancient-sect-ground-final.png");
const preview = path.join(root,"tmp/map-final-ground");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

async function main() {
    assert.ok(process.argv.includes("--write"),"Use --write");
    const original = fs.readFileSync(source);
    const info = await sharp(original).metadata();
    assert.deepEqual([info.width,info.height],[2752,1536]);
    fs.mkdirSync(path.dirname(reference),{recursive:true});
    fs.mkdirSync(preview,{recursive:true});
    if (fs.existsSync(reference)) assert.equal(hash(fs.readFileSync(reference)),hash(original));
    else fs.copyFileSync(source,reference);
    const image = await sharp(original).resize(1376,768,{kernel:"lanczos3"}).png().toBuffer();
    fs.writeFileSync(runtime,image);
    const metaFile = `${runtime}.meta`;
    const existing = fs.existsSync(metaFile)?JSON.parse(fs.readFileSync(metaFile,"utf8")):{};
    fs.writeFileSync(metaFile,JSON.stringify({...existing,uuid:existing.uuid||crypto.randomUUID(),
        importer:{...existing.importer,textureType:2,sRGB:true,premultiplyAlpha:true}},null,2)+"\n");
    assert.equal(hash(fs.readFileSync(source)),hash(original),"Original stays unchanged");
    await sharp({create:{width:2752,height:768,channels:4,background:"#000"}})
        .composite([{input:image,left:0,top:0},{input:image,left:1376,top:0}])
        .png().toFile(path.join(preview,"repeat-2x1.png"));
    fs.writeFileSync(path.join(preview,"import-report.json"),JSON.stringify({
        source,source_sha256:hash(original),source_size:[info.width,info.height],
        runtime,runtime_sha256:hash(image),runtime_size:[1376,768],
        method:"Uniform 50% Lanczos resampling; no crop, recoloring, mirroring or seam repair.",
    },null,2)+"\n");
    console.log("Imported final ground at 1376x768; original preserved, sprite/sRGB/premultiplied-alpha metadata written.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
