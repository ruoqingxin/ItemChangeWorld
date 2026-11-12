const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,".."),assets=path.join(root,"assets");
if(JSON.parse(fs.readFileSync(path.join(assets,"ui/prefab/module/skillBattle/SkillBattleStartView.lh"),"utf8"))
    ._$child.some(n=>n.name==="adapter"))
    throw Error("UI pages have been split. Edit their individual prefabs; this historical stacking builder is disabled.");
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+"\n");
const out=path.join(assets,"ui/atlas/module/inventory");
fs.mkdirSync(out,{recursive:true});
const reference=path.join(root,"art/reference/cultivation");
const sourceRoot=process.env.INVENTORY_SOURCE_ROOT||"E:/资源/修仙宗门搜打撤/extracted_assets/images";
const panels=new Set(["warehouse-body","backpack-body","topbar","tooltip"]);
const runtimePath=name=>`ui/${panels.has(name)?"texture/inventory":"atlas/module/inventory"}/${name}.png`;
const cellSize=56;
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
    const meta=fs.existsSync(dest+".meta")?read(dest+".meta"):{uuid:crypto.randomUUID()};
    meta.importer={...meta.importer,textureType:2,sRGB:true,premultiplyAlpha:true};
    write(dest+".meta",meta);
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
for(let quality=1;quality<=6;quality++){
    const name=`quality-${quality}`;
    copy(path.join(reference,"frames",name+".png"),name,"用户指定六档品质框，原图不变，九宫拉伸");
    const file=path.join(assets,runtimePath(name))+".meta",meta=read(file);
    meta.importer={...meta.importer,textureType:2,sizeGrid:[8,8,8,8,0]};
    write(file,meta);
}
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
    const selection=n=>{
        const id=n._$id+"_selection";
        n._$child.push({_$id:id,_$type:"GWidget",name:n.name+"Selection",x:0,y:0,width:n.width,height:n.height,
            visible:false,mouseEnabled:false});
        map.elements.push({_$ref:id});
    };
    // This mapped root lives in the same reusable UIBaseView prefab as the construction screen.
    const panel=node("inventoryRoot","GWidget",0,0,1280,720,{visible:false,mouseThrough:true,_$child:[]});
    const children=panel._$child;
    children.push(image("invLeftPanel","warehouse-body",16,72,294,524));
    children.push(image("invBagPanel","backpack-body",318,112,460,350));
    children.push(image("invBagTopbar","topbar",318,76,460,36));
    children.push(image("invRightPanel","warehouse-body",784,72,480,524));
    for(const [name,x,y,w,h,size]of[
        ["invTitle",24,14,590,46,26],["invClock",1080,16,174,40,22],
        ["invEquipTitle",34,88,272,28,18],["invBattleTitle",34,350,272,28,18],
        ["invSafeTitle",34,454,272,28,18],["invProtection",158,486,148,88,16],
        ["invBagTitle",326,80,444,30,20],["invSourceTitle",800,88,440,30,20],
        ["invDetail",326,474,444,112,18],["invNotice",24,600,1228,32,18],
        ["invPage",956,552,148,32,17],["invWeaponName",34,296,132,52,17],
        ["invContainerName",184,242,120,96,17],["invEmptyBag",340,192,414,120,22],
    ])children.push(text(name,x,y,w,h,size));
    for(const [space,name,x,y,rows]of[["weapon","invWeapon",34,124,3],["container","invContainer",184,124,2]]){
        for(let i=0;i<2*rows;i++)
            children.push(image(`invEquipCell_${space}_${i}`,"cell",x+i%2*cellSize,y+Math.floor(i/2)*cellSize,cellSize-2,cellSize-2));
        const n=button(name,x,y,2*cellSize-2,rows*cellSize-2,"","item-frame");
        n._$child.push(image(name+"Icon","gold-sword",6,6,n.width-12,n.height-12));
        selection(n);children.push(n);
    }
    for(const [space,num,x,y,size]of[["battle",5,26,386,cellSize],["safe",2,34,490,cellSize],["bag",48,326,120,cellSize]]){
        for(let i=0;i<num;i++){
            const cols=space==="bag"?8:num;
            children.push(button(`invCell_${space}_${i}`,x+i%cols*size,y+Math.floor(i/cols)*size,size-2,size-2,"","cell"));
        }
    }
    for(let i=0;i<60;i++){
        const item=button(`invItem${i}`,0,0,cellSize-2,cellSize-2,"","quality-1");
        item._$child.push(image(`invItem${i}Icon`,"herb-sprig",6,6,cellSize-14,cellSize-14));
        item._$child.push(text(`invItem${i}Caption`,2,cellSize-22,cellSize-6,18,12));
        selection(item);children.push(item);
    }
    const ghost=image("invGhost","quality-1",0,0,cellSize-2,cellSize-2,{visible:false,alpha:0.5});children.push(ghost);
    for(let i=0;i<56;i++)
        children.push(image(`invSourceCell${i}`,"cell",800+i%8*cellSize,146+Math.floor(i/8)*cellSize,cellSize-2,cellSize-2));
    for(let i=0;i<56;i++){
        const n=button(`invList${i}`,800,146,cellSize-2,cellSize-2,"","quality-1");
        n._$child.push(image(`invList${i}Icon`,"herb-sprig",6,6,cellSize-14,cellSize-14));
        n._$child.push(text(`invList${i}Caption`,2,26,cellSize-6,20,12));selection(n);children.push(n);
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
    for(let i=0;i<48;i++)children.push(image(`invDragCell${i}`,"quality-1",0,0,cellSize-2,cellSize-2,
        {visible:false,alpha:0.65}));
    const held=node("invHeld","GWidget",0,0,cellSize-2,cellSize-2,{visible:false,mouseEnabled:false,mouseThrough:true,alpha:0.95,
        _$child:[image("invHeldBg","quality-1",0,0,cellSize-2,cellSize-2),text("invHeldText",0,0,cellSize-2,cellSize-2),
            image("invHeldIcon","herb-sprig",6,6,cellSize-14,cellSize-14),text("invHeldCaption",2,cellSize-22,cellSize-6,20,12)]});
    selection(held);children.push(held);
    children.push(image("invLock","lock",268,454,28,28));
    prefab._$child.push(panel);
    // The tab remains accessible while the construction panel is visible.
    const toggle=node("invToggle","GWidget",24,78,128,48,{visible:false,_$child:[
        text("invToggleText",4,4,120,40,18),
    ]});
    prefab._$child.push(toggle);
    write(file,prefab);
}
{
    const file=path.join(assets,"ui/prefab/module/skillBattle/SkillBattleBattleView.lh"),prefab=read(file);
    const map=prefab._$comp.find(c=>c.scriptPath?.endsWith("ElementMapper.ts"));
    for(let i=0;i<5;i++){
        const name=`pouchQuality${i}`,id=`inventory_pouch_quality_${i}`;
        prefab._$child=prefab._$child.filter(n=>n.name!==name);
        map.elements=map.elements.filter(n=>n._$ref!==id);
        prefab._$child.push({_$id:id,_$type:"GImage",name,src:runtimePath("quality-1"),
            x:458+i*112,y:544,width:30,height:30,autoSize:false,mouseEnabled:false,visible:false,zOrder:1});
        map.elements.push({_$ref:id});
        prefab._$child.find(n=>n.name===`pouchIcon${i}`).zOrder=2;
    }
    write(file,prefab);
}
// Laya requires script metadata for new modules.
for(const directory of ["data","manager","utils","types","view","ctrl"]){
    const dir=path.join(root,"src/script/module/inventory",directory);
    for(const name of fs.readdirSync(dir).filter(n=>n.endsWith(".ts"))){
        if(!fs.existsSync(path.join(dir,name+".meta")))write(path.join(dir,name+".meta"),{uuid:crypto.randomUUID()});
    }
}
console.log(`Imported ${provenance.length} unchanged PNGs; storage controls mapped in both landscape prefabs.`);
