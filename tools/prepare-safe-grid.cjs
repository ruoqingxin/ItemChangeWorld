// 扩展公共归真匣格子并同步原生子预制映射，实际格数由运行配置决定。
const fs=require("node:fs"),path=require("node:path");
const {root,assets,walk,createPrefabResolver}=require("./ui-prefab.cjs");
const file=path.join(assets,"ui/prefab/common/inventory/InventoryCarry.lh");
const prefab=JSON.parse(fs.readFileSync(file,"utf8"));
const area=prefab._$child.find(n=>n.name==="safeItemsArea");
area.y=378;area.height=146;
const extras=[];
for(let i=2;i<9;i++){
    const cell=structuredClone(area._$child.find(n=>n.name==="invCell_safe_0"));
    function update(n){
        n._$id=`safe_extra_${i}_${n._$id}`;n.name=n.name.replace("safe_0","safe_"+i);
        extras.push(n._$id);for(const c of n._$child||[])update(c);
    }
    update(cell);cell.visible=false;
    if(!area._$child.some(n=>n.name===cell.name))area._$child.push(cell);
}
fs.writeFileSync(file,JSON.stringify(prefab,null,2)+"\n");
const resolver=createPrefabResolver(),sourceIds=new Set(extras);
for(const file of walk(path.join(assets,"ui/prefab/module")).filter(f=>f.endsWith(".lh"))){
    if(file.endsWith("SkillBattleInventoryView.lh"))continue;
    const raw=JSON.parse(fs.readFileSync(file,"utf8")),mapper=raw._$comp?.find(c=>c.elements);
    if(!mapper)continue;
    const anchor=mapper.elements.find(e=>Array.isArray(e._$ref)&&e._$ref.at(-1)==="invstart_55");
    if(!anchor)continue;
    const expanded=resolver.expand(path.relative(assets,file).replaceAll("\\","/"));
    const available=new Set();
    function index(n){if(n._$id)available.add(n._$id);for(const c of n._$child||[])index(c);}
    index(expanded);
    for(const id of sourceIds){
        const ref=[...anchor._$ref.slice(0,-1),id];
        if(!available.has(ref.join("/")))throw Error("归真匣扩展节点不存在："+ref.join("/"));
        if(!mapper.elements.some(e=>JSON.stringify(e._$ref)===JSON.stringify(ref)))mapper.elements.push({_$ref:ref});
    }
    fs.writeFileSync(file,JSON.stringify(raw,null,2)+"\n");
}
console.log("归真匣最大九格及引用已同步。");
