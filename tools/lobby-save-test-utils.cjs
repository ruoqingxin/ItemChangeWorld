async function confirmStartup(page) {
    await page.waitForFunction(() => window.__skillBattlePreview?.view?.isOpened &&
        window.__skillBattlePreview.view.path.endsWith("/LobbySaveView.lh"));
    const point = await page.evaluate(() => {
        const n = window.__skillBattlePreview.view.getElement("btn_save_confirm");
        const p = n.localToGlobal(new Laya.Point(n.width / 2, n.height / 2));
        const r = document.querySelector("canvas").getBoundingClientRect();
        return { x: r.left + p.x * r.width / Laya.stage.width,
            y: r.top + p.y * r.height / Laya.stage.height };
    });
    if (page.touchMode) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.__skillBattlePreview.view.isOpened &&
        !window.__skillBattlePreview.view.path.endsWith("/LobbySaveView.lh"));
}
module.exports = { confirmStartup };
