const { chromium } = require("playwright");
const sharp = require("sharp");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18138";
const out = path.resolve(__dirname, "../tmp/map-art");
const key = "nowchange.stage4-expedition.v1";
const prefab=JSON.parse(require("node:fs").readFileSync(path.resolve(__dirname,
    "../assets/ui/prefab/module/expedition/SkillBattleMapView.lh"),"utf8"));
const authored=new Map();
const visit=n=>{authored.set(n.name,n);(n._$child||[]).forEach(visit);};
visit(prefab);
const authoredContext=authored.get("nodeActionArea");
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
    await p.waitForFunction(() => {
        const panel=window.__skillBattlePreview.panel;
        return window.__skillBattlePreview.trial.inventory.map.present.every(id=>{
            const node=panel.buttons[`expNode${id}`];
            return !!node.getChildByName("expReachHint").texture &&
                !!node.getChildByName("expDone").texture &&
                (!node.visible || !!node.getChildAt(0).texture);
        });
    });
    const state = await p.evaluate(authoredContext => {
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
            "mapHpIcon","mapMpIcon","expStorageActionIcon","expBuildActionIcon","expAbandonActionIcon"]) {
            const n = view.getElement(name);
            if (!n.texture || !n.src.startsWith(art) || n.filters?.length) issues.push([name,"icon"]);
        }
        for (const [name,file] of [
            ["mapHeaderPanel","map-header-panel.png"],["mapPlayerPanel","map-player-panel.png"],
            ["expStorageSkin","map-toolbar-normal.png"],["expBuildSkin","map-toolbar-normal.png"],
            ["mapHpIcon","map-icon-hp.png"],["mapMpIcon","map-icon-mp.png"],
        ]) {
            if(view.getElement(name).src!==art+file)issues.push([name,"new bundle binding"]);
        }
        for (const key of ["Hp","Mp","Stamina","Weight"]) {
            const track = panel.expeditionNodes[`map${key}Track`], fill = panel.expeditionNodes[`map${key}Fill`];
            if (!track.visible || !track.texture || !fill.texture || !fill.scrollRect ||
                fill.scrollRect.width < 0 || fill.scrollRect.width > fill.width) issues.push([key,"meter"]);
            const frame=panel.expeditionNodes[`map${key}Slot`];
            if(frame.src!==art+"map-bar-frame.png"||track.src!==art+"map-bar-track.png"||
                fill.src!==art+`map-bar-${key.toLowerCase()}.png`||
                ![frame,track,fill].every(n=>n.graphics.cmds.some(c=>c.cmdID===Laya.Draw9GridTextureCmd.ID)))
                issues.push([key,"capsule artwork"]);
            const inset=4;
            if(![track,fill].every(n=>n.x===frame.x+inset&&n.y===frame.y+inset&&
                n.width===frame.width-inset*2&&n.height===frame.height-inset*2))
                issues.push([key,"silver rim clearance"]);
            const label=panel.labels[key==="Hp"||key==="Mp"?`exp${key}Value`:`exp${key}`];
            if(label.x!==frame.x||label.y!==frame.y||label.width!==frame.width||label.height!==frame.height||
                label.align!=="center"||label.valign!=="middle"||label.wordWrap)
                issues.push([key,"full-bar text centering"]);
        }
        const header=view.getElement("mapHeaderArea"),player=view.getElement("mapPlayerArea");
        if(header.x!==8||header.y!==8||header.width!==panel.root.width-16||
            header.height!==(panel.compactMap?80:64))issues.push("header inset");
        const groups=["mapClockArea","mapKillsArea","mapStaminaArea","mapWeightArea"].map(n=>view.getElement(n));
        for(let i=1;i<groups.length;i++)
            if(groups[i].x<groups[i-1].x+groups[i-1].width+12)issues.push(["HUD groups overlap",i]);
        if(player.y<header.y+header.height+12)issues.push("player HUD spacing");
        for(const key of ["expStorage","expBuild"]) {
            const button=panel.buttons[key],label=button.getChildAt(1),icon=button.getChildAt(2);
            if(label.font!=="SimSun"||!label.bold||label.fontSize!==(panel.compactMap?30:25)||
                icon.y+icon.height>label.y)
                issues.push([key,"tool hierarchy"]);
        }
        for(const name of ["mapHeaderPanel","mapPlayerPanel","expContextBackground",
            "expStorageSkin","expBuildSkin","expAbandonSkin","expUseSkin"]) {
            const image=view.getElement(name);
            if(image.texture&&image.texture._sizeGrid.join(",")!=="18,18,18,18,0")
                issues.push([name,"approved shared nine-slice"]);
        }
        for(const name of ["expContextTitle","expUseText","expStorageText","expBuildText","expAbandonText",
            "expPlayerName","expKillCount0","expKillCount1","expKillCount2","expStaminaLabel","expWeightLabel"]) {
            const label=view.getElement(name);
            if(label.font!=="SimSun"||!label.bold||label.stroke<0.8||label.stroke>1||label.strokeColor!=="#0a1b14")
                issues.push([name,"approved serif typography"]);
        }
        const notice=panel.labels.expNotice,noticeSkin=panel.expeditionNodes.mapNoticeSkin;
        if(noticeSkin.visible!==!!notice.text||noticeSkin.mouseEnabled)issues.push("passive notice backing");
        if(noticeSkin.visible&&(notice.x<panel.buttons.expBuild.x+panel.buttons.expBuild.width+16||
            notice.x+notice.width>panel.mapAreas.mapActionsArea.width))issues.push("notice bounds");
        const marker = panel.expeditionNodes.expPlayer, avatar = marker.getChildByName("expPlayerAvatar");
        if (!marker.visible || marker.mouseEnabled || !avatar.visible || avatar.mouseEnabled || !avatar.texture ||
            !avatar.src.endsWith("/map-player-traveler.png")) issues.push("traveler");
        const locator=marker.getChildByName("expPlayerRing");
        if(!locator.visible||locator.width!==84||locator.height!==20||avatar.width!==72||avatar.height!==90)
            issues.push("player locator");
        if(locator.src!==art+"map-current-locator.png"||!locator.texture||
            locator.texture.width!==304||locator.texture.height!==72||locator.filters?.length)
            issues.push("imported current locator");
        const currentNode=trial.inventory.map.nodes.find(n=>n.id===trial.inventory.node);
        const transit=currentNode.kind==="transit";
        const lift=transit?64:0;
        const shift=currentNode.enemy?-(panel.buttons[`expNode${currentNode.id}`].getChildAt(2).width/2+28):0;
        if(locator.y!==142-lift||avatar.y!==70-lift||locator.x+locator.width/2!==58+shift||
            avatar.x+avatar.width/2!==58+shift)
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
            if(n.visible&&(base.src!==art+"map-transit-stone-muted.png"||!base.texture||
                base.texture.width!==256||base.texture.height!==256||
                base.width!==104||base.height!==104||base.color!=="#ffffff"||base.alpha!==1))
                issues.push([id,"imported transit stone"]);
            if(badge.src!==art+"map-completed-badge.png"||!badge.texture||
                badge.texture.width!==120||badge.texture.height!==120||
                badge.width!==30||badge.height!==30||badge.mouseEnabled||badge.numChildren)
                issues.push([id,"imported completed badge"]);
        }
        const commands = panel.expeditionNodes.expLines.graphics.cmds;
        if (!commands.length || commands.some(c=>c.cmdID!==Laya.DrawTextureCmd.ID)) issues.push("textured routes");
        if(commands.length%3||commands.some(c=>![8,10,16,18,26,30].includes(c.height)) ||
            (!locked&&neighbors.length&&!commands.some(c=>c.height===18)) ||
            (locked&&commands.some(c=>c.height===18)))issues.push("route emphasis");
        for(let i=0;i<commands.length;i+=3) {
            const [halo,rim,core]=commands.slice(i,i+3),active=rim.height===18;
            if(halo.height!==(active?30:26)||halo.alpha!==(active?0.32:0.24)||
                core.height!==(active?10:8)||rim.alpha!==1||core.alpha!==1||
                halo.width!==rim.width||rim.width!==core.width||
                halo.x!==rim.x||rim.x!==core.x)
                issues.push("readable cyan route layers");
        }
        if(commands.some(c=>c.texture!==(panel.expeditionNodes.mapRouteTexture).texture)||
            !panel.expeditionNodes.mapRouteTexture.src.endsWith("/map-route-dash.png"))
            issues.push("unoutlined cyan route artwork");
        if(panel.buttons.expUse.visible) {
            const area=view.getElement("nodeActionArea"),background=panel.expeditionNodes.expContextBackground;
            if(area.width!==authoredContext.width||area.height!==authoredContext.height||
                area.x!==authoredContext.x+panel.root.width-authoredContext.prefabWidth||
                area.y!==authoredContext.y+(panel.root.height-authoredContext.prefabHeight)/2||
                background.width!==area.width||background.height!==area.height)
                issues.push("prefab-authored node actions");
            if(!panel.labels.expContextStatus.visible)issues.push("node status");
        }
        const scan = n => {
            if (!n.visible) return;
            if (n instanceof Laya.GTextField && n.text) {
                n.textIns.typeset(true);
                if (n.textIns.textWidth > n.width+3 || n.textIns.textHeight > n.height+3)
                    issues.push([n.name,"text",n.textIns.textWidth,n.textIns.textHeight,n.width,n.height]);
            }
            for(let i=0;i<n.numChildren;i++) scan(n.getChildAt(i));
        };
        scan(view.view);
        return {issues, dashes:commands.length,
            expected:trial.inventory.map.nodes.filter(n=>112+n.x*242-58<panel.scroller.contentWidth).length,
            shown:trial.inventory.map.present.filter(id=>panel.buttons[`expNode${id}`].visible).length};
    }, {...authoredContext,prefabWidth:prefab.width,prefabHeight:prefab.height});
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
            ["small-mobile",667,375,true],
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
                        if(panel.labels.expHpValue.color!==(ratio<=0.3?"#ffe0c3":"#fff9e7"))
                            throw Error("Low-health contrast must use the actual value");
                    }
                } finally { Object.assign(s,original);panel.refresh(); }
            });
            if(!touch) {
                const at=await point(p,"expBuild");
                await p.mouse.move(at.x,at.y); await p.waitForTimeout(50);
                assert.ok(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expBuild.getChildAt(0).src
                    .endsWith("/map-toolbar-hover.png")));
                await p.mouse.down(); await p.waitForTimeout(50);
                assert.ok(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expBuild.getChildAt(0).src
                    .endsWith("/map-toolbar-pressed.png")));
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
                    scroll:panel.scroller.posX,center:panel.centerMap,
                    contextX:panel.mapAreas.nodeActionArea.x,contextY:panel.mapAreas.nodeActionArea.y};
                const issues=[],rightmost=Math.max(...s.map.nodes.map(n=>n.x));
                try {
                    s.revealed=[...s.map.present];
                    for(const n of s.map.nodes.filter(n=>n.x>=rightmost-2&&n.kind!=="transit")) {
                        s.node=n.id;panel.selectedNode=n.id;panel.centerMap=true;panel.refresh();
                        const area=panel.mapAreas.nodeActionArea;
                        if(!panel.buttons.expUse.visible||area.x<0||area.y<96||
                            area.x+area.width>panel.root.width||area.y+area.height>panel.root.height)
                            issues.push([n.id,"action bounds"]);
                        if(area.x!==original.contextX||area.y!==original.contextY)
                            issues.push([n.id,"authored panel position overwritten"]);
                    }
                } finally {
                    s.node=original.node;s.revealed=original.revealed;panel.selectedNode=original.selected;
                    panel.centerMap=original.center;panel.refresh();panel.scroller.posX=original.scroll;
                }
                return issues;
            });
            assert.deepEqual(contextIssues,[],"Node actions keep the prefab position across all node selections");
            assert.equal(await p.evaluate(key=>localStorage.getItem(key),key),arrivalSaved,
                "Action placement fixtures never save");
            await p.evaluate(()=> {
                const {panel,trial}=window.__skillBattlePreview;
                panel.buttons.expUse.mouseEnabled=false;panel.mapButtonState(panel.buttons.expUse,"normal");
                if(!panel.buttons.expUse.getChildAt(0).src.endsWith("/map-button-disabled.png"))
                    throw Error("Disabled actions use supplied disabled artwork");
                panel.refresh();
            });
            const editedLayout=await p.evaluate(key=>{
                const {panel}=window.__skillBattlePreview;
                const saved=localStorage.getItem(key);
                panel.mapAreas.mapHeaderArea.y+=3;
                panel.mapAreas.mapPlayerArea.x+=7;
                panel.mapAreas.mapActionsArea.x+=5;
                panel.mapAreas.nodeActionArea.x-=17;
                panel.mapAreas.nodeActionArea.y+=13;
                panel.buttons.expBuild.x+=9;
                panel.labels.expPlayerName.x+=6;
                panel.labels.expHpValue.fontSize+=1;
                const names=["mapHeaderArea","mapPlayerArea","mapActionsArea","nodeActionArea",
                    "mapHpSlot","mapHpTrack","mapHpFill","mapMpSlot","mapHpIcon","mapAvatarFrame",
                    "expPlayerName","expHpValue","expStorage","expBuild","expUse","expAbandon"];
                const snapshot=()=>names.map(name=>{
                    const n=panel.expeditionNodes[name]||panel.mapAreas[name];
                    return [name,n.x,n.y,n.width,n.height,n.fontSize];
                });
                const before=snapshot();
                panel.refresh();panel.refresh();
                return {before,after:snapshot(),unchanged:localStorage.getItem(key)===saved,
                    rim:panel.expeditionNodes.mapHpTrack.x-panel.expeditionNodes.mapHpSlot.x,
                    text:panel.labels.expHpValue.x-panel.expeditionNodes.mapHpSlot.x};
            },key);
            assert.deepEqual(editedLayout.after,editedLayout.before,"Refreshing preserves edited prefab positions, sizes and fonts");
            assert.equal(editedLayout.rim,4,"Native relations carry the track when the slot moves");
            assert.equal(editedLayout.text,0,"Native relations carry the centered value when the slot moves");
            assert.ok(editedLayout.unchanged,"Editing presentation never writes a save");
            const noticeLayout=await p.evaluate(async()=>{
                const {panel}=window.__skillBattlePreview;
                panel.notice="当前操作无法完成，请检查携带空间后重试。".repeat(2);
                panel.refresh();
                await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                const label=panel.labels.expNotice,skin=panel.expeditionNodes.mapNoticeSkin;
                return {width:label.width,height:label.height,x:label.x,y:label.y,
                    bounds:[panel.mapAreas.mapActionsArea.width,panel.mapAreas.mapActionsArea.height],
                    backing:[skin.x,skin.y,skin.width,skin.height],
                    text:[label.x,label.y,label.width,label.height],visible:skin.visible};
            });
            assert.ok(noticeLayout.visible&&noticeLayout.width<=640&&noticeLayout.x>=0&&noticeLayout.y>=0&&
                noticeLayout.x+noticeLayout.width<=noticeLayout.bounds[0]&&
                noticeLayout.y+noticeLayout.height<=noticeLayout.bounds[1],
                `Native long notices remain inside the action area: ${JSON.stringify(noticeLayout)}`);
            assert.deepEqual(noticeLayout.backing,noticeLayout.text,"Notice backing follows native text auto-sizing");
            assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
            await context.close();
            console.log(`PASS map artwork ${name}: imported/nine-sliced skins, uncluttered text, real button states, cropped meters, travel and rotating search artwork.`);
        }
    } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
