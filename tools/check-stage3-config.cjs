const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),cp=require("node:child_process"),crypto=require("node:crypto");
const root=path.resolve(__dirname,".."),config=path.resolve(root,"../config");
function unpack(data){
    let p=4;const blocks=new Map();
    for(let i=0;i<data.readUInt32LE(0);i++){
        const n=data.readUInt32LE(p);p+=4;const name=data.toString("utf8",p,p+n);p+=n;
        const s=data.readUInt32LE(p);p+=4;blocks.set(name,data.subarray(p,p+s));p+=s;
    }
    assert.equal(p,data.length);return blocks;
}
const current=fs.readFileSync(path.join(root,"assets/config/configbin.bin")),blocks=unpack(current);
if(process.argv.includes("--inspect")) {
    global.Laya={Resource:class{},Byte:class{constructor(b){this.b=Buffer.from(b);this.pos=0;}
        readUTFBytes(n){const s=this.b.toString("utf8",this.pos,this.pos+n);this.pos+=n;return s;}}};
    const {Tables}=require("../bin/skill-battle-tests/script/config/schema.js");
    const ByteBuf=require("../bin/skill-battle-tests/script/config/bright/serialization/ByteBuf.js").default;
    for(const [cwd,file]of[[root,"assets/config/configbin.bin"],[config,"configbin.bin"]]){
        const before=unpack(cp.execFileSync("git",["show",`HEAD:${file}`],{cwd,encoding:null}));
        const t=new Tables(name=>new ByteBuf(new Uint8Array(before.get(name)||blocks.get(name))));
        for(const name of ["item","skill"])console.log(cwd,name,JSON.stringify(t[name].getDataList()));
    }
    process.exit(0);
}
for(const [cwd,file]of[[root,"assets/config/configbin.bin"],[config,"configbin.bin"]]){
    const before=unpack(cp.execFileSync("git",["show",`HEAD:${file}`],{cwd,encoding:null}));
    const changes=[...before].filter(([name,bytes])=>!blocks.get(name)?.equals(bytes)).map(([name])=>name);
    console.log(`${cwd}: old ${before.size}, now ${blocks.size}; changed existing blocks: ${changes.join(",")||"none"}`);
    assert.deepEqual(changes,[],"Do not silently change existing runtime tables");
    assert.deepEqual([...blocks.keys()].filter(k=>!before.has(k)).sort(),
        ["new_inventory_fixture","new_inventory_item","new_inventory_rule"]);
}
for(const [a,b]of[
    [path.join(root,"assets/config/configbin.bin"),path.join(config,"configbin.bin")],
    [path.join(root,"src/script/config/schema.ts"),path.join(config,"output_client/code/schema.ts")],
]){
    const x=fs.readFileSync(a),y=fs.readFileSync(b);assert.ok(x.equals(y));
    console.log(`${path.basename(a)}: ${crypto.createHash("sha256").update(x).digest("hex")}`);
}
