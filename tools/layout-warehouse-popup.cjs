// 仓库独立组合公共储物片段，固定布局保存在预制体，避免影响行前整备和结算。
const fs = require("node:fs");
const path = require("node:path");
const { createPrefabResolver, assets, walk: filesUnder } = require("./ui-prefab.cjs");
const resolver = createPrefabResolver();
const target = "ui/prefab/module/inventory/SkillBattleInventoryView.lh";
const read = file => structuredClone(resolver.read(file));
function inline(raw) {
    if (raw._$prefab && !raw.name?.match(/^inv(Item|List|Held)/)) {
        const source = read(resolver.prefabPath(raw._$prefab));
        for (const [key, value] of Object.entries(raw)) if (!key.startsWith("_$")) source[key] = value;
        return inline(source);
    }
    if (raw._$child && !raw._$prefab) raw._$child = raw._$child.map(inline);
    return raw;
}
const inventory = inline(read("ui/prefab/common/inventory/InventoryPanel.lh"));
const nodes = {};
function index(n) { if (n.name) nodes[n.name] = n; for (const c of n._$child || []) index(c); }
index(inventory);
function walk(n, fn) { fn(n); if (!n._$prefab) for (const c of n._$child || []) walk(c, fn); }
walk(inventory, n => {
    delete n.relations;
    if (n._$type === "GTextField") { n.font = "KaiTi"; n.letterSpacing = 0; }
    if (n.src?.startsWith("res://")) n.src = "ui/atlas/module/inventory/cell.png";
    if (n._$type === "GImage" && /(?:Bg|Skin)$/.test(n.name) &&
        !/^inv(?:Weapon|Container|Cell_)/.test(n.name))
        n.src = "ui/atlas/module/warehouse/button-page.png";
});
function set(name, props) { Object.assign(nodes[name], props); }
function move(name, parent, props) {
    function remove(n) {
        n._$child = (n._$child || []).filter(c => c !== nodes[name]);
        for (const c of n._$child) if (!c._$prefab) remove(c);
    }
    remove(inventory); nodes[parent]._$child.push(nodes[name]); set(name, props);
}
set("inventoryRoot", { width:1184, height:608 });
set("headerArea", { visible:false });
set("actionsArea", { visible:false });
set("carryArea", { x:16, y:16, width:648, height:338 });
set("invLeftPanel", { x:216, y:0, width:432, height:242, src:"ui/atlas/module/warehouse/popup-equipment.png" });
set("equipmentArea", { x:216, y:0, width:432, height:242 });
set("invEquipTitle", { x:16, y:8, width:400, height:28 });
for (let i=0;i<6;i++) set("invEquipCell_weapon_"+i, { x:16+i%2*56, y:44+Math.floor(i/2)*56 });
set("invWeapon", { x:16, y:44 });
set("invWeaponName", { x:16, y:211, width:110, height:25, align:"center" });
set("safeItemsArea", { x:0, y:0, width:200, height:320 });
set("invSafeTitle", { x:16, y:8, width:150, height:28 });
set("invLock", { x:174, y:12, width:18, height:18 });
set("invProtection", { x:16, y:238, width:168, height:48, align:"center" });
for (let i=0;i<2;i++) set("invCell_safe_"+i, { x:20+i*56, y:56 });
set("battleItemsArea", { x:216, y:246, width:432, height:92 });
set("invBattleTitle", { x:16, y:4, width:400, height:26 });
for (let i=0;i<5;i++) set("invCell_battle_"+i, { x:16+i*56, y:32 });
set("bagArea", { x:184, y:362, width:480, height:230 });
set("invBagPanel", { x:0, y:0, width:480, height:230, src:"ui/atlas/module/warehouse/popup-bag.png" });
set("invBagTopbar", { alpha:0 });
set("invBagTitle", { x:16, y:6, width:372, height:28 });
set("bagItemsArea", { _$type:"GPanel", x:16, y:46, width:446, height:166 });
set("invEmptyBag", { x:0, y:40, width:446, height:70, align:"center" });
set("sourceArea", { x:688, y:16, width:480, height:576 });
set("invRightPanel", { width:480, height:576, src:"ui/atlas/module/warehouse/popup-source.png" });
set("invSourceTitle", { x:16, y:8, width:446, height:28 });
set("sourceFiltersArea", { x:16, y:50 });
for (const name of ["invAll","invMedicine","invMaterials","invEquipment"])
    set(name+"Bg",{src:"ui/atlas/module/warehouse/"+(name==="invEquipment"?"tab-wide":"tab")+".png"});
set("sourceItemsArea", { x:16, y:90 });
set("invReveal", { x:16, y:50, width:180, height:30 });
set("invRevealBg", { width:180, height:30, src:"ui/atlas/module/warehouse/tab-wide.png" });
set("invRevealText", { x:8, y:0, width:164, height:30 });
set("sourcePagesArea", { x:16, y:518 });
set("noticeArea", { x:704, y:502, width:446, height:26 });
set("invNotice", { width:446, height:26 });
set("itemPoolArea", { width:1184, height:608 });
set("dragFeedbackArea", { width:1184, height:608 });
const id = name => "warehouse_popup_"+name;
function widget(name,x,y,width,height,children=[],props={}) {
    return { _$id:id(name), _$type:"GWidget", name,x,y,width,height,mouseThrough:true,...props,_$child:children };
}
function image(name,x,y,width,height,src) {
    return { _$id:id(name), _$type:"GImage", name,x,y,width,height,autoSize:false,mouseEnabled:false,src };
}
function text(name,x,y,width,height,value,size=18) {
    return { _$id:id(name), _$type:"GTextField", name,x,y,width,height,text:value,font:"KaiTi",
        fontSize:size,color:"#e6dfc4",align:"center",valign:"middle",mouseEnabled:false,letterSpacing:0 };
}
function button(name,x,y,width,height,src,caption) {
    return widget(name,x,y,width,height,[
        image("img_"+name+"_skin",0,0,width,height,src),
        text("txt_"+name,0,0,width,height,caption),
    ], {mouseEnabled:true,mouseThrough:false});
}
nodes.safeItemsArea._$child.unshift(image("img_safe_well",0,0,200,320,"ui/atlas/module/warehouse/popup-safe.png"));
// 归真匣固定搭建最大九格，运行时仅显示实际容量，不增加物品或解锁进度。
for (let i=2;i<9;i++) {
    if(nodes["invCell_safe_"+i])continue;
    const cell=structuredClone(nodes.invCell_safe_0);
    function rename(n) {
        n._$id=id(n.name.replace("safe_0","safe_"+i));
        n.name=n.name.replace("safe_0","safe_"+i);
        for(const c of n._$child||[])rename(c);
    }
    rename(cell); cell.visible=false;
    nodes.safeItemsArea._$child.push(cell);
}
nodes.battleItemsArea._$child.unshift(image("img_battle_well",0,0,432,92,"ui/atlas/module/warehouse/popup-battle.png"));
for (const [kind,cols,rows,x,y] of [["armor",2,3,306,44],["accessory",2,2,160,130]]) {
    for(let i=0;i<cols*rows;i++)
        nodes.equipmentArea._$child.push(image("img_"+kind+"_cell_"+i,x+i%cols*56,y+Math.floor(i/cols)*56,
            54,54,"ui/atlas/module/inventory/cell.png"));
}
nodes.equipmentArea._$child.push(
    text("txt_armor_name",306,211,110,25,"防具",16),
    text("txt_accessory_name",164,172,102,26,"饰品",16),
);
const backpack=widget("backpackEquipmentArea",16,362,152,174,[
    image("img_backpack_well",0,0,152,174,"ui/atlas/module/warehouse/popup-backpack.png"),
    text("txt_backpack_title",16,6,120,28,"背包",18),
]);
nodes.backpackEquipmentArea=backpack;
inventory._$child.push(backpack);
for(let i=0;i<4;i++) move("invEquipCell_container_"+i,"backpackEquipmentArea",
    {x:20+i%2*56,y:40+Math.floor(i/2)*56});
move("invContainer","backpackEquipmentArea",{x:20,y:40});
move("invContainerName","backpackEquipmentArea",{x:16,y:150,width:120,height:22,align:"center"});
const rotate = nodes.invRotate;
move("invRotate","carryArea",{x:112,y:288,width:44,height:44});
Object.assign(rotate._$child[0],{width:44,height:44,src:"ui/atlas/module/warehouse/button-square.png"});
Object.assign(rotate._$child[1],{x:0,y:0,width:44,height:44});
const navigation = widget("navigationArea",0,0,128,48,[
    button("invToggle",0,0,128,48,"ui/atlas/module/warehouse/button-back.png",""),
],{visible:false});
inventory._$child.push(navigation);
// 所有静态信息与按钮提前搭建；数据渲染仅控制显隐及文本。
const close = button("btn_lobby_back",16,548,144,44,"ui/atlas/module/warehouse/button-close.png","关闭");
close._$child[1].x=38; close._$child[1].width=92;
close._$child.push(image("img_close_back",14,12,20,20,"ui/atlas/module/lobby/back.png"));
const portrait = widget("box_inventory_portrait",392,60,110,80,[
    image("img_inventory_portrait",27,0,56,56,"ui/atlas/module/lobby/player-avatar.png"),
    text("txt_inventory_portrait",0,58,110,22,"道友",16),
]);
// 肖像素材沿用大厅真实资源。
const lobby = resolver.expand("ui/prefab/module/lobby/LobbyView.lh");
function find(n, predicate) { if(predicate(n))return n; for(const c of n._$child||[]) { const v=find(c,predicate);if(v)return v; } }
const avatar=find(lobby,n=>n._$type==="GImage" && /portrait|avatar/.test(n.name||""));
if(avatar) portrait._$child[0].src=avatar.src;
const detail=widget("box_inventory_detail",792,272,360,240,[
    image("img_inventory_detail",0,0,360,240,"ui/texture/lobby/settings-panel.png"),
    widget("btn_detail_close",316,8,32,32,[
        image("img_detail_close",6,6,20,20,"ui/atlas/module/lobby/close.png"),
    ],{mouseEnabled:true,mouseThrough:false}),
],{visible:false,mouseEnabled:true,mouseThrough:false});
nodes.inventoryDetailArea=detail;
move("invDetail","inventoryDetailArea",{x:20,y:24,width:292,height:196});
const popup = widget("box_inventory_popup",48,56,1184,608,[
    image("img_inventory_popup",0,0,1184,608,"ui/atlas/module/warehouse/popup-frame.png"),
    inventory,portrait,close,
    button("btn_bag_up",592,364,32,32,"ui/atlas/module/warehouse/button-square.png",""),
    button("btn_bag_down",632,364,32,32,"ui/atlas/module/warehouse/button-square.png",""),
    widget("box_warehouse_empty",184,362,480,230,[
        {...text("txt_warehouse_empty",260,6,202,28,"尚未开始整备",16),align:"right",color:"#9faf9f"},
    ],{visible:false,mouseEnabled:false}),
    widget("box_warehouse_source_empty",704,502,446,26,[
        text("txt_warehouse_empty_status",0,0,446,26,"仓库为空",16),
    ],{visible:false,mouseEnabled:false}),
    detail,
],{mouseEnabled:true,mouseThrough:false,relations:[
    {_$type:"Relation",target:{_$ref:"warehouse_popup_adapter"},data:[6,0,13,0]},
]});
for(const [name,rotation] of [["btn_bag_up",90],["btn_bag_down",270]]) {
    const b=popup._$child.find(c=>c.name===name);
    b._$child.push({...image("img_"+name+"_arrow",16,16,14,18,"ui/atlas/module/inventory/arrow.png"),
        anchorX:0.5,anchorY:0.5,rotation});
}
const adapter=widget("adapter",0,0,1280,720,[
    widget("storageBackdropArea",0,0,1280,720,[widget("result",0,0,1280,720,[],{visible:false})]),
    popup,
],{relations:[{_$type:"Relation",target:{_$ref:"page_SkillBattleInventoryView"},data:[1,0,2,0]}]});
const root={_$id:"page_SkillBattleInventoryView",_$type:"GWidget",name:"SkillBattleInventoryView",
    width:1280,height:720,_$child:[adapter],_$ver:1};
const elements=[];
function bind(n,scope=[]) {
    if(n.name)elements.push({_$ref:scope.length?[...scope,n._$id]:n._$id});
    if(n._$prefab) {
        const source=read(resolver.prefabPath(n._$prefab));
        for(const c of source._$child||[])bind(c,[...scope,n._$id]);
    } else for(const c of n._$child||[])bind(c,scope);
}
for(const n of root._$child)bind(n);
root._$comp=[{_$type:"3593fc26-337e-42e3-92dc-1b9c2bb8f988",
    scriptPath:"../src/script/games/ui/components/ElementMapper.ts",
    adapter:{_$ref:adapter._$id},mapperType:2,elements}];
fs.writeFileSync(path.join(assets,target),JSON.stringify(root,null,2)+"\n");
const verified = createPrefabResolver().expand(target);
const ids=new Set(), references=[], dependencies=new Set();
function inspect(value) {
    if(typeof value==="string" && value.startsWith("ui/")) {
        if(!fs.existsSync(path.join(assets,value)))throw Error("资源不存在："+value);
        dependencies.add(value);
    } else if(Array.isArray(value))value.forEach(inspect);
    else if(value && typeof value==="object") {
        if(value._$id) {if(ids.has(value._$id))throw Error("节点编号重复："+value._$id);ids.add(value._$id);}
        if(value._$ref)references.push(value._$ref);
        Object.values(value).forEach(inspect);
    }
}
inspect(verified);
for(const ref of references)if(!ids.has(ref))throw Error("节点引用不存在："+ref);
// 原生子预制及动态品质、物品图标仍通过项目依赖表预载。
function nativeDeps(n) {
    if(n._$prefab)dependencies.add(resolver.prefabPath(n._$prefab));
    for(const c of n._$child||[])nativeDeps(c);
}
nativeDeps(root);
for(const file of filesUnder(path.join(assets,"ui")).filter(file=>file.endsWith(".png"))) {
    const relative=path.relative(assets,file).replaceAll("\\","/");
    if(["ui/atlas/module/inventory/","ui/texture/inventory/","ui/image/naxu/","ui/image/expeditionNodes/"]
        .some(prefix=>relative.startsWith(prefix)))dependencies.add(relative);
}
const dependencyPath=path.join(assets,"ui/ui-deps.json");
const dependencyMap=JSON.parse(fs.readFileSync(dependencyPath,"utf8"));
dependencyMap[target]=[...dependencies].sort();
fs.writeFileSync(dependencyPath,JSON.stringify(dependencyMap,null,2)+"\n");
console.log(`仓库弹窗预制体已组合并校验：${ids.size} 个节点，${dependencies.size} 项依赖。`);
