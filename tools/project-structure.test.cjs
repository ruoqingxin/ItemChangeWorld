const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {root,walk,createPrefabResolver}=require("./ui-prefab.cjs");
const resolver=createPrefabResolver();
let views=0,bindings=0;
for(const file of walk(path.join(root,"src/script/module")).filter(p=>p.endsWith("View.ts"))){
    const source=fs.readFileSync(file,"utf8"),name=path.basename(file,".ts");
    if(!source.includes("get path()"))continue;
    const asset=source.match(/return "(ui\/prefab\/module\/[^"]+\.lh)"/)?.[1];
    assert.ok(asset,`${name} 缺少预制路径`);
    assert.equal(path.basename(asset,".lh"),name);
    assert.ok(source.includes(`class ${name} extends `));
    const prefab=resolver.expand(asset),byId=new Map();
    const visit=n=>{byId.set(n._$id,n);for(const child of n._$child||[])visit(child);};
    visit(prefab);assert.equal(prefab._$type,"GWidget");
    const mapper=prefab._$comp.find(c=>c.scriptPath?.endsWith("ElementMapper.ts"));
    assert.ok(mapper,`${name} 缺少 ElementMapper`);
    const names=new Set();
    for(const ref of mapper.elements){
        const node=byId.get(ref._$ref);
        assert.ok(node,`${name} 无效节点引用 ${ref._$ref}`);
        assert.ok(!names.has(node.name),`${name} 重复绑定 ${node.name}`);
        names.add(node.name);bindings++;
    }
    for(const match of source.matchAll(/getElement(?:<[^>]+>)?\("([^"]+)"/g)){
        assert.ok(!match[1].includes("/"));
        assert.ok(names.has(match[1]),`${name} 未绑定 ${match[1]}`);
    }
    views++;
}
for(const file of walk(path.join(root,"src/script/module")).filter(p=>p.endsWith(".ts"))){
    const source=fs.readFileSync(file,"utf8");
    assert.doesNotMatch(source,/new Laya\.(?:GWidget|GTextField|GButton|GImage)\(/,`${file} 动态创建固定节点`);
    assert.doesNotMatch(source,/preview(?:Single|Build|Inventory)Trial|legacyMode|matchesCurrent|generateFreeMap/);
}
console.log(`工程结构：${views} 个独立界面、${bindings} 个节点绑定通过`);
