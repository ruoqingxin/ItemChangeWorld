const fs=require("node:fs/promises"),path=require("node:path"),crypto=require("node:crypto"),sharp=require("sharp");
const root=path.resolve(__dirname,".."),dir=path.join(root,"assets/ui/atlas/module/equipment");
// 首批器型图标使用独立轮廓，品质仍由已有品质框表达。
const shape={
    steelSword:`<path fill="url(#metal)" d="M53 140V48L64 12l11 36v92z"/><path fill="#d1b26c" d="M36 137h56v9H36z"/><path fill="#52674a" d="M57 146h14v32H57z"/><circle cx="64" cy="180" r="8" fill="#d1b26c"/>`,
    saber:`<path fill="url(#metal)" d="M53 139V42L87 13c-13 35-4 72-20 126z"/><path fill="#cfa765" d="M37 139h49v9H37z"/><path fill="#764c43" d="M55 148h13v32H55z"/>`,
    spear:`<path fill="#8c6240" d="M59 64h10v122H59z"/><path fill="url(#metal)" d="M64 6l19 43-19 23-19-23z"/><path fill="#b94b49" d="M58 64l-17 31 20-8 4-23z"/>`,
    axe:`<path fill="#816147" d="M59 35h12v146H59z"/><path fill="url(#metal)" d="M64 33L29 22 12 65l50 11 44-16-14-33z"/><path fill="#c8a05e" d="M58 31h17v47H58z"/>`,
    hammer:`<path fill="#79583d" d="M59 68h13v114H59z"/><path fill="url(#metal)" d="M17 28h94v45H17z"/><path fill="#c9a65b" d="M48 24h32v53H48z"/><path fill="none" d="M24 35v31m80-31v31"/>`,
    staff:`<path fill="#627d4b" d="M58 17h13v166H58z"/><path fill="#d3b16c" d="M57 17h15v23H57zm0 140h15v23H57z"/><path fill="none" stroke="#d3b16c" d="M59 67l12 10-12 10 12 10-12 10"/>`,
    bow:`<path fill="none" stroke="#c3a46b" stroke-width="9" d="M47 15q83 80 0 163"/><path fill="none" stroke="#d8dcd1" stroke-width="2" d="M47 15v163"/><path fill="#647d59" d="M72 85h14v23H72z"/>`,
    crossbow:`<path fill="#79614b" d="M57 41h15v139H57z"/><path fill="none" stroke="#b4c4ba" stroke-width="9" d="M17 72q48-57 94 0"/><path fill="none" stroke="#d0b170" d="M17 72h94"/><path fill="#c7d3c3" d="M64 19l7 18h-14z"/>`,
    fan:`<path fill="#b8d5ce" d="M64 148L8 72q56-60 112 0z"/><path fill="none" stroke="#927e4e" d="M64 177V68m0 80L23 66m41 82L44 53m20 95L84 53m-20 95l42-82"/><circle cx="64" cy="148" r="6" fill="#d5ae62"/>`,
    bamboo:`<path fill="#678c59" d="M55 32h18v149H55z"/><path fill="#cfbc77" d="M53 54h22v6H53zm0 44h22v6H53zm0 45h22v6H53z"/><path fill="none" stroke="#789e67" stroke-width="6" d="M64 36l28-18m-28 4L44 11"/>`,
    bell:`<path fill="url(#gold)" d="M28 122l10-61q26-28 52 0l10 61 10 12H18z"/><path fill="none" stroke="#e3c780" stroke-width="9" d="M52 52V37q12-20 24 0v15"/><circle cx="64" cy="143" r="9" fill="#c99f4d"/><path fill="none" stroke="#e4d39d" d="M40 78h48m-52 23h56"/>`,
    seal:`<path fill="url(#gold)" d="M18 106h92v44H18z"/><path fill="#648478" d="M24 99h80v15H24z"/><path fill="url(#gold)" d="M43 99V77q21-38 42 0v22z"/><path fill="none" d="M26 132h76m-66-14v27m56-27v27"/>`,
    feather:`<path fill="#739b8e" d="M36 26l18-9h20l18 9 22 29-22 15-5 41H41l-5-41-22-15z"/><path fill="none" stroke="#d6d9b9" d="M53 19l11 30 11-30M43 58l21 16 21-16M43 76l21 16 21-16M43 94l21 16 21-16"/>`,
    scale:`<path fill="#879b9c" d="M35 25l18-9h22l18 9 24 27-22 18-7 44H40l-7-44-22-18z"/><path fill="none" stroke="#d2d4bd" d="M51 18l13 29 13-29M38 56q13 14 26 0 13 14 26 0M40 72q12 14 24 0 12 14 24 0M41 88q11 14 23 0 12 14 23 0"/>`,
    heavy:`<path fill="#556569" d="M33 24l20-10h22l20 10 23 29-23 20-6 40H39l-6-40-23-20z"/><path fill="#a2afb0" d="M42 35l22 15 22-15 2 37-24 23-24-23z"/><path fill="#c3a366" d="M39 91h50v10H39z"/>`,
    heart:`<path fill="#7f4e4f" d="M36 24l19-8h18l19 8 20 29-19 17-7 43H42l-7-43-19-17z"/><path fill="url(#gold)" d="M47 49h34l5 24-22 22-22-22z"/><circle cx="64" cy="68" r="10" fill="#c4d9cb"/>`,
    robe:`<path fill="#4d697d" d="M46 17h36l28 37-21 16-5-10 13 55H31l13-55-5 10-21-16z"/><path fill="none" stroke="#d3cbb1" stroke-width="5" d="M46 17l32 59M82 17L56 68l-11 47"/><path fill="#aa8c50" d="M41 72h46v9H41z"/>`,
    manaRobe:`<path fill="#7a6588" d="M46 17h36l28 37-21 16-5-10 13 55H31l13-55-5 10-21-16z"/><path fill="none" stroke="#d9cbb5" stroke-width="5" d="M46 17l32 59M82 17L56 68l-11 47"/><path fill="#96c2c3" d="M41 72h46v9H41z"/><circle cx="67" cy="76" r="7" fill="#e0dfbb"/>`,
    jade:`<path fill="none" stroke="#beab79" d="M58 21q-34-19-27-6 7 13 28 12"/><path fill="#6baf96" d="M38 34l26-17 26 17v48L64 104 38 82z"/><circle cx="64" cy="51" r="11" fill="#273d37"/><path fill="none" stroke="#c5e7c8" d="M49 75l15 15 15-15"/><path fill="#b66e65" d="M61 104h7v18H61z"/>`,
    pearl:`<circle cx="64" cy="64" r="40" fill="#78b1bc"/><path fill="none" stroke="#dfd8ae" stroke-width="6" d="M28 83q36 30 72-1"/><circle cx="52" cy="48" r="10" fill="#d1eeee"/><path fill="none" stroke="#bce8e6" d="M42 69q20 19 44-3"/>`,
    ring:`<ellipse cx="64" cy="67" rx="34" ry="41" fill="none" stroke="url(#metal)" stroke-width="15"/><path fill="#96c4b7" d="M49 18h30l6 23-21 12-21-12z"/><path fill="none" d="M48 29h31"/>`,
    edge:`<path fill="none" stroke="#b7b29b" d="M29 11l35 31 35-31"/><path fill="url(#metal)" d="M64 37l24 22-24 56-24-56z"/><path fill="#bd924c" d="M43 53h42v9H43z"/><path fill="none" stroke="#edf1d8" d="M64 70v31"/>`,
    pin:`<path fill="url(#metal)" d="M35 106l57-78 7 6-54 78z"/><path fill="#80a5a3" d="M80 21l9-13 10 10 16 2-4 17-18 10-16-12z"/><circle cx="94" cy="27" r="8" fill="#d8dec5"/><path fill="none" stroke="#cbb26f" d="M103 39v32l-6 15"/>`,
    bracelet:`<ellipse cx="64" cy="66" rx="40" ry="35" fill="none" stroke="#9a5356" stroke-width="15"/><path fill="none" stroke="#dbb17c" stroke-width="4" d="M28 48l14 16-8 22m30-49l-3 13m27-6l-8 19 17 14M54 95l10-12 11 12"/>`,
};
async function main(){
    await fs.mkdir(dir,{recursive:true});
    const sheets=[];
    for(const [code,body]of Object.entries(shape)){
        const weapon=Object.keys(shape).indexOf(code)<12;
        const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="${weapon?384:256}" viewBox="0 0 128 ${weapon?192:128}">
        <defs><linearGradient id="metal" x2="1" y2="0"><stop stop-color="#6e8b87"/><stop offset=".48" stop-color="#dee2cb"/><stop offset="1" stop-color="#809895"/></linearGradient><linearGradient id="gold" x2="1" y2="1"><stop stop-color="#edcf85"/><stop offset="1" stop-color="#9b743c"/></linearGradient></defs>
        <g stroke="#25342f" stroke-width="2" stroke-linejoin="round">${body}</g></svg>`;
        const file=path.join(dir,code+".png");
        await sharp(Buffer.from(svg)).png().toFile(file);
        try{await fs.access(file+".meta");}catch{
            await fs.writeFile(file+".meta",JSON.stringify({uuid:crypto.randomUUID(),importer:{textureType:2,sRGB:true,premultiplyAlpha:true}},null,2)+"\n");
        }
        const png=await sharp(file).resize(96,112,{fit:"contain",background:"#26332d"}).toBuffer();
        const i=sheets.length;sheets.push({input:png,left:i%8*108,top:Math.floor(i/8)*124});
    }
    await sharp({create:{width:864,height:372,channels:4,background:"#26332d"}}).composite(sheets).png()
        .toFile(path.join(root,"tmp/combat-release/equipment-icons.png"));
    console.log("24种装备器型PNG及精灵导入元数据已生成");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
