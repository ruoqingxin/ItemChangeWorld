const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root=path.resolve(__dirname,"..");
const directory=path.join(root,"assets/ui/atlas/module/expedition/handpainted");
const reference=path.join(root,"art/reference/expedition/map-progress-bars");

(async()=>{
    const manifest=JSON.parse(fs.readFileSync(path.join(reference,"cuts.json"),"utf8"));
    const source=fs.readFileSync(path.join(reference,manifest.source));
    assert.equal(crypto.createHash("sha256").update(source).digest("hex"),manifest.sha256);
    const center={};
    for(const key of ["frame","track","stamina","mp","hp","weight"]) {
        const file=path.join(directory,`map-bar-${key}.png`);
        const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
        assert.equal(info.width,128);
        assert.equal(info.height,key==="frame"?24:20);
        const pixel=(x,y)=>Array.from(data.subarray((y*info.width+x)*4,(y*info.width+x)*4+4));
        for(const [x,y] of [[0,0],[127,0],[0,info.height-1],[127,info.height-1]])
            assert.equal(pixel(x,y)[3],0,`${key}: clean transparent corners`);
        center[key]=pixel(64,info.height/2);
        assert.equal(center[key][3],key==="frame"?0:255,`${key}: frame hole / opaque material`);
        for(let at=0;at<data.length;at+=4)
            if(!data[at+3])assert.deepEqual(Array.from(data.subarray(at,at+3)),[0,0,0]);
        const meta=JSON.parse(fs.readFileSync(file+".meta","utf8"));
        assert.ok(meta.uuid);
        assert.equal(meta.importer.textureType,2);
        assert.equal(meta.importer.sRGB,true);
        assert.equal(meta.importer.premultiplyAlpha,true);
        assert.deepEqual(meta.importer.sizeGrid,Array(4).fill(info.height/2).concat(0));
    }
    assert.ok(center.track.slice(0,3).every(value=>value>=20&&value<=75),"Track retains dark material, not black");
    assert.ok(center.hp[1]>center.hp[0]&&center.hp[1]>center.hp[2],"Green HP");
    assert.ok(center.stamina[0]>center.stamina[2]&&center.stamina[1]>center.stamina[0],"Lime stamina");
    assert.ok(center.mp[2]>center.mp[1]&&center.mp[1]>center.mp[0],"Blue MP");
    assert.ok(center.weight[1]>center.mp[1]&&center.weight[2]>center.mp[2],"Brighter cyan weight");
    console.log("PASS map progress artwork: source hash, six cuts, clean alpha, original material, color mapping and nine-slice imports.");
})().catch(error=>{console.error(error);process.exitCode=1;});
