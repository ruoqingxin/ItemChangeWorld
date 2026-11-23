const fs=require("node:fs"),crypto=require("node:crypto"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const save=(p,v)=>fs.writeFileSync(path.join(root,p),JSON.stringify(v,null,2)+"\n");
function find(node,name){
    if(node.name===name)return node;
    for(const child of node._$child||[]){const n=find(child,name);if(n)return n;}
}
const file="assets/ui/prefab/module/inventory/SkillBattleInventoryView.lh",p=read(file);
const mapper=p._$comp.find(c=>c.elements),area=find(p,"equipmentArea"),weapon=find(p,"invWeapon");
function bind(n){if(!mapper.elements.some(r=>r._$ref===n._$id))mapper.elements.push({_$ref:n._$id});}
for(const [name,x,y,height] of [["invArmor",278,52,166],["invAccessory",146,108,110]]){
    if(find(p,name))continue;
    const clone=JSON.parse(JSON.stringify(weapon));
    const remap=n=>{
        n._$id="combat_"+name+"_"+(n.name||"node");n.name=n.name.replace("invWeapon",name);
        for(const child of n._$child||[])remap(child);
    };
    remap(clone);clone.name=name;clone.x=x;clone.y=y;clone.height=height;
    for(const c of clone._$child||[])if(c.height)c.height=Math.min(c.height,height);
    area._$child.push(clone);bind(clone);
}
if(!find(p,"btn_repair_all")){
    const button={_$id:"combat_repair_all",_$type:"GWidget",name:"btn_repair_all",x:146,y:8,width:242,height:32,_mouseState:2,
        tooltips:"按品质消耗愿力，修满当前三件装备",_$child:[
            {_$id:"combat_repair_skin",_$type:"GImage",name:"img_repair_skin",width:242,height:32,_mouseState:1,
                src:"ui/atlas/module/warehouse/graphite/button-normal.png",autoSize:false},
            {_$id:"combat_repair_text",_$type:"GTextField",name:"txt_repair_all",x:8,y:2,width:226,height:28,_mouseState:1,
                text:"修理",fontSize:15,color:"#e8e6df",align:"center",valign:"middle",overflow:"shrink"},
        ]};
    area._$child.push(button);bind(button);bind(button._$child[1]);
}
find(p,"btn_sell").tooltips="出售选中仓库物品，获得愿力";
save(file,p);
const detailFile="assets/ui/prefab/module/inventory/ItemDetailView.lh",detail=read(detailFile);
const panel=find(detail,"box_item_detail");panel.height=420;
find(detail,"img_detail_fill").height=410;find(detail,"img_detail_frame").height=420;
find(detail,"txt_item_detail").height=284;find(detail,"txt_item_detail").fontSize=15;find(detail,"txt_item_detail").leading=5;
if(!find(detail,"btn_item_action")){
    const action={_$id:"combat_item_action",_$type:"GWidget",name:"btn_item_action",x:20,y:358,width:292,height:40,mouseEnabled:true,_$child:[
        {_$id:"combat_item_action_skin",_$type:"GImage",name:"img_action_skin",width:292,height:40,mouseEnabled:false,
            src:"ui/atlas/module/warehouse/graphite/button-normal.png",autoSize:false},
        {_$id:"combat_item_action_text",_$type:"GTextField",name:"txt_item_action",x:8,y:4,width:276,height:32,fontSize:18,
            color:"#e8e6df",align:"center",valign:"middle",mouseEnabled:false,text:"使用"},
    ]};
    panel._$child.push(action);detail._$comp[0].elements.push({_$ref:action._$id},{_$ref:action._$child[1]._$id});
}
save(detailFile,detail);
const battleFile="assets/ui/prefab/module/skillBattle/SkillBattleBattleView.lh",battle=read(battleFile);
if(!find(battle,"qIntent4")){
    const clone=structuredClone(find(battle,"qIntent3")),refs=battle._$comp.find(c=>c.elements).elements;
    const remap=n=>{
        n._$id="combat_"+n.name.replace("3","4");n.name=n.name.replace("3","4");
        refs.push({_$ref:n._$id});for(const child of n._$child||[])remap(child);
    };
    remap(clone);
    const append=n=>{
        if((n._$child||[]).some(c=>c.name==="qIntent3")){n._$child.push(clone);return true;}
        return (n._$child||[]).some(append);
    };
    append(battle);save(battleFile,battle);
}
const buildFile="assets/ui/prefab/module/build/SkillBattleBuildView.lh",build=read(buildFile);
const buildMapper=build._$comp.find(c=>c.elements),buildArea=find(build,"buildActionsArea");
const duplicateChoiceIds=new Set(["warehouse0","warehouse1","warehouse2"].flatMap(name=>[
    "combat_build_"+name,"combat_build_txt_"+name]));
buildArea._$child=buildArea._$child.filter(n=>!duplicateChoiceIds.has(n._$id));
buildMapper.elements=buildMapper.elements.filter(n=>!duplicateChoiceIds.has(n._$ref));
for(const name of ["skill1","skill2","skill3","skill4","upgrade0","cancel","hub"]){
    if(find(build,name))continue;
    const clone=structuredClone(find(build,"newRun"));
    clone.name=name;clone._$id="combat_build_"+name;
    clone._$child=[{...clone._$child[0],name:"txt_"+name,_$id:"combat_build_txt_"+name}];
    buildArea._$child.push(clone);
    buildMapper.elements.push({_$ref:clone._$id},{_$ref:clone._$child[0]._$id});
}
save(buildFile,build);
for(const [file,name] of [
    ["assets/ui/prefab/module/gameplay/SkillBattleStartView.lh","manualTestEntry"],
    ["assets/ui/prefab/module/lobby/LobbySettingsView.lh","btn_manual_test"],
]){
    const prefab=read(file),removed=new Set();
    const collect=n=>{removed.add(n._$id);for(const child of n._$child||[])collect(child);};
    const strip=n=>{
        for(const child of n._$child||[])if(child.name===name)collect(child);else strip(child);
        if(n._$child)n._$child=n._$child.filter(child=>child.name!==name);
    };
    strip(prefab);
    for(const comp of prefab._$comp||[])if(comp.elements)comp.elements=comp.elements.filter(e=>!removed.has(e._$ref));
    save(file,prefab);
}
for(const target of [
    "src/script/module/skillBattle/types/CombatTypes.ts","src/script/module/skillBattle/utils/CombatConfig.ts",
    "src/script/module/skillBattle/utils/CombatEngine.ts",
])if(!fs.existsSync(path.join(root,target+".meta")))save(target+".meta",{uuid:crypto.randomUUID()});
for(const target of [
    "src/script/module/skillBattle/utils/QingmingBattleAdapter.ts","src/script/module/skillBattle/utils/QingmingConfig.ts",
    "src/script/module/skillBattle/utils/QingmingRules.ts","src/script/module/skillBattle/utils/GuzongEnemyRules.ts",
    "src/script/module/skillBattle/utils/WeaponTrialRules.ts","src/script/module/skillBattle/utils/EquipmentTrialRules.ts",
    "src/script/module/skillBattle/types/QingmingTypes.ts","src/script/module/skillBattle/types/WeaponTrialTypes.ts",
    "src/script/module/skillBattle/types/EquipmentTrialTypes.ts","src/script/module/build/utils/QingmingBuildRules.ts",
])if(!fs.existsSync(path.join(root,target))&&fs.existsSync(path.join(root,target+".meta")))fs.unlinkSync(path.join(root,target+".meta"));
console.log("已绑定防具、饰品、修理及详情操作节点，元数据已同步");
