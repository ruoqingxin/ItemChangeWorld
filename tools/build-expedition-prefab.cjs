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
    inventory._$child.filter(n=>n._$id?.startsWith("exp_")).forEach(collect);
    inventory._$child=inventory._$child.filter(n=>!n._$id?.startsWith("exp_"));
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
    children.push(text("expTitle",32,14,620,42,26),text("expClock",1080,16,168,40,22));
    children.push(text("expResources",32,64,1216,38),text("expStatus",180,548,920,42));
    children.push(text("expNotice",32,592,1216,34,18));
    const viewport=node("expViewport","GPanel",32,112,936,430,{clipping:true,mouseEnabled:true,_$child:[]});
    const content=node("expMapContent","GWidget",0,0,936,430,{mouseThrough:true,_$child:[]});
    viewport._$child.push(content);children.push(viewport);
    content._$child.push(node("expLines","GWidget",0,0,936,430,{mouseEnabled:false}));
    for (let i=1;i<=32;i++) {
        const n=button(`expNode${i}`,0,0,116,132);
        n._$child[0].visible=false;
        n._$child.push(node(`expNode${i}Icon`,"GImage",6,0,104,104,{
            src:"ui/image/expeditionNodes/node-enemy-normal.png",autoSize:false,mouseEnabled:false}));
        n._$child[1].x=0;n._$child[1].y=104;n._$child[1].width=116;n._$child[1].height=28;
        content._$child.push(n);
    }
    content._$child.push(node("expPlayer","GWidget",0,0,116,116,{mouseEnabled:false}));
    children.push(node("expContextBackground","GImage",1000,192,248,282,{
        src:"ui/texture/inventory/tooltip.png",autoSize:false,mouseEnabled:false}));
    children.push(node("expContextIcon","GImage",1072,204,104,104,{
        src:"ui/image/expeditionNodes/node-start.png",autoSize:false,mouseEnabled:false}));
    children.push(text("expContextTitle",1012,316,224,56,22),button("expUse",1020,394,208,54));
    for(const [name,x,w] of [["expStorage",130,180],
        ["expBuild",332,180],["expAbandon",1000,248]]) children.push(button(name,x,640,w,48));
    inventory._$child.push(
        node("expUnknown","GImage",0,0,28,28,{visible:false,autoSize:false,mouseEnabled:false,
            color:"#202923",src:"ui/atlas/module/expedition/search_active.png"}),
        node("expSearchSpinner","GWidget",0,0,44,44,{visible:false,mouseEnabled:false}));
    for(let i=1;i<=7;i++) inventory._$child.push(button(`expLootPage${i}`,800+(i-1)*64,550,58,38));
    prefab._$child.push(panel);
    fs.writeFileSync(file,JSON.stringify(prefab,null,2)+"\n");
}
console.log("Updated two mapped expedition roots.");
