const {chromium}=require("playwright");
const sharp=require("sharp");
const fs=require("node:fs/promises");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
async function main(){
    const file=process.argv[2],out=path.resolve(__dirname,"../bin/inventory-video-reference");
    await fs.mkdir(out,{recursive:true});
    const browser=await chromium.launch({headless:true,channel:"chromium"});
    try{
        const page=await browser.newPage({viewport:{width:1280,height:720}});
        await page.goto(pathToFileURL(file).href);
        await page.waitForFunction(()=>document.querySelector("video")?.readyState>=2);
        const info=await page.evaluate(()=>{
            const v=document.querySelector("video");v.pause();v.controls=false;
            return{duration:v.duration,width:v.videoWidth,height:v.videoHeight};
        });
        console.log(info);
        const times=process.argv[3]?process.argv[3].split(",").map(Number):
            Array.from({length:24},(_,i)=>i*(info.duration-0.2)/23);
        const tiles=[];
        for(let i=0;i<times.length;i++){
            const t=times[i];
            await page.evaluate(async t=>{
                const v=document.querySelector("video");
                if(Math.abs(v.currentTime-t)>0.01){
                    await new Promise(resolve=>{v.addEventListener("seeked",resolve,{once:true});v.currentTime=t;});
                }
            },t);
            const buffer=await page.locator("video").screenshot();
            await fs.writeFile(path.join(out,`frame-${t.toFixed(2)}.png`),buffer);
            const resized=await sharp(buffer).resize({width:600}).png().toBuffer();
            const meta=await sharp(resized).metadata(),h=meta.height+28;
            const label=Buffer.from(`<svg width="600" height="28"><rect width="600" height="28" fill="#202020"/><text x="8" y="20" fill="white" font-size="18">${t.toFixed(2)}s</text></svg>`);
            tiles.push({input:await sharp({create:{width:600,height:h,channels:3,background:"#202020"}})
                .composite([{input:resized,top:0,left:0},{input:label,top:meta.height,left:0}]).png().toBuffer(),
                left:i%3*600,top:Math.floor(i/3)*h,height:h});
        }
        const height=Math.ceil(times.length/3)*tiles[0].height;
        await sharp({create:{width:1800,height,channels:3,background:"#202020"}})
            .composite(tiles.map(({height,...t})=>t)).png().toFile(path.join(out,"contact.png"));
        console.log(out);
    }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
