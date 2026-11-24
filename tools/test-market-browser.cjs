const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const { confirmStartup } = require("./lobby-save-test-utils.cjs");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18095";
const out = path.resolve(__dirname, "../tmp/market/browser");
const categories = [["weapon", "武器"], ["armor", "防具"], ["accessory", "饰品"],
    ["container", "纳虚"], ["material", "材料"]];
const left = ["equipmentArea", "safeItemsArea", "battleItemsArea", "bagArea", "backpackEquipmentArea",
    "invWeapon", "invArmor", "invAccessory", "invContainer", "btn_sell", "btn_close", "txt_bagWeightLimit"];

async function point(page, key) {
    return page.evaluate(key => {
        const preview = window.__skillBattlePreview;
        const node = preview.ui.topView?.getElement(key, false) || preview.view.getElement(key, false) || preview.panel?.getNode(key);
        if (!node?.visible) throw Error("控件不可见：" + key);
        const p = node.localToGlobal(new Laya.Point(node.width / 2, node.height / 2));
        const canvas = document.querySelector("canvas").getBoundingClientRect();
        return { x: canvas.left + p.x * canvas.width / Laya.stage.width,
            y: canvas.top + p.y * canvas.height / Laya.stage.height };
    }, key);
}
async function click(page, key) {
    const p = await point(page, key);
    if (page.touchMode) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(100);
}
async function waitView(page, name) {
    await page.waitForFunction(name => window.__skillBattlePreview.view.isOpened &&
        window.__skillBattlePreview.view.path.endsWith(`/${name}.lh`), name);
}
async function geometry(page, keys) {
    return page.evaluate(keys => {
        const view = window.__skillBattlePreview.view;
        return keys.map(name => {
            const node = view.getElement(name);
            const p = node.localToGlobal(new Laya.Point());
            return { name, x: p.x, y: p.y, width: node.width, height: node.height };
        });
    }, keys);
}
async function layout(page) {
    assert.deepEqual(await page.evaluate(() => {
        const view = window.__skillBattlePreview.view, issues = [];
        const find = (node, name) => node.name === name ? node :
            Array.from({ length: node.numChildren }, (_, i) => find(node.getChildAt(i), name)).find(Boolean);
        for (const name of ["btn_take_all", "btn_store_all", "btn_sort"])
            if (find(view.view, name)) issues.push(name + "未移除");
        for(let i=1;i<=7;i++)if(find(view.view,"btn_market_page_"+i))issues.push("旧数字分页未移除");
        const grid = view.getElement("sourceItemsArea"), pages = view.getElement("sourcePagesArea");
        const tabs = view.getElement("box_market_categories");
        if (tabs.y !== 51 || pages.y !== 101 || grid.y !== 161) issues.push("右侧下移位置不符");
        if (tabs.x !== grid.x || tabs.width !== grid.width || pages.width !== grid.width) issues.push("右侧未对齐");
        const source = window.__skillBattlePreview.panel;
        if (source.visibleItems.length || source.lists.source.arrayLen !== 56) issues.push("货架混入仓库物品");
        if (source.nodes.invSourceTitle.text !== "坊市") issues.push("标题错误");
        for(const name of ["btn_market_prev","btn_market_next"]){
            const button=view.getElement(name);
            if(!button.tooltips||button.width!==40||button.height!==40)issues.push("翻页按钮样式错误");
        }
        for (const name of ["btn_category_weapon", "btn_category_armor", "btn_category_accessory",
            "btn_category_container", "btn_category_material", "sourceItemsArea", "btn_close"]) {
            const n = view.getElement(name), a = n.localToGlobal(new Laya.Point());
            const b = n.localToGlobal(new Laya.Point(n.width, n.height));
            if (a.x < 0 || a.y < 0 || b.x > Laya.stage.width + 0.5 || b.y > Laya.stage.height + 0.5)
                issues.push(name + "超出视口");
        }
        for (const category of ["weapon", "armor", "accessory", "container", "material"]) {
            const text = view.getElement("txt_category_" + category);
            text.textIns.typeset(true);
            if (text.textIns.textWidth > text.width || text.textIns.textHeight > text.height)
                issues.push(category + "文字溢出");
            const image = view.getElement("img_category_" + category);
            if (!image.texture?.bitmap) issues.push(category + "图片未加载");
        }
        return issues;
    }), []);
}
async function flipAllPages(page) {
    const seen = new Set();
    for(let index=0;index<9;index++){
        const result=await page.evaluate(()=>{
            const view=window.__skillBattlePreview.view,ids=[],issues=[];
            const area=view.getElement("sourceItemsArea");
            for(const [id,ctrl] of view.items)if(ctrl.rootNode.visible){
                ids.push(id);
                const node=ctrl.rootNode;
                if(node.x<0||node.y<0||node.x+node.width>area.width||node.y+node.height>area.height)
                    issues.push("商品越界："+id);
                for(const key of ["icon","background"]){
                    const image=node.getChildByName(key);
                    if(!image.texture?.bitmap)issues.push("商品图片未加载："+id);
                }
            }
            return {ids,issues,text:view.getElement("txt_market_page").text,
                previous:view.getElement("btn_market_prev").mouseEnabled,next:view.getElement("btn_market_next").mouseEnabled};
        });
        assert.deepEqual(result.issues,[]);
        assert.equal(result.text,`${index+1} / 9`);
        assert.equal(result.previous,index>0);assert.equal(result.next,index<8);
        for(const id of result.ids){assert(!seen.has(id));seen.add(id);}
        if(index<8)await click(page,"btn_market_next");
    }
    assert.equal(seen.size,72);
    for(let index=0;index<8;index++)await click(page,"btn_market_prev");
}
async function bagPoint(page,x,y,w,h) {
    return page.evaluate(({x,y,w,h})=>{
        const panel=window.__skillBattlePreview.panel,g=panel.gridGeometry("bag");
        const p=panel.root.localToGlobal(new Laya.Point(g.x+(x+w/2)*56,g.y+(y+h/2)*56));
        const r=document.querySelector("canvas").getBoundingClientRect();
        return {x:r.left+p.x*r.width/Laya.stage.width,y:r.top+p.y*r.height/Laya.stage.height};
    },{x,y,w,h});
}
async function failNextWrite(page) {
    await page.evaluate(()=>{
        const original=Storage.prototype.setItem;
        Storage.prototype.setItem=function(key,value){
            if(key==="nowchange.expedition.v1"){
                Storage.prototype.setItem=original;throw Error("测试写入失败");
            }
            return original.call(this,key,value);
        };
    });
}
async function drag(page,from,to,{valid,auto=false,rotate=false,cancel=false,shot,whileHolding}={}) {
    const before=await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1"));
    const a=await point(page,from),b=typeof to==="string"?await point(page,to):to;
    let cdp;
    if (page.touchMode) {
        cdp = await page.context().newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...a, id: 1 }] });
        for (let i = 1; i <= 12; i++) await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove", touchPoints: [{ x: a.x + (b.x - a.x) * i / 12,
                y: a.y + (b.y - a.y) * i / 12, id: 1 }],
        });
    } else {
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
        await page.mouse.move(b.x, b.y, { steps: 12 });
    }
    if(rotate)await page.keyboard.press("r");
    if(auto)await page.waitForTimeout(500);
    const held=await page.evaluate(()=>{
        const panel=window.__skillBattlePreview.panel,h=panel.held;
        return {active:!!h,valid:h?.valid,error:h?.error,target:h?.target,
            floating:panel.floating.rootNode.visible,feedback:panel.nodes.box_drag_feedback.graphics.cmds.length};
    });
    assert(held.active);assert.equal(held.valid,valid,held.error);assert(held.floating);assert(held.feedback>0);
    assert.equal(await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1")),before,"松手前不能成交");
    if(shot){
        const image=await page.screenshot({path:path.join(out,shot+".png")});
        const {data,info}=await sharp(image).removeAlpha().raw().toBuffer({resolveWithObject:true});
        const color=valid?[118,255,173]:[255,98,98];
        let pixels=0;
        for(let i=0;i<data.length;i+=info.channels)
            if(color.every((value,c)=>Math.abs(data[i+c]-value)<16))pixels++;
        assert(pixels>25,`${valid?"绿":"红"}色反馈应实际显示在截图中，当前像素${pixels}`);
    }
    if(whileHolding)await whileHolding(held);
    if(cancel)await page.keyboard.press("Escape");
    if (cdp) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
    } else await page.mouse.up();
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(()=>{
        const p=window.__skillBattlePreview.panel;
        return [!!p.held,p.floating.rootNode.visible,p.nodes.box_drag_feedback.graphics.cmds.length];
    }),[false,false,0]);
    if(!valid||cancel)assert.equal(await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1")),before);
    return held;
}
async function purchase(page,name) {
    const before=await page.evaluate(()=>window.__skillBattlePreview.trial.archive);
    const text=await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1"));
    await click(page,"marketGoods1");
    await page.waitForFunction(()=>window.__skillBattlePreview.ui.topView?.path.endsWith("/ItemDetailView.lh"));
    const gear=await page.evaluate(()=>{
        const detail=window.__skillBattlePreview.ui.topView;
        if(!detail.getElement("txt_item_detail").text.includes("剩余限购 1/1"))throw Error("缺少限购信息");
        if(detail.getElement("btn_item_action").visible)throw Error("商品详情不应保留按钮购买");
        return detail.request.equipment;
    });
    await page.screenshot({path:path.join(out,name+"-detail.png")});
    await click(page,"btn_close");
    const landing=await bagPoint(page,1,0,3,2);
    await drag(page,"marketGoods1",await bagPoint(page,0,0,2,3),{valid:false,shot:name+"-red"});
    assert.equal(await page.evaluate(()=>window.__skillBattlePreview.view.items.get(1).rootNode.alpha),1);
    await drag(page,"marketGoods1",landing,{valid:true,auto:true,cancel:true});
    await drag(page,"marketGoods1",landing,{valid:true,auto:true,shot:name+"-green",whileHolding:()=>failNextWrite(page)});
    assert.equal(await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1")),text);
    assert.match(await page.evaluate(()=>window.__skillBattlePreview.panel.nodes.txt_inventory_feedback.text),/写入失败/);
    await drag(page,"marketGoods1",landing,{valid:true,auto:true});
    const after=await page.evaluate(()=>window.__skillBattlePreview.trial.archive);
    assert.equal(after.state.items.length,before.state.items.length+1);
    assert.equal(after.state.wish,before.state.wish);
    assert.equal(after.state.revision,before.state.revision+1);
    assert.deepEqual(after.state.marketPurchases,[{goodsId:1,itemId:109,count:1}]);
    const item=after.state.items.find(row=>row.uid===`${after.runId}:market:1:1`);
    assert.deepEqual(item.location,{space:"bag",x:1,y:0,rotated:true});assert.deepEqual(item.equipment,gear);
    assert.deepEqual(after.state.items.filter(row=>row.location.space==="warehouse"),
        before.state.items.filter(row=>row.location.space==="warehouse"));
    assert.match(await page.evaluate(()=>window.__skillBattlePreview.panel.nodes.txt_inventory_feedback.text),/购买成功/);
    await drag(page,"marketGoods1",landing,{valid:false});
    assert.match(await page.evaluate(()=>window.__skillBattlePreview.panel.nodes.txt_inventory_feedback.text),/限购/);
    await page.screenshot({path:path.join(out,name+"-purchased.png")});
    const bagKey=await page.evaluate(uid=>"invItem"+window.__skillBattlePreview.panel.gridItems.findIndex(row=>row.uid===uid),item.uid);
    await drag(page,bagKey,"invSourceCell27",{valid:true,shot:name+"-sell-green",whileHolding:()=>failNextWrite(page)});
    assert.deepEqual(await page.evaluate(()=>window.__skillBattlePreview.trial.archive),after);
    assert.match(await page.evaluate(()=>window.__skillBattlePreview.panel.nodes.txt_inventory_feedback.text),/写入失败/);
    await drag(page,bagKey,"invSourceCell27",{valid:true});
    const sold=await page.evaluate(()=>window.__skillBattlePreview.trial.archive);
    const price=sold.config.templates.find(row=>row.id===item.templateId).recyclePrice;
    assert.equal(sold.state.wish,after.state.wish+price);
    assert.equal(sold.state.items.find(row=>row.uid===item.uid).location.space,"consumed");
    assert.deepEqual(sold.state.marketPurchases,after.state.marketPurchases);
    await click(page,"btn_close");
    await page.reload();await confirmStartup(page);
    assert.deepEqual(await page.evaluate(()=>window.__skillBattlePreview.trial.archive),sold);
    await click(page,"btn_market");await waitView(page,"MarketView");
    assert.equal(await page.evaluate(()=>window.__skillBattlePreview.view.items.get(1).rootNode.getChildByName("caption").text),"售罄");
    await click(page,"btn_close");await click(page,"btn_warehouse");await waitView(page,"SkillBattleInventoryView");
    assert(!await page.evaluate(uid=>window.__skillBattlePreview.panel.visibleItems.some(row=>row.uid===uid),item.uid));
    await click(page,"btn_close");
}

(async () => {
    await fs.mkdir(out, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, width, height, touch] of [
            ["desktop", 1280, 720, false], ["wide", 1560, 720, false],
            ["mobile", 844, 390, true], ["compact", 667, 375, true], ["tablet", 1024, 768, true],
        ]) {
            const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
            const page = await context.newPage(), errors = [];
            page.touchMode = touch;
            page.on("pageerror", error => errors.push(error.message));
            await page.goto(url);
            await confirmStartup(page);
            await click(page, "btn_warehouse");
            await waitView(page, "SkillBattleInventoryView");
            const originalLeft = await geometry(page, left);
            const originalRight = await geometry(page, ["sourceItemsArea", "sourcePagesArea"]);
            await click(page, "btn_close");
            const saved = await page.evaluate(() => localStorage.getItem("nowchange.expedition.v1"));
            await click(page, "btn_market");
            await waitView(page, "MarketView");
            await page.waitForFunction(() => window.__skillBattlePreview.panel?.opened);
            await layout(page);
            assert.deepEqual(await geometry(page, left), originalLeft, "红框区域保持原有位置和尺寸");
            const marketRight = await geometry(page, ["sourceItemsArea", "sourcePagesArea"]);
            marketRight.forEach((node, index) => assert.deepEqual(node, {
                ...originalRight[index], y: originalRight[index].y + 50,
            }));
            for (const [code, text] of categories) {
                await click(page, "btn_category_" + code);
                assert.deepEqual(await page.evaluate(({ code }) => {
                    const view = window.__skillBattlePreview.view;
                    return [view.getElement("txt_market_empty").text,
                        view.getElement("img_category_" + code).src.endsWith("/page-selected.png"),
                        ["weapon", "armor", "accessory", "container", "material"].filter(key =>
                            view.getElement("img_category_" + key).src.endsWith("/page-selected.png")).length];
                }, { code }), ["暂无在售" + text, true, 1]);
                assert.equal(await page.evaluate(()=>window.__skillBattlePreview.view.getElement("txt_market_empty").visible),false);
            }
            await click(page, "btn_category_weapon");
            await flipAllPages(page);
            const image = await page.screenshot({ path: path.join(out, name + ".png") });
            const stats = await sharp(image).stats();
            assert.ok(stats.channels.slice(0, 3).some(channel => channel.stdev > 12), "画布应包含有效内容");
            assert.equal(await page.evaluate(() => localStorage.getItem("nowchange.expedition.v1")), saved);
            await drag(page,"invWeapon","invSourceCell27",{valid:false});
            await click(page, "invWeapon");
            await page.waitForFunction(() => window.__skillBattlePreview.ui.topView?.path.endsWith("/ItemDetailView.lh"));
            await click(page, "btn_category_material");
            await page.waitForTimeout(80);
            assert.ok(!await page.evaluate(() => window.__skillBattlePreview.ui.topView?.path.endsWith("/ItemDetailView.lh")));
            await click(page, "btn_close");
            await waitView(page, "LobbyView");
            await click(page, "btn_market");
            await waitView(page, "MarketView");
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.view.getElement("img_category_weapon").src.endsWith("/page-selected.png")), true);
            await click(page, "btn_close");
            await waitView(page, "LobbyView");
            assert.equal(await page.evaluate(() => localStorage.getItem("nowchange.expedition.v1")), saved);
            await click(page, "btn_warehouse");
            await waitView(page, "SkillBattleInventoryView");
            assert.deepEqual(await geometry(page, left), originalLeft);
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.panel.nodes.btn_sort.visible), true);
            await click(page,"btn_close");await click(page,"btn_market");await waitView(page,"MarketView");
            await purchase(page,name);
            assert.deepEqual(errors, []);
            await context.close();
            console.log(`通过 ${name}：九页武器、背包拖入购买/拖出出售、红绿反馈截图像素、自动旋转、取消还原、双向写失败回滚和限购读档保持。`);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
