const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,".."),assets=path.join(root,"assets");
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+"\n");
const out=path.join(assets,"ui/atlas/module/inventory");
fs.mkdirSync(out,{recursive:true});
const reference=path.join(root,"art/reference/cultivation");
const sourceRoot=process.env.INVENTORY_SOURCE_ROOT||"E:/资源/修仙宗门搜打撤/extracted_assets/images";
const panels=new Set(["warehouse-body","backpack-body","topbar","tooltip"]);
const runtimePath=name=>`ui/${panels.has(name)?"texture/inventory":"atlas/module/inventory"}/${name}.png`;
const provenance=[];
function copy(source,name,note=""){
    const dest=path.join(assets,runtimePath(name)),old=path.join(out,name+".png");
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    if(old!==dest&&fs.existsSync(old)){
        if(fs.existsSync(dest)||fs.existsSync(dest+".meta"))throw Error(`Asset move collision: ${dest}`);
        fs.renameSync(old,dest);
        if(fs.existsSync(old+".meta"))fs.renameSync(old+".meta",dest+".meta");
    }
    fs.copyFileSync(source,dest);
    if(!fs.existsSync(dest+".meta"))write(dest+".meta",{uuid:crypto.randomUUID()});
    provenance.push({file:runtimePath(name),source,
        sha256:crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex"),note});
}
for(const name of ["flower-flask","blue-flask","herb-sprig","spirit-fruit","fire-ring"])
    copy(path.join(reference,"items",name+".png"),name);
copy(path.join(reference,"items/blue-blade.png"),"gold-sword",
    "沿用配置图标键；显示选用真实刀剑外观。候选 gold-sword 原图实际是卷轴，不用于武器");
for(const [group,name,target]of[
    ["controls","storage-cell","cell"],["controls","lock-closed","lock"],
    ["grids","selection-overlay","selection"],["grids","equipment-cell","equipment-cell"],
    ["frames","quality-1","item-frame"],["frames","compact-quality-2","item-frame-selected"],
    ["panels","warehouse-body","warehouse-body"],["panels","backpack-body","backpack-body"],
    ["panels","backpack-topbar","topbar"],["panels","item-tooltip-body","tooltip"],
])copy(path.join(reference,group,name+".png"),target);
const itemAtlas="itemui_983e94da1a7aea0ae4d3f64e92b7582a_";
for(const [file,name,note]of[
    [itemAtlas+"item_166_1732596632810013890.png","sword-book","卷轴外观临时代指书籍，不依据原游戏物品语义赋予效果"],
    [itemAtlas+"item_166_1732596632810013890.png","earth-book","同卷轴外观，名称与形状以本项目源表为准"],
    [itemAtlas+"item_163_-748384340853660908.png","repair-tool","符纸外观代指修补工具，非新增战斗符箓"],
    [itemAtlas+"item_149_155045131931138061.png","ore","矿晶外观，普通矿材占格仍由配置决定"],
    [itemAtlas+"item_121_765490611520116238.png","storage-bag","包裹外观暂代纳虚囊；不是正式最终法宝图"],
    ["protectchoosepanelui_84dceb194fdffda1bc5b2dceccb284cb_img_bmf_jiantou1_-7376237031672629264.png","arrow","原图箭头，用于旋转按钮"],
])copy(path.join(sourceRoot,"sprites",file),name,note);
write(path.join(out,"sources.json"),{date:"2026-11-09",rights:"用户提供第三方素材，发布授权仍待核实",assets:provenance});
if(!fs.existsSync(path.join(out,"sources.json.meta")))write(path.join(out,"sources.json.meta"),{uuid:crypto.randomUUID()});

for(const view of ["SkillBattleStartView","SkillBattleSettlementView"]){
    const file=path.join(assets,"ui/prefab/module/skillBattle",view+".lh"),prefab=read(file);
    const prefix=view==="SkillBattleStartView"?"invstart":"invsettle";
    const map=prefab._$comp.find(c=>c.scriptPath?.endsWith("ElementMapper.ts"));
    const ids=new Set();
    const collect=n=>{if(n.name?.startsWith("inv"))ids.add(n._$id);for(const c of n._$child||[])collect(c);};
    prefab._$child.forEach(collect);
    prefab._$child=prefab._$child.filter(n=>!n.name?.startsWith("inv"));
    map.elements=map.elements.filter(r=>!ids.has(r._$ref));
    let count=0;
    const node=(name,type,x,y,width,height,extra={})=>{
        const n={_$id:`${prefix}_${++count}`,_$type:type,name,x,y,width,height,...extra};
        map.elements.push({_$ref:n._$id});return n;
    };
    const image=(name,src,x,y,w,h,extra={})=>node(name,"GImage",x,y,w,h,
        {src:runtimePath(src),autoSize:false,mouseEnabled:false,...extra});
    const text=(name,x,y,w,h,size=18)=>node(name,"GTextField",x,y,w,h,
        {text:"",fontSize:size,color:"#ecefe7",mouseEnabled:false});
    const button=(name,x,y,w,h,label="",skin="tooltip")=>node(name,"GWidget",x,y,w,h,{mouseEnabled:true,_$child:[
        image(name+"Bg",skin,0,0,w,h),text(name+"Text",8,3,w-16,h-6,18),
    ]});
    // This mapped root lives in the same reusable UIBaseView prefab as the construction screen.
    const panel=node("inventoryRoot","GWidget",0,0,1280,720,{visible:false,mouseThrough:true,_$child:[]});
    const children=panel._$child;
    children.push(image("invLeftPanel","warehouse-body",16,72,310,524));
    children.push(image("invBagPanel","backpack-body",342,112,424,310));
    children.push(image("invBagTopbar","topbar",342,76,424,36));
    children.push(image("invRightPanel","warehouse-body",784,72,480,524));
    for(const [name,x,y,w,h,size]of[
        ["invTitle",24,14,590,46,26],["invClock",1080,16,174,40,22],
        ["invEquipTitle",34,88,272,28,18],["invBattleTitle",34,248,272,28,18],
        ["invSafeTitle",34,354,272,28,18],["invProtection",34,466,272,108,18],
        ["invBagTitle",350,80,414,30,20],["invSourceTitle",804,88,436,30,20],
        ["invDetail",350,440,414,146,18],["invNotice",24,600,1228,32,18],
        ["invPage",956,552,148,32,17],["invWeaponName",112,128,192,56,17],
        ["invContainerName",112,192,192,56,17],["invEmptyBag",364,192,382,120,22],
    ])children.push(text(name,x,y,w,h,size));
    for(const [name,x,y]of[["invWeapon",34,124],["invContainer",34,188]]){
        const n=button(name,x,y,60,60,"","equipment-cell");
        n._$child.push(image(name+"Icon","gold-sword",7,7,46,46));children.push(n);
    }
    for(const [space,num,x,y,size]of[["battle",5,34,282,52],["safe",2,34,388,64],["bag",48,350,120,50]]){
        for(let i=0;i<num;i++){
            const cols=space==="bag"?8:num;
            children.push(button(`invCell_${space}_${i}`,x+i%cols*size,y+Math.floor(i/cols)*size,size-2,size-2,"","cell"));
        }
    }
    for(let i=0;i<60;i++){
        const item=button(`invItem${i}`,0,0,48,48,"","item-frame");
        item._$child.push(image(`invItem${i}Icon`,"herb-sprig",6,6,36,36));
        item._$child.push(text(`invItem${i}Caption`,2,28,44,18,12));
        children.push(item);
    }
    const ghost=image("invGhost","item-frame-selected",0,0,48,48,{visible:false,alpha:0.5});children.push(ghost);
    for(let i=0;i<8;i++){
        const n=button(`invList${i}`,804,146+i*49,436,46);
        n._$child[1].x=56;n._$child[1].width=370;
        n._$child.push(image(`invList${i}Icon`,"herb-sprig",7,4,38,38));children.push(n);
    }
    for(const [name,x,y,w,h]of[
        ["invAll",804,118,100,28],["invMedicine",908,118,100,28],["invMaterials",1012,118,100,28],["invEquipment",1116,118,124,28],
        ["invPrev",804,550,64,38],["invNext",1176,550,64,38],
        ["invRotate",350,640,56,54],["invCancel",418,640,108,54],["invConfirm",538,640,226,54],
        ["invUse",34,640,134,54],["invDrop",180,640,134,54],["invPrimary",1002,640,238,54],
        ["invExtract",794,640,192,54],["invReveal",804,552,144,38],
        ["invNodePrev",794,16,56,40],["invNodeNext",856,16,56,40],["invAbandon",924,16,142,40],
    ])children.push(button(name,x,y,w,h));
    const rotate=children.find(n=>n.name==="invRotate");
    rotate._$child.push(image("invRotateIcon","arrow",17,12,22,30,{rotation:90}));
    children.push(image("invLock","lock",268,354,28,28));
    prefab._$child.push(panel);
    // The tab remains accessible while the construction panel is visible.
    const toggle=node("invToggle","GWidget",24,78,128,48,{visible:false,_$child:[
        text("invToggleText",4,4,120,40,18),
    ]});
    prefab._$child.push(toggle);
    write(file,prefab);
}
// Laya requires script metadata for new modules.
for(const directory of ["newRules","view"]){
    const dir=path.join(root,"src/script/module/skillBattle",directory);
    for(const name of fs.readdirSync(dir).filter(n=>n.startsWith("NewInventory")&&n.endsWith(".ts"))){
        if(!fs.existsSync(path.join(dir,name+".meta")))write(path.join(dir,name+".meta"),{uuid:crypto.randomUUID()});
    }
}
console.log(`Imported ${provenance.length} unchanged PNGs; storage controls mapped in both landscape prefabs.`);
