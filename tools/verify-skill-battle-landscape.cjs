const fs = require("node:fs");
const path = require("node:path");

const debugUrl = process.env.SKILL_BATTLE_DEBUG_URL || "http://127.0.0.1:9223";
const pageUrl = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18094/";
const output = path.join(__dirname, "../bin/skill-battle-landscape");
fs.mkdirSync(output, { recursive: true });

async function main() {
    const targets = await fetch(`${debugUrl}/json`).then(response => response.json());
    const page = targets.find(target => target.type === "page");
    if (!page) throw new Error("No debuggable page found.");
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    const responses = new Map();
    const exceptions = [];
    let nextId = 1;

    socket.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.method === "Runtime.exceptionThrown") {
            exceptions.push(message.params.exceptionDetails.exception?.description
                || message.params.exceptionDetails.text);
        }
        if (message.id && responses.has(message.id)) {
            const { resolve, reject } = responses.get(message.id);
            responses.delete(message.id);
            if (message.error) reject(new Error(message.error.message));
            else resolve(message.result);
        }
    };
    await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = reject;
    });

    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = nextId++;
        responses.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
        const result = await send("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true,
        });
        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        }
        return result.result.value;
    };
    const waitFor = async (expression, timeout = 10000) => {
        const started = Date.now();
        while (Date.now() - started < timeout) {
            if (await evaluate(`Boolean(${expression})`)) return;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error(`Timed out waiting for ${expression}`);
    };
    const capture = async name => {
        const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
        fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(result.data, "base64"));
    };
    const inspect = async name => {
        const result = await evaluate(`(() => {
            const preview = window.__skillBattlePreview;
            const view = preview?.view;
            const root = view?.view;
            if (!root) throw new Error("Missing SkillBattle root");
            const invalid = [];
            const walk = (node, parentWidth = 1280, parentHeight = 720) => {
                for (const child of node._children || []) {
                    const shown = candidate => {
                        for (let current = candidate; current; current = current.parent) {
                            if (!current.visible || !current.active) return false;
                        }
                        return true;
                    };
                    if (child.name && shown(child)) {
                        const x = child.x || 0, y = child.y || 0;
                        const w = child.width || 0, h = child.height || 0;
                        if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 ||
                            x + w > parentWidth || y + h > parentHeight) {
                            invalid.push({ name: child.name, x, y, width: w, height: h });
                        }
                    }
                    walk(child, child.width || parentWidth, child.height || parentHeight);
                }
            };
            walk(root);
            const overflowingText = [];
            const scanText = node => {
                const shown = candidate => {
                    for (let current = candidate; current; current = current.parent) {
                        if (!current.visible || !current.active) return false;
                    }
                    return true;
                };
                if (node instanceof Laya.GTextField && shown(node) && node.text &&
                    (node.textWidth > node.width + 1 || node.textHeight > node.height + 2)) {
                    overflowingText.push({
                        name: node.name, text: node.text,
                        width: node.width, height: node.height,
                        textWidth: node.textWidth, textHeight: node.textHeight,
                    });
                }
                for (const child of node._children || []) scanText(child);
            };
            scanText(root);
            return {
                name: view.view.name,
                screen: preview.panel.screen,
                rootSize: [root.width, root.height],
                rootScale: [root.scaleX, root.scaleY],
                stageSize: [Laya.stage.width, Laya.stage.height],
                engineRoot: {
                    position: [Laya.stage.x, Laya.stage.y],
                    size: [Laya.stage.width, Laya.stage.height],
                    scale: [Laya.stage.scaleX, Laya.stage.scaleY],
                },
                gRoot: {
                    position: [Laya.GRoot.inst.x, Laya.GRoot.inst.y],
                    size: [Laya.GRoot.inst.width, Laya.GRoot.inst.height],
                    scale: [Laya.GRoot.inst.scaleX, Laya.GRoot.inst.scaleY],
                },
                adapter: (() => {
                    const node = Laya.GRoot.inst.getChildByName("adapter");
                    return node ? {
                        position: [node.x, node.y],
                        size: [node.width, node.height],
                        scale: [node.scaleX, node.scaleY],
                    } : null;
                })(),
                pouches: Array.from({ length: 5 }, (_, index) => {
                    const button = preview.panel.buttons["pouch" + index];
                    const label = button?.getChildAt(0);
                    return button ? {
                        x: button.x, y: button.y, width: button.width, height: button.height,
                        text: label?.text, font: label?.font, fontSize: label?.fontSize,
                        color: label?.color, background: label?.textIns?.bgColor,
                        border: label?.textIns?.borderColor,
                    } : null;
                }),
                invalid,
                overflowingText,
            };
        })()`);
        if (result.name !== name) throw new Error(`Expected ${name}, got ${result.name}`);
        if (result.rootSize[0] !== 1280 || result.rootSize[1] !== 720) {
            throw new Error(`${name} has wrong root size ${result.rootSize.join("x")}`);
        }
        if (result.rootScale[0] !== 1 || result.rootScale[1] !== 1) {
            throw new Error(`${name} scaled its root: ${result.rootScale.join("x")}`);
        }
        for (const [key, layout] of [["GRoot", result.gRoot], ["adapter", result.adapter]]) {
            if (!layout || layout.position.some(value => value !== 0) ||
                layout.size[0] !== 1280 || layout.size[1] !== 720 ||
                layout.scale.some(value => value !== 1)) {
                throw new Error(`${name} has invalid ${key} layout: ${JSON.stringify(layout)}`);
            }
        }
        if (result.engineRoot.position.some(value => value !== 0) ||
            result.engineRoot.size[0] !== 1280 || result.engineRoot.size[1] !== 720 ||
            result.engineRoot.scale.some(value => value !== 1)) {
            throw new Error(`${name} has invalid engine root layout: ${JSON.stringify(result.engineRoot)}`);
        }
        if (result.invalid.length) {
            throw new Error(`${name} has out-of-bounds nodes: ${JSON.stringify(result.invalid)}`);
        }
        if (result.overflowingText.length) {
            throw new Error(`${name} has overflowing text: ${JSON.stringify(result.overflowingText)}`);
        }
        return result;
    };

    await send("Runtime.enable");
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", {
        width: 1282, height: 720, deviceScaleFactor: 1, mobile: false,
    });
    await evaluate("localStorage.removeItem('nowchange.skill-expedition.v1')");
    await send("Page.navigate", { url: pageUrl });
    await waitFor("window.__skillBattlePreview?.panel");
    await new Promise(resolve => setTimeout(resolve, 600));

    const reports = [];
    reports.push(await inspect("SkillBattleStartView"));
    await capture("SkillBattleStartView");

    await evaluate("window.__skillBattlePreview.panel.startRun()");
    await waitFor("window.__skillBattlePreview.view?.view?.name === 'SkillBattleBattleView'");
    await new Promise(resolve => setTimeout(resolve, 1600));
    reports.push(await inspect("SkillBattleBattleView"));
    await capture("SkillBattleBattleView");

    await evaluate("window.__skillBattlePreview.panel.navigate('settlement')");
    await waitFor("window.__skillBattlePreview.view?.view?.name === 'SkillBattleSettlementView'");
    await new Promise(resolve => setTimeout(resolve, 600));
    reports.push(await inspect("SkillBattleSettlementView"));
    await capture("SkillBattleSettlementView");

    if (exceptions.length) throw new Error(`Browser exceptions: ${exceptions.join("\n")}`);
    console.log(JSON.stringify({ reports, screenshots: output }, null, 2));
    socket.close();
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
