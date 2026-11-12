const { chromium } = require("playwright");
const sharp = require("sharp");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18138";
const out = path.resolve(__dirname, "../tmp/map-art");
const key = "nowchange.stage4-expedition.v1";
const ready = p => p.waitForFunction(() => window.__skillBattlePreview?.panel?.opened &&
    window.__skillBattlePreview.view.isOpened);
async function point(p, name) {
    return p.evaluate(name => {
        const v = window.__skillBattlePreview, n = v.ui.topView.getElement(name,false) || v.panel.buttons[name];
        if (!n?.visible || !n.mouseEnabled) throw Error(`Unavailable ${name}`);
        const a = n.localToGlobal(new Laya.Point(n.width/2,n.height/2));
        const r = document.querySelector("canvas").getBoundingClientRect();
        return {x:r.left+a.x*r.width/Laya.stage.width,y:r.top+a.y*r.height/Laya.stage.height};
    }, name);
}
async function click(p, name) {
    const at = await point(p, name);
    if (p.touchMode) await p.touchscreen.tap(at.x,at.y);
    else await p.mouse.click(at.x,at.y);
    await p.waitForTimeout(120);
    await ready(p);
}
async function inspect(p, name) {
    const state = await p.evaluate(() => {
        const {panel,view,trial} = window.__skillBattlePreview, issues = [];
        const art = "ui/atlas/module/expedition/handpainted/";
        for (const name of ["mapHeaderPanel","mapPlayerPanel",
            "mapHpSlot","mapMpSlot","mapStaminaSlot","mapWeightSlot","expStorageSkin","expBuildSkin","expAbandonSkin"]) {
            const n = view.getElement(name);
            if (!n.visible || !n.texture || !n.src.startsWith(art) || n.filters?.length ||
                !n.graphics.cmds.some(c=>c.cmdID===Laya.Draw9GridTextureCmd.ID)) issues.push([name,"skin"]);
        }
        for(const name of ["mapTimerFrame","mapKillsFrame","mapStaminaFrame","mapWeightFrame"])
            if(view.getElement(name).visible)issues.push([name,"redundant frame"]);
        for (const name of ["mapAvatarFrame","mapAvatarPlaceholder","mapClockGlyph",
            "expStorageActionIcon","expBuildActionIcon","expAbandonActionIcon"]) {
            const n = view.getElement(name);
            if (!n.texture || !n.src.startsWith(art) || n.filters?.length) issues.push([name,"icon"]);
        }
        for (const key of ["Hp","Mp","Stamina","Weight"]) {
            const track = panel.expeditionNodes[`map${key}Track`], fill = panel.expeditionNodes[`map${key}Fill`];
            if (!track.visible || !track.texture || !fill.texture || !fill.scrollRect ||
                fill.scrollRect.width < 0 || fill.scrollRect.width > fill.width) issues.push([key,"meter"]);
        }
        const marker = panel.expeditionNodes.expPlayer, avatar = marker.getChildByName("expPlayerAvatar");
        if (!marker.visible || marker.mouseEnabled || !avatar.visible || avatar.mouseEnabled || !avatar.texture ||
            !avatar.src.endsWith("/map-player-traveler.png")) issues.push("traveler");
        const locator=marker.getChildByName("expPlayerRing");
        if(!locator.visible||locator.width!==76||locator.height!==18||avatar.width!==72||avatar.height!==90)
            issues.push("player locator");
        if(locator.src!==art+"map-current-locator.png"||!locator.texture||
            locator.texture.width!==304||locator.texture.height!==72||locator.filters?.length)
            issues.push("imported current locator");
        const transit=trial.inventory.map.nodes.find(n=>n.id===trial.inventory.node).kind==="transit";
        const lift=transit?64:0;
        if(locator.y!==142-lift||avatar.y!==70-lift||locator.x+locator.width/2!==58||
            avatar.x+avatar.width/2!==58)
            issues.push("player ground alignment");
        if(view.getElement("mapKillsArea").width>450)issues.push("oversized kill strip");
        const format=n=>(n/100).toFixed(2).replace(/\.?0+$/,""),setup=trial.archive.config.build.setup.player;
        if(panel.labels.expHpValue.text!==`生命  ${format(trial.inventory.hp)} / ${format(setup.maxHp)}` ||
            panel.labels.expMpValue.text!==`灵力  ${format(trial.inventory.mp)} / ${format(setup.maxMp)}`)
            issues.push("labeled player values");
        for(const [i,kind] of ["normal","elite","boss"].entries()) {
            const count=trial.inventory.map.cleared.filter(id=>trial.inventory.map.nodes.find(n=>n.id===id).kind===kind).length;
            if(panel.labels[`expKillCount${i}`].text!==`${["普通","精英","首领"][i]} ${count}`)issues.push("kill values");
        }
        if(panel.buttons.expAbandon.getChildAt(1).text!=="放弃本局")issues.push("abandon wording");
        if(panel.compactMap&&["expHpValue","expMpValue","expStamina","expWeight"].some(k=>panel.labels[k].fontSize<26))
            issues.push("small compact text");
        const current=trial.inventory.node,locked=trial.inventory.map.nodes.find(n=>n.id===current).enemy &&
            !trial.inventory.map.cleared.includes(current);
        const neighbors=trial.inventory.map.edges.flatMap(([a,b])=>a===current?[b]:b===current?[a]:[]);
        for(const id of trial.inventory.map.present) {
            const n=panel.buttons[`expNode${id}`],hint=n.getChildByName("expReachHint");
            if(n.visible&&hint.visible!==(!locked&&neighbors.includes(id)))issues.push([id,"reach hint"]);
            if(hint.src!==art+"map-reachable-locator.png"||!hint.texture||
                hint.texture.width!==320||hint.texture.height!==56||hint.filters?.length||
                hint.width!==80||hint.height!==18||hint.y+hint.height/2!==99||hint.mouseEnabled)
                issues.push([id,"imported reach hint"]);
            const base=n.getChildAt(0),badge=n.getChildByName("expDone");
            const icon=n.getChildAt(2),data=trial.inventory.map.nodes.find(node=>node.id===id);
            const shadows=n.graphics.cmds;
            if(n.visible&&(data.kind==="transit"?shadows.length!==0:
                shadows.length!==4||shadows.some(c=>c.cmdID!==Laya.DrawEllipseCmd.ID||
                    c.x+c.width/2!==58||c.y+c.height/2!==99)))
                issues.push([id,"passive ground shadow"]);
            if(icon.visible&&icon.alpha!==1)issues.push([id,"opaque grounded icon"]);
            if(n.visible&&(base.src!==art+"map-transit-stone.png"||!base.texture||
                base.texture.width!==128||base.texture.height!==128||
                base.width!==104||base.height!==104||base.color!=="#d8ddd5"||base.alpha!==1))
                issues.push([id,"imported transit stone"]);
            if(badge.src!==art+"map-completed-badge.png"||!badge.texture||
                badge.texture.width!==120||badge.texture.height!==120||
                badge.width!==30||badge.height!==30||badge.mouseEnabled||badge.numChildren)
                issues.push([id,"imported completed badge"]);
        }
        const commands = panel.expeditionNodes.expLines.graphics.cmds;
        if (!commands.length || commands.some(c=>c.cmdID!==Laya.DrawTextureCmd.ID)) issues.push("textured routes");
        if(commands.some(c=>![6,7].includes(c.height)) ||
            (!locked&&neighbors.length&&!commands.some(c=>c.height===7)) ||
            (locked&&commands.some(c=>c.height===7)))issues.push("route emphasis");
        if(commands.some(c=>c.alpha!==(c.height===7?0.86:0.44)))issues.push("restrained route opacity");
        if(panel.buttons.expUse.visible) {
            const area=view.getElement("nodeActionArea"),background=panel.expeditionNodes.expContextBackground;
            if(area.width>288||area.height>252||background.width!==area.width||background.height!==area.height)
                issues.push("compact node actions");
            if(!panel.labels.expContextStatus.visible)issues.push("node status");
        }
        const scan = n => {
            if (!n.visible) return;
            if (n instanceof Laya.GTextField && n.text) {
                n.textIns.typeset(true);
                if (n.textIns.textWidth > n.width+3 || n.textIns.textHeight > n.height+3) issues.push([n.name,"text"]);
            }
            for(let i=0;i<n.numChildren;i++) scan(n.getChildAt(i));
        };
        scan(view.view);
        return {issues, dashes:commands.length,
            expected:trial.inventory.map.nodes.filter(n=>112+n.x*242-58<panel.scroller.contentWidth).length,
            shown:trial.inventory.map.present.filter(id=>panel.buttons[`expNode${id}`].visible).length};
    });
    assert.deepEqual(state.issues, [], name);
    assert.equal(state.shown,state.expected,"Skinning retains the existing browsing bounds");
    const image = await p.screenshot({path:path.join(out,`${name}.png`)});
    assert.ok((await sharp(image).stats()).channels.slice(0,3).every(c=>c.stdev>15),"Nonblank canvas");
}
(async () => {
    await fs.mkdir(out,{recursive:true});
    const browser = await chromium.launch({headless:true,channel:"chromium"});
    try {
        for(const [name,width,height,touch] of [
            ["desktop",1280,720,false],["wide",1560,720,false],["mobile",844,390,true],
        ]) {
            const context = await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
            const p = await context.newPage(), errors = [], failed = [];
            p.touchMode = touch;
            p.on("pageerror",e=>errors.push(e.message));
            p.on("response",r=>{if(r.status()>=400)failed.push(r.url());});
            await p.addInitScript(()=>{crypto.getRandomValues=a=>{a.fill(1);return a;};});
            await p.goto(url); await ready(p);
            await click(p,"invPrimary"); await click(p,"invPrimary");
            while(await p.evaluate(()=>!!window.__skillBattlePreview.trial.inventory.flow.pending)) {
                await click(p,"warehouse0"); await click(p,"newRun");
            }
            await p.waitForFunction(()=>window.__skillBattlePreview.panel.pageRole==="map");
            await inspect(p,`${name}-map`);
            const saved = await p.evaluate(key=>localStorage.getItem(key),key);
            await p.evaluate(() => {
                const {panel,trial}=window.__skillBattlePreview, s=trial.data.save.state;
                const original={hp:s.hp,mp:s.mp,stamina:s.stamina}, setup=trial.archive.config.build.setup.player;
                try {
                    for(const ratio of [0,0.05,0.5,1]) {
                        s.hp=setup.maxHp*ratio;s.mp=setup.maxMp*ratio;
                        s.stamina=trial.archive.config.rules.staminaMax*ratio;panel.refresh();
                        for(const key of ["Hp","Mp","Stamina"]) {
                            const fill=panel.expeditionNodes[`map${key}Fill`];
                            if(fill.visible!==(ratio>0)||Math.abs(fill.scrollRect.width/fill.width-ratio)>0.001 ||
                                fill.scaleX!==1) throw Error(`Incorrect cropped ${key}: ${ratio}`);
                        }
                    }
                } finally { Object.assign(s,original);panel.refresh(); }
            });
            if(!touch) {
                const at=await point(p,"expBuild");
                await p.mouse.move(at.x,at.y); await p.waitForTimeout(50);
                assert.ok(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expBuild.getChildAt(0).src
                    .endsWith("/map-button-hover.png")));
                await p.mouse.down(); await p.waitForTimeout(50);
                assert.ok(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expBuild.getChildAt(0).src
                    .endsWith("/map-button-pressed.png")));
                await p.mouse.move(at.x+170,at.y-80); await p.mouse.up();
            }
            await click(p,"expAbandon");
            assert.ok(await p.evaluate(()=>window.__skillBattlePreview.panel.modalOpen));
            await click(p,"dialogCancel");
            assert.equal(await p.evaluate(key=>localStorage.getItem(key),key),saved,"Visual changes and cancel never save");
            await click(p,"expStorage");
            await p.waitForFunction(()=>window.__skillBattlePreview.panel.pageRole==="inventory");
            await p.evaluate(() => {
                const {panel,trial}=window.__skillBattlePreview;
                // Isolate the shared animation's display layer without generating or saving any loot.
                Laya.timer.clear(panel,panel.searchTick);
                Object.defineProperty(trial,"searching",{configurable:true,value:true});
                panel.nodes.expUnknown.visible=true;
                panel.nodes.expSearchSpinner.pos(120,160);
                panel.renderSearchSpinner();
            });
            await p.waitForTimeout(80);
            const first=await p.evaluate(()=> {
                const panel=window.__skillBattlePreview.panel,spinner=panel.nodes.expSearchSpinner,art=spinner.getChildAt(0);
                return {visible:spinner.visible,src:art.src,texture:!!art.texture,rotation:art.rotation,
                    center:[art.x,art.y],anchor:[art.anchorX,art.anchorY]};
            });
            assert.ok(first.visible&&first.texture&&first.src.endsWith("/inventory-search-spinner.png"));
            assert.deepEqual(first.center,[22,22]);assert.deepEqual(first.anchor,[0.5,0.5]);
            await p.waitForTimeout(120);
            await p.evaluate(()=>window.__skillBattlePreview.panel.renderSearchSpinner());
            assert.notEqual(await p.evaluate(()=>window.__skillBattlePreview.panel.nodes.expSearchSpinner.getChildAt(0).rotation),
                first.rotation,"Search artwork rotates around its fixed center");
            await p.screenshot({path:path.join(out,`${name}-search-spinner.png`)});
            await p.evaluate(()=> {
                const {panel,trial}=window.__skillBattlePreview;
                delete trial.searching;panel.nodes.expUnknown.visible=false;panel.renderSearchSpinner();
                if(panel.nodes.expSearchSpinner.visible)throw Error("Stopped search must hide its artwork");
            });
            assert.equal(await p.evaluate(key=>localStorage.getItem(key),key),saved,"Animation never writes a save");
            await click(p,"invToggle");
            await p.waitForFunction(()=>window.__skillBattlePreview.panel.pageRole==="map");
            await click(p,"expNode2");
            await p.waitForFunction(()=>!window.__skillBattlePreview.panel.movement);
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.trial.inventory.node),2,"Textured marker still travels");
            await inspect(p,`${name}-arrival`);
            await click(p,"expNode3");
            await p.waitForFunction(()=>!window.__skillBattlePreview.panel.movement);
            await inspect(p,`${name}-node-action`);
            assert.ok(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expUse.visible &&
                window.__skillBattlePreview.panel.buttons.expUse.getChildAt(1).text==="开战"),
                "Arriving at an enemy displays the reskinned action panel without automatically fighting");
            const arrivalSaved=await p.evaluate(key=>localStorage.getItem(key),key);
            if(!touch) {
                for(const [w,h] of [[844,390],[1560,720],[width,height]]) {
                    await p.setViewportSize({width:w,height:h});await p.waitForTimeout(150);
                    await inspect(p,`${name}-resize-${w}x${h}`);
                }
                assert.equal(await p.evaluate(key=>localStorage.getItem(key),key),arrivalSaved,
                    "Responsive layout changes never save or reroll the map");
            }
            const contextIssues=await p.evaluate(()=> {
                const {panel,trial}=window.__skillBattlePreview,s=trial.data.save.state;
                const original={node:s.node,revealed:s.revealed,selected:panel.selectedNode,
                    scroll:panel.scroller.posX,center:panel.centerMap};
                const issues=[],rightmost=Math.max(...s.map.nodes.map(n=>n.x));
                try {
                    s.revealed=[...s.map.present];
                    for(const n of s.map.nodes.filter(n=>n.x>=rightmost-2&&n.kind!=="transit")) {
                        s.node=n.id;panel.selectedNode=n.id;panel.centerMap=true;panel.refresh();
                        const area=panel.mapAreas.nodeActionArea,p=panel.mapPositions(s).get(n.id);
                        const x=p.x-panel.scroller.scrollingPosX;
                        if(!panel.buttons.expUse.visible||area.x<0||area.y<96||
                            area.x+area.width>panel.root.width||area.y+area.height>panel.root.height)
                            issues.push([n.id,"action bounds"]);
                        if(Math.min(area.x+area.width,x+64)>Math.max(area.x,x-64)&&
                            Math.min(area.y+area.height,p.y+104)>Math.max(area.y,p.y-100))
                            issues.push([n.id,"current node covered"]);
                    }
                } finally {
                    s.node=original.node;s.revealed=original.revealed;panel.selectedNode=original.selected;
                    panel.centerMap=original.center;panel.refresh();panel.scroller.posX=original.scroll;
                }
                return issues;
            });
            assert.deepEqual(contextIssues,[],"End-of-map actions stay onscreen and avoid the current node");
            assert.equal(await p.evaluate(key=>localStorage.getItem(key),key),arrivalSaved,
                "Action placement fixtures never save");
            await p.evaluate(()=> {
                const {panel,trial}=window.__skillBattlePreview;
                panel.buttons.expUse.mouseEnabled=false;panel.mapButtonState(panel.buttons.expUse,"normal");
                if(!panel.buttons.expUse.getChildAt(0).src.endsWith("/map-button-disabled.png"))
                    throw Error("Disabled actions use supplied disabled artwork");
                panel.refresh();
            });
            assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
            await context.close();
            console.log(`PASS map artwork ${name}: imported/nine-sliced skins, uncluttered text, real button states, cropped meters, travel and rotating search artwork.`);
        }
    } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
