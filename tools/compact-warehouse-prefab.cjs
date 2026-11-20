// 精简当前仓库预制，保留编辑器调整的位置，只替换重复节点和失效映射。
const fs=require("node:fs"),path=require("node:path");
const {assets}=require("./ui-prefab.cjs");
const target=path.join(assets,"ui/prefab/module/inventory/SkillBattleInventoryView.lh");
const prefab=JSON.parse(fs.readFileSync(target,"utf8")),nodes={};
function index(n){nodes[n.name]=n;for(const c of n._$child||[])index(c);}
index(prefab);
const id=n=>"warehouse_compact_"+n;
function box(name,x,y,width,height,children=[]){
    return {_$id:id(name),_$type:"GWidget",name,x,y,width,height,mouseThrough:true,_$child:children};
}
function text(name,x,y,width,height,value,size=16){
    return {_$id:id(name),_$type:"GTextField",name,x,y,width,height,text:value,font:"KaiTi",
        fontSize:size,color:"#b9c9bf",mouseEnabled:false,align:"center",valign:"middle",letterSpacing:0};
}
const cellPath=path.join(assets,"ui/prefab/common/inventory/InventoryGridCell.lh");
const cellUuid="43a9e84b-705b-44df-94a9-20eb046942b9";
const cell=box("InventoryGridCell",0,0,54,54,[
    {_$id:"warehouse_cell_image",_$type:"GImage",name:"img_cell",width:54,height:54,
        src:"ui/atlas/module/inventory/cell.png",autoSize:false,mouseEnabled:false},
]);
cell._$id="warehouse_grid_cell";cell._$ver=1;cell.mouseEnabled=true;cell.mouseThrough=false;
fs.writeFileSync(cellPath,JSON.stringify(cell,null,2)+"\n");
if(!fs.existsSync(cellPath+".meta"))fs.writeFileSync(cellPath+".meta",JSON.stringify({uuid:cellUuid},null,2)+"\n");
function grid(name,x,y,width,height,cols,count){
    return {_$id:id(name),_$type:"GList",name,x,y,width,height,mouseThrough:true,
        layout:{type:3,columns:cols,rowGap:2,columnGap:2},
        _templateNode:{_$ref:id(name+"_template")},
        _$child:[{_$id:id(name+"_template"),_$prefab:cellUuid,name:"box_cell_template"}],
        _warehouseCount:count};
}
const safe=nodes.safeItemsArea,battle=nodes.battleItemsArea,bag=nodes.bagItemsArea,source=nodes.sourceItemsArea;
safe._$child=safe._$child.filter(n=>!/^invCell_safe_/.test(n.name)&&!["list_safe_cells","box_safe_content"].includes(n.name));
const safeTop=42,safeBottom=12,safeH=safe.height-safeTop-safeBottom;
safe._$child.push(box("box_safe_content",10,safeTop,safe.width-20,safeH,[
    grid("list_safe_cells",(safe.width-20-110)/2,(safeH-54)/2,110,54,2,2),
]));
battle._$child=battle._$child.filter(n=>!/^invCell_battle_/.test(n.name)&&n.name!=="list_battle_cells");
battle._$child.push(grid("list_battle_cells",(battle.width-278)/2,32,278,54,5,5));
bag.width=390;bag._$child=[grid("list_bag_cells",0,0,390,110,7,12)];
source._$child=[grid("list_source_cells",0,0,446,390,8,56)];
// 物品和拖拽反馈按需实例化，固定容器仍在主预制体维护。
nodes.inventoryRoot._$child=nodes.inventoryRoot._$child.filter(n=>!["itemPoolArea","dragFeedbackArea","box_drag_feedback"].includes(n.name));
nodes.inventoryRoot._$child.push(box("box_drag_feedback",0,0,nodes.inventoryRoot.width,nodes.inventoryRoot.height));
const popup=nodes.box_inventory_popup;
popup._$child=popup._$child.filter(n=>!["box_warehouse_empty","txt_inventory_notice","txt_inventory_page_status","box_item_template"].includes(n.name));
popup._$child.push(text("txt_inventory_notice",184,592,984,16,"",14));
// 背包标题与翻动按钮共用面板头部，七列网格不会伸出用户调整后的面板。
nodes.invBagTitle.width=nodes.bagArea.width-104;
nodes.btn_bag_up.x=nodes.bagArea.x+nodes.bagArea.width-74;
nodes.btn_bag_down.x=nodes.bagArea.x+nodes.bagArea.width-34;
nodes.invBagPanel.width=nodes.bagArea.width;
nodes.invBagTopbar.width=nodes.bagArea.width;
// 右侧保持现有完整八列，末端留在弹窗内。
nodes.sourceArea.x=Math.min(nodes.sourceArea.x,popup.width-nodes.sourceArea.width-16);
nodes.invSourceTitle.width=190;
const status=text("txt_inventory_page_status",nodes.sourceArea.x+210,nodes.sourceArea.y+10,250,24,"",16);
status.align="right";popup._$child.push(status);
nodes.box_inventory_detail.x=nodes.sourceArea.x+nodes.sourceArea.width-nodes.box_inventory_detail.width-16;
nodes.sourcePagesArea._$child=nodes.sourcePagesArea._$child.filter(n=>!["invPage","invPrev","invNext"].includes(n.name));
const itemMeta=JSON.parse(fs.readFileSync(path.join(assets,"ui/prefab/common/inventory/InventoryItem.lh.meta")));
// 隐藏模板由依赖表预载，不预置六十个空物品实例。
popup._$child.push({_$id:id("box_item_template"),_$prefab:itemMeta.uuid,name:"box_item_template",visible:false});
const bindNames=new Set([
    "adapter","box_inventory_popup","inventoryRoot","equipmentArea","safeItemsArea","battleItemsArea","bagArea",
    "backpackEquipmentArea","bagItemsArea","sourceArea","sourceItemsArea","sourcePagesArea",
    "box_safe_content","box_drag_feedback","list_safe_cells","list_battle_cells","list_bag_cells","list_source_cells",
    "invSafeTitle","invBattleTitle","invBagTitle","invSourceTitle","invWeaponName","invWeapon","invContainer",
    "invAll","invMedicine","invMaterials","invEquipment","invReveal","box_item_template",
    "btn_bag_up","btn_bag_down","btn_lobby_back","box_inventory_detail","btn_detail_close","invDetail",
    "txt_inventory_notice","txt_inventory_page_status",...Array.from({length:7},(_,i)=>"expLootPage"+(i+1)),
]);
const refs=[];
function bind(n){
    if(bindNames.has(n.name))refs.push({_$ref:n._$id});
    delete n._warehouseCount;
    if(!n._$prefab)for(const c of n._$child||[])bind(c);
}
bind(prefab);
prefab._$comp.find(c=>c.elements).elements=refs;
fs.writeFileSync(target,JSON.stringify(prefab,null,2)+"\n");
console.log(`仓库保留 ${refs.length} 个有效映射，格子和物品已改为模板。`);
