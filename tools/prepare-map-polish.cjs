const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname,"..");
const directory = path.join(root,"assets/ui/atlas/module/expedition/handpainted");
const prefix = "ui/atlas/module/expedition/handpainted/";

function coverage(x,y,width,height,inset=0) {
    const radius=height/2-inset;
    const cx=Math.max(height/2,Math.min(width-height/2,x));
    return Math.max(0,Math.min(1,radius-Math.hypot(x-cx,y-height/2)+0.5));
}

async function capsule(name,source,frame=false,brightness=1,saturation=1) {
    const width=128,height=frame?24:20;
    const {data}=await sharp(path.join(directory,source+".png")).resize(width,height)
        .modulate({brightness,saturation}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
        const at=(y*width+x)*4,outer=coverage(x+0.5,y+0.5,width,height);
        if(frame) {
            const edge=outer-coverage(x+0.5,y+0.5,width,height,1);
            const mix=outer?edge/outer*0.8:0;
            for(let c=0;c<3;c++)data[at+c]=Math.round(data[at+c]*(1-mix)+[173,183,156][c]*mix);
        }
        data[at+3]=Math.round(data[at+3]*outer);
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

async function main() {
    assert.ok(process.argv.includes("--write"),"Use --write");
    await capsule("map-bar-frame","map-meter-track",true,0.76);
    await capsule("map-bar-track","map-meter-track",false,0.8);
    for(const key of ["hp","mp","stamina","weight"])
        await capsule(`map-bar-${key}`,`map-meter-${key}`,false,1.06,1.14);
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
    fs.writeFileSync(file,JSON.stringify(prefab,null,2)+"\n");
    console.log("Prepared six capsule textures from existing painted meters; map-only bindings updated.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
