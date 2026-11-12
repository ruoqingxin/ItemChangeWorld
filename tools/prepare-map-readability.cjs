const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root=path.resolve(__dirname,"..");
const directory=path.join(root,"assets/ui/atlas/module/expedition/handpainted");
const transparent={r:0,g:0,b:0,alpha:0};

async function save(name,bytes) {
    const file=path.join(directory,name+".png"),metaFile=file+".meta";
    const previous=fs.existsSync(metaFile)?JSON.parse(fs.readFileSync(metaFile,"utf8")):{};
    await sharp(bytes).png().toFile(file);
    fs.writeFileSync(metaFile,JSON.stringify({...previous,uuid:previous.uuid||crypto.randomUUID(),
        importer:{...previous.importer,textureType:2,sRGB:true,premultiplyAlpha:true}},null,2)+"\n");
}

async function stone() {
    const image=await sharp(path.join(directory,"map-transit-stone.png")).trim({threshold:8})
        .resize(104,55,{fit:"fill"}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    for(let at=0;at<image.data.length;at+=4) {
        for(let channel=0;channel<3;channel++)
            image.data[at+channel]=Math.round(image.data[at+channel]*[0.76,0.79,0.72][channel]);
        if(image.data[at+3]<4)image.data.fill(0,at,at+4);
    }
    const cut=await sharp(image.data,{raw:image.info}).png().toBuffer();
    const bytes=await sharp({create:{width:128,height:128,channels:4,background:transparent}})
        .composite([{input:cut,left:12,top:37}]).png().toBuffer();
    await save("map-transit-stone-muted",bytes);
}

async function route() {
    const {data,info}=await sharp(path.join(directory,"map-route-dash.png")).ensureAlpha()
        .raw().toBuffer({resolveWithObject:true});
    const outline=Buffer.alloc(data.length);
    // Dilate only the alpha so the existing painted dash gets a quiet, continuous dark edge.
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++) {
        let alpha=0;
        for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++) {
            if(dx*dx+dy*dy>9||x+dx<0||x+dx>=info.width||y+dy<0||y+dy>=info.height)continue;
            alpha=Math.max(alpha,data[((y+dy)*info.width+x+dx)*4+3]);
        }
        const at=(y*info.width+x)*4;
        if(alpha) {
            outline[at]=24;outline[at+1]=33;outline[at+2]=28;
            outline[at+3]=Math.round(alpha*0.88);
        }
    }
    const bytes=await sharp(outline,{raw:info}).composite([
        {input:await sharp(data,{raw:info}).png().toBuffer()},
    ]).png().toBuffer();
    await save("map-route-dash-contrast",bytes);
}

(async()=>{
    assert.ok(process.argv.includes("--write"),"Use --write");
    await stone();await route();
    console.log("Prepared thinner, muted stone and outlined route variants; original art and UUIDs retained.");
})().catch(error=>{console.error(error);process.exitCode=1;});
