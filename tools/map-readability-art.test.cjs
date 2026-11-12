const assert=require("node:assert/strict");
const path=require("node:path");
const fs=require("node:fs");
const sharp=require("sharp");
const directory=path.resolve(__dirname,"../assets/ui/atlas/module/expedition/handpainted");

async function inspect(name) {
    const file=path.join(directory,name+".png");
    const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let left=info.width,right=0,top=info.height,bottom=0,light=0,count=0;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++) {
        const at=(y*info.width+x)*4;
        if(data[at+3]>20) {
            left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
        }
        if(data[at+3]>240) {
            light+=data[at]*0.2126+data[at+1]*0.7152+data[at+2]*0.0722;count++;
        }
        if(x===0||y===0||x===info.width-1||y===info.height-1)
            assert.equal(data[at+3],0,`${name}: transparent safety border`);
    }
    const meta=JSON.parse(fs.readFileSync(file+".meta","utf8"));
    assert.ok(meta.uuid);
    assert.deepEqual([meta.importer.textureType,meta.importer.sRGB,meta.importer.premultiplyAlpha],[2,true,true]);
    return {data,info,width:right-left+1,height:bottom-top+1,light:light/count};
}
(async()=>{
    const original=await inspect("map-transit-stone"),stone=await inspect("map-transit-stone-muted");
    assert.deepEqual([stone.info.width,stone.info.height],[256,256]);
    assert.ok(stone.width<original.width&&stone.height<original.height,"Thinner, smaller stone footprint");
    assert.ok(stone.light<original.light*0.85&&stone.light>original.light*0.6,"Muted but readable stone material");
    const route=await inspect("map-route-dash-contrast");
    const plain=await inspect("map-route-dash");
    assert.deepEqual([route.info.width,route.info.height],[64,32]);
    assert.ok(route.width>plain.width&&route.height>plain.height,"Dark outline extends around the original dash");
    let light=0,dark=0;
    for(let i=0;i<route.data.length;i+=4)if(route.data[i+3]>120) {
        if(route.data[i]+route.data[i+1]+route.data[i+2]>600)light++;
        if(route.data[i]+route.data[i+1]+route.data[i+2]<150)dark++;
    }
    assert.ok(light>100&&dark>100,"Painted dash retains a light center and dark edge");
    console.log("PASS map readability assets: original art retained, smaller muted stone, clean alpha and outlined dash.");
})().catch(error=>{console.error(error);process.exitCode=1;});
