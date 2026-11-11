const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch({
        headless: true,
        executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.clear();
        crypto.getRandomValues = target => { target.fill(1); return target; };
    });
    await page.goto("http://127.0.0.1:18094");
    await page.waitForFunction(() => window.__skillBattlePreview?.panel?.opened &&
        window.__skillBattlePreview.view.isOpened, { timeout: 30000 });
    const command = async key => {
        await page.evaluate(key => window.__skillBattlePreview.panel.command(key), key);
        await page.waitForTimeout(100);
    };
    await command("invPrimary");
    await command("invPrimary");
    while (await page.evaluate(() => !!window.__skillBattlePreview.trial.inventory.flow?.pending)) {
        await command("warehouse0");
        await command("newRun");
    }
    if (await page.evaluate(() => window.__skillBattlePreview.panel.nodes?.inventoryRoot?.visible))
        await command("invToggle");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: "tmp/map-ui-after.png" });
    const state = await page.evaluate(() => {
        const panel = window.__skillBattlePreview.panel;
        return {
            opened: panel.opened,
            map: panel.expeditionNodes.expeditionRoot.visible,
            labels: Object.fromEntries(["expResources", "expSpirit", "expDurability", "expWins", "expClock"]
                .map(key => [key, {
                    text: panel.labels[key]?.text,
                    width: panel.labels[key]?.width,
                    height: panel.labels[key]?.height,
                    visible: panel.labels[key]?.visible,
                }])),
        };
    });
    console.log(JSON.stringify({ errors, state }, null, 2));
    await browser.close();
})().catch(error => {
    console.error(error);
    process.exit(1);
});
