const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname,"..");
for (const view of ["SkillBattleStartView","SkillBattleSettlementView"]) {
    const file = path.join(root,"assets/ui/prefab/module/skillBattle",`${view}.lh`);
    const prefab = JSON.parse(fs.readFileSync(file,"utf8"));
    const mapper = prefab._$comp.find(c => c.scriptPath?.endsWith("ElementMapper.ts"));
    const ids = new Set();
    const collect = n => { ids.add(n._$id); (n._$child || []).forEach(collect); };
    prefab._$child.filter(n => n.name === "expeditionRoot").forEach(collect);
    const inventory=prefab._$child.find(n=>n.name==="inventoryRoot");
    const searchNodes=new Set(["expUnknown","expSearchSpinner"]);
    inventory._$child.filter(n=>searchNodes.has(n.name)).forEach(collect);
    inventory._$child=inventory._$child.filter(n=>!searchNodes.has(n.name));
    prefab._$child = prefab._$child.filter(n => n.name !== "expeditionRoot");
    mapper.elements = mapper.elements.filter(e => !ids.has(e._$ref));
    let count = 0;
    const node = (name,type,x,y,width,height,extra={}) => {
        const n = { _$id:`exp_${view}_${++count}`, _$type:type,name,x,y,width,height,...extra };
        mapper.elements.push({_$ref:n._$id}); return n;
    };
    const text = (name,x,y,w,h,size=20) => node(name,"GTextField",x,y,w,h,
        {text:"",fontSize:size,color:"#e8edf0",mouseEnabled:false});
    const button = (name,x,y,w,h) => node(name,"GWidget",x,y,w,h,{mouseEnabled:true,_$child:[
        node(name+"Skin","GImage",0,0,w,h,{src:"ui/texture/inventory/tooltip.png",autoSize:false,mouseEnabled:false}),
        text(name+"Text",4,2,w-8,h-4,18),
    ]});
    const panel = node("expeditionRoot","GWidget",0,0,1280,720,{visible:false,mouseThrough:true,_$child:[]});
    const children = panel._$child;
    children.push(node("expLines","GWidget",0,0,1280,720,{mouseEnabled:false}));
    children.push(text("expTitle",32,14,620,42,26),text("expClock",1080,16,168,40,22));
    children.push(text("expResources",32,64,1216,38),text("expStatus",180,548,920,42));
    children.push(text("expNotice",32,592,1216,34,18));
    for (let i=1;i<=32;i++) {
        const n=button(`expNode${i}`,0,0,126,66);
        n._$child.push(node(`expNode${i}Icon`,"GImage",5,11,36,36,{autoSize:false,mouseEnabled:false}));
        n._$child[1].x=44; n._$child[1].width=78;
        children.push(n);
    }
    for(const [name,x,w] of [["expPrev",32,70],["expNext",1178,70],["expStorage",130,180],
        ["expBuild",332,180],["expUse",534,250],["expAbandon",1000,248]]) children.push(button(name,x,640,w,48));
    inventory._$child.push(
        node("expUnknown","GImage",1194,86,32,32,{visible:false,autoSize:false,mouseEnabled:false,
            color:"#080b0c",src:"ui/atlas/module/expedition/search_active.png"}),
        node("expSearchSpinner","GWidget",1188,80,44,44,{visible:false,mouseEnabled:false}));
    prefab._$child.push(panel);
    fs.writeFileSync(file,JSON.stringify(prefab,null,2)+"\n");
}
console.log("Updated two mapped expedition roots.");
