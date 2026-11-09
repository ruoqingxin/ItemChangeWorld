const {chromium}=require("playwright");
const sharp=require("sharp"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path");
const url=process.env.SKILL_BATTLE_URL||"http://127.0.0.1:18121";
const output=path.resolve(__dirname,"../bin/inventory-quality-browser");
async function main(){
    await fs.mkdir(output,{recursive:true});
    const browser=await chromium.launch({headless:true,channel:"chromium"});
    try{
        for(const viewport of [{width:1280,height:720},{width:1920,height:1080},{width:844,height:390}]){
            const tag=viewport.width<900?"mobile":viewport.width>1280?"wide":"desktop";
            const context=await browser.newContext({viewport,hasTouch:tag==="mobile"});
            const p=await context.newPage(),errors=[],missing=[];
            p.on("pageerror",error=>errors.push(error.message));
            p.on("response",response=>{if(response.status()>=400)missing.push(response.url());});
            await p.goto(url);
            await p.waitForFunction(()=>window.__skillBattlePreview?.panel?.opened);
            await p.evaluate(()=>window.__skillBattlePreview.panel.command("invPrimary"));
            await p.waitForFunction(()=>window.__skillBattlePreview.panel.visibleItems.length>=6);
            await p.waitForTimeout(300);
            const before=await p.evaluate(()=>localStorage.getItem("nowchange.stage3-inventory.v1"));
            const actual=await p.evaluate(()=>{
                const panel=window.__skillBattlePreview.panel;
                return panel.visibleItems.map((item,i)=>{
                    const bg=panel.nodes[`invList${i}`].getChildAt(0);
                    return{src:bg.src,grid:bg.texture?._sizeGrid,commands:bg.graphics.cmds.map(c=>c.cmdID)};
                });
            });
            assert.ok(actual.length>=6);
            for(const frame of actual){
                assert.equal(frame.src,"ui/atlas/module/inventory/quality-1.png","Unspecified quality displays ordinary");
                assert.deepEqual(frame.grid,[8,8,8,8,0]);
                assert.ok(frame.commands.includes("Draw9GridTextureCmd"),"Engine must draw a real nine-slice");
            }
            await p.screenshot({path:path.join(output,tag+"-current-items.png")});
            // Exercise all six presentation tiers without changing the saved templates.
            await p.evaluate(()=>{
                const v=window.__skillBattlePreview,panel=v.panel,t=v.trial.archive.config.templates[0];
                for(let i=0;i<6;i++)panel.qualityFrame(panel.nodes[`invList${i}`],{...t,quality:i+1},i===3);
            });
            await p.waitForFunction(()=>Array.from({length:6},(_,i)=>{
                const bg=window.__skillBattlePreview.panel.nodes[`invList${i}`].getChildAt(0);
                return bg.texture&&bg.src.endsWith(`quality-${i+1}.png`)&&bg.texture._sizeGrid?.join(",")==="8,8,8,8,0";
            }).every(Boolean));
            await p.waitForTimeout(150);
            const frames=await p.evaluate(()=>{
                const panel=window.__skillBattlePreview.panel,canvas=document.querySelector("canvas").getBoundingClientRect();
                return Array.from({length:6},(_,i)=>{
                    const n=panel.nodes[`invList${i}`],bg=n.getChildAt(0),xy=n.localToGlobal(new Laya.Point(0,0));
                    return{src:bg.src,color:bg.color,alpha:bg.alpha,width:bg.width,height:bg.height,
                        slot:[n.width,n.height],rotation:bg.rotation,grid:bg.texture._sizeGrid,
                        commands:bg.graphics.cmds.map(c=>c.cmdID),selected:n.getChildByName(n.name+"Selection").visible,
                        pixels:{left:Math.round(canvas.left+xy.x*canvas.width/1280),
                            top:Math.round(canvas.top+xy.y*canvas.height/720),
                            width:Math.max(1,Math.floor(n.width*canvas.width/1280)),
                            height:Math.max(1,Math.floor(8*canvas.height/720))}};
                });
            });
            const screenshot=path.join(output,tag+"-six-tiers.png");
            await p.screenshot({path:screenshot});
            for(let i=0;i<frames.length;i++){
                const frame=frames[i];
                assert.equal(frame.src,`ui/atlas/module/inventory/quality-${i+1}.png`);
                assert.equal(frame.color,"#ffffff");assert.equal(frame.alpha,1);assert.equal(frame.rotation,0);
                assert.deepEqual([frame.width,frame.height],frame.slot);assert.deepEqual(frame.grid,[8,8,8,8,0]);
                assert.ok(frame.commands.includes("Draw9GridTextureCmd"));assert.equal(frame.selected,i===3);
                const pixels=await sharp(screenshot).extract(frame.pixels).stats();
                assert.ok(pixels.channels.some(c=>c.stdev>3&&c.max>60),`Tier ${i+1} must have visible border pixels`);
            }
            const variants=await p.evaluate(()=>{
                const v=window.__skillBattlePreview,panel=v.panel,t=v.trial.archive.config.templates[0];
                const n=panel.nodes.invHeld,result=[];
                for(const [width,height]of [[54,54],[54,110],[110,54],[110,110],[110,166],[166,110]]){
                    n.size(width,height);panel.qualityFrame(n,{...t,quality:6},true);
                    const bg=n.getChildAt(0);
                    result.push({width:bg.width,height:bg.height,rotation:bg.rotation,grid:bg.texture._sizeGrid});
                }
                for(const quality of [undefined,0,-1,7,2.5])result.push(panel.quality({...t,quality}));
                panel.refresh();return result;
            });
            assert.deepEqual(variants.slice(0,6),[[54,54],[54,110],[110,54],[110,110],[110,166],[166,110]]
                .map(([width,height])=>({width,height,rotation:0,grid:[8,8,8,8,0]})));
            assert.deepEqual(variants.slice(6),[1,1,1,1,1]);
            assert.equal(await p.evaluate(()=>localStorage.getItem("nowchange.stage3-inventory.v1")),before,
                "Quality display must never write or migrate the archive");
            await p.reload();
            await p.waitForFunction(()=>window.__skillBattlePreview?.panel?.opened);
            await p.waitForTimeout(250);
            assert.equal(await p.evaluate(()=>localStorage.getItem("nowchange.stage3-inventory.v1")),before);
            assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
            await context.close();
            console.log(`PASS ${tag}: six supplied frames, actual nine-slice draw commands/pixels, all footprints, selection, fallback and unchanged save/reload.`);
        }
    }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
