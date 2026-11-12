const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname,"..");
const directory = path.join(root,"assets/ui/atlas/module/expedition/handpainted");
const prefix = "ui/atlas/module/expedition/handpainted/";
const reference = path.join(root,"art/reference/expedition/map-progress-bars");
const sheet = path.join(reference,"source.png");
const cuts = {
    frame:{left:62,top:94,width:1925,height:262},
    stamina:{left:182,top:510,width:1683,height:213},
    mp:{left:182,top:829,width:1683,height:209},
    hp:{left:182,top:1147,width:1683,height:213},
    weight:{left:182,top:1469,width:1683,height:215},
};

function coverage(x,y,width,height,inset=0) {
    const radius=height/2-inset;
    const cx=Math.max(height/2,Math.min(width-height/2,x));
    return Math.max(0,Math.min(1,radius-Math.hypot(x-cx,y-height/2)+0.5));
}

async function save(name,data,width,height) {
    for(let at=0;at<data.length;at+=4) {
        data[at+3]=data[at+3]<4?0:Math.min(255,Math.round(data[at+3]*255/253));
        if(!data[at+3])data.fill(0,at,at+4);
    }
    const file=path.join(directory,name+".png"),metaFile=file+".meta";
    await sharp(data,{raw:{width,height,channels:4}}).png().toFile(file);
    const previous=fs.existsSync(metaFile)?JSON.parse(fs.readFileSync(metaFile,"utf8")):{};
    const inset=height/2;
    fs.writeFileSync(metaFile,JSON.stringify({...previous,uuid:previous.uuid||crypto.randomUUID(),
        importer:{...previous.importer,textureType:2,sRGB:true,premultiplyAlpha:true,
            sizeGrid:[inset,inset,inset,inset,0]}},null,2)+"\n");
}

async function capsule(key) {
    const width=128,height=key==="frame"?24:20,cut=cuts[key],cap=height/2;
    const sourceCap=Math.round(cut.height/2);
    // Resize the end caps uniformly; compress only the long middle section.
    const pieces=await Promise.all([
        {left:cut.left,width:sourceCap,out:cap},
        {left:cut.left+sourceCap,width:cut.width-sourceCap*2,out:width-cap*2},
        {left:cut.left+cut.width-sourceCap,width:sourceCap,out:cap},
    ].map(async part=>sharp(sheet).extract({left:part.left,top:cut.top,
        width:part.width,height:cut.height}).resize(part.out,height,{fit:"fill"}).png().toBuffer()));
    const data=await sharp({create:{width,height,channels:4,background:"#00000000"}})
        .composite(pieces.map((input,i)=>({input,left:[0,cap,width-cap][i],top:0})))
        .raw().toBuffer();
    await save(`map-bar-${key}`,data,width,height);
}

async function track() {
    const width=128,height=20;
    // The empty frame's transparent center still contains its original dark material RGB.
    const cut={left:400,top:135,width:1248,height:184};
    const material=await sharp(sheet).extract(cut).ensureAlpha().raw().toBuffer();
    for(let at=3;at<material.length;at+=4)material[at]=255;
    const data=await sharp(material,{raw:{width:cut.width,height:cut.height,channels:4}})
        .resize(width,height,{fit:"fill"}).raw().toBuffer();
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)
        data[(y*width+x)*4+3]=Math.round(255*coverage(x+0.5,y+0.5,width,height));
    await save("map-bar-track",data,width,height);
}

async function preview() {
    const width=640,height=300,rows=[];
    for(const [i,key] of ["stamina","mp","hp","weight"].entries()) {
        const y=22+i*68;
        for(const [x,background] of [[16,"#182624"],[336,"#deded9"]]) {
            rows.push({input:await sharp({create:{width:288,height:56,channels:4,background}})
                .png().toBuffer(),left:x,top:y});
            for(const [name,dx,dy,w,h] of [
                ["frame",0,0,256,48],["track",8,8,240,32],[key,8,8,240,32],
            ]) {
                const image=await sharp(path.join(directory,`map-bar-${name}.png`))
                    .resize(w,h,{fit:"fill"}).png().toBuffer();
                rows.push({input:image,left:x+16+dx,top:y+4+dy});
            }
        }
    }
    const out=path.join(root,"tmp/map-bars");
    fs.mkdirSync(out,{recursive:true});
    await sharp({create:{width,height,channels:4,background:"#737b78"}})
        .composite(rows).png().toFile(path.join(out,"cutout-check.png"));
}

async function main() {
    assert.ok(process.argv.includes("--write"),"Use --write");
    const sourceIndex=process.argv.indexOf("--source");
    if(sourceIndex!==-1) {
        assert.ok(process.argv[sourceIndex+1],"--source requires the original sheet path");
        fs.mkdirSync(reference,{recursive:true});
        fs.copyFileSync(path.resolve(process.argv[sourceIndex+1]),sheet);
    }
    assert.ok(fs.existsSync(sheet),"First import requires --source <sheet.png>");
    const metadata=await sharp(sheet).metadata();
    assert.equal(metadata.width,2048);assert.equal(metadata.height,2048);
    for(const key of Object.keys(cuts))await capsule(key);
    await track();
    fs.writeFileSync(path.join(reference,"cuts.json"),JSON.stringify({
        source:"source.png",sha256:crypto.createHash("sha256").update(fs.readFileSync(sheet)).digest("hex"),
        cuts,output:{width:128,frameHeight:24,fillHeight:20},
        mapping:{stamina:"lime",mp:"blue",hp:"green",weight:"cyan"},
    },null,2)+"\n");
    const file=path.join(root,"assets/ui/prefab/module/expedition/SkillBattleMapView.lh");
    const prefab=JSON.parse(fs.readFileSync(file,"utf8")),nodes=new Map();
    const visit=node=>{nodes.set(node.name,node);(node._$child||[]).forEach(visit);};
    visit(prefab);
    for(const key of ["Hp","Mp","Stamina","Weight"]) {
        nodes.get(`map${key}Slot`).src=prefix+"map-bar-frame.png";
        nodes.get(`map${key}Track`).src=prefix+"map-bar-track.png";
        nodes.get(`map${key}Fill`).src=prefix+`map-bar-${key.toLowerCase()}.png`;
    }
    const mapper=prefab._$comp.find(c=>c.scriptPath?.endsWith("ElementMapper.ts"));
    if(!nodes.has("mapNoticeSkin")) {
        const notice={_$id:"map_polish_notice",_$type:"GImage",name:"mapNoticeSkin",
            width:160,height:40,mouseEnabled:false,visible:false,autoSize:false,
            src:prefix+"map-bar-track.png"};
        nodes.get("mapActionsArea")._$child.unshift(notice);
        mapper.elements.push({_$ref:notice._$id});
    }
    const serialized=JSON.stringify(prefab,null,2)+"\n";
    if(fs.readFileSync(file,"utf8")!==serialized)fs.writeFileSync(file,serialized);
    await preview();
    console.log("Imported silver frame, four original colored fills and matching dark track; existing UUIDs retained.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
