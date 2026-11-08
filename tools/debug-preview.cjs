async function main() {
const targets = await fetch("http://127.0.0.1:9223/json").then(r => r.json());
const target = targets.find(item => item.type === "page");
const socket = new WebSocket(target.webSocketDebuggerUrl);
const exceptions = [];
const consoleMessages = [];
socket.onopen = () => {
    socket.send(JSON.stringify({ id: 4, method: "Runtime.enable" }));
    socket.send(JSON.stringify({ id: 5, method: "Log.enable" }));
    socket.send(JSON.stringify({ id: 1, method: "Page.reload", params: { ignoreCache: true } }));
    setTimeout(() => socket.send(JSON.stringify({
        id: 2,
        method: "Runtime.evaluate",
        params: {
            expression: `JSON.stringify({
            error: document.body.dataset.error,
            href: location.href,
            title: document.title,
            hasLaya: !!window.Laya,
            mapperRegistered: !!Laya.ClassUtils.getClass("3593fc26-337e-42e3-92dc-1b9c2bb8f988"),
            mapperByName: !!Laya.ClassUtils.getClass("ElementMapper"),
            useTextureArray: Laya.TextRenderConfig.useTextureArray,
            webgl: (() => {
                const canvas = document.querySelector("canvas");
                const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
                return { size: canvas && [canvas.width, canvas.height], version: gl?.getParameter(gl.VERSION),
                    renderer: gl?.getParameter(gl.RENDERER) };
            })(),
            preview: !!window.__skillBattlePreview,
            panel: !!window.__skillBattlePreview?.panel,
            panelKeys: Object.keys(window.__skillBattlePreview?.panel || {}),
            viewName: window.__skillBattlePreview?.view?.view?.name,
            viewKeys: Object.keys(window.__skillBattlePreview?.view || {}),
            closeHandler: window.__skillBattlePreview?.view?.onClose?.toString(),
            constructed: window.__skillBattlePreview?.view?._constructed,
            opened: window.__skillBattlePreview?.view?.isOpened,
            hasPrefabRoot: !!window.__skillBattlePreview?.view?.view,
            panelScreen: window.__skillBattlePreview?.panel?.screen,
            renderer: (() => {
                const tr = Laya.Render2DProcessor?.runner?._textRender;
                if (!tr) return { missingTextRenderer: true, runner: Object.keys(Laya.Render2DProcessor?.runner || {}) };
                const image = tr.ctx.getImageData(0, 0, tr.canvas.width, tr.canvas.height).data;
                const colors = {};
                for (let i = 0; i < image.length; i += 4) {
                    if (!image[i + 3]) continue;
                    const key = image[i] + "," + image[i + 1] + "," + image[i + 2] + "," + image[i + 3];
                    colors[key] = (colors[key] || 0) + 1;
                }
                return { canvas: [tr.canvas.width, tr.canvas.height], font: tr.ctx.font, fill: tr.ctx.fillStyle,
                    colors: Object.entries(colors).slice(0, 12), colorCount: Object.keys(colors).length };
            })(),
            labels: Object.entries(window.__skillBattlePreview?.panel?.labels || {}).slice(0, 8)
                .map(([key, value]) => ({
                    key, text: value.text, font: value.font, color: value.color,
                    bg: value.textIns?.bgColor, border: value.textIns?.borderColor,
                    commands: value.textIns?.graphics?.cmds?.map(cmd => ({
                        type: cmd.constructor.name, id: cmd.cmdID, text: cmd.text,
                        color: cmd.fillColor, font: cmd.font, fontSize: cmd.fontSize,
                        renderInfo: value.textIns?._renderInfo?.length,
                    })),
                })),
        })`,
            returnByValue: true,
        },
    })), 5000);
};
socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
        exceptions.push(message.params.exceptionDetails.exception?.description ||
            message.params.exceptionDetails.text);
    }
    if (message.method === "Runtime.consoleAPICalled" || message.method === "Log.entryAdded") {
        const args = message.params.args || message.params.entry?.args || [];
        const text = args.map(arg => arg.value || arg.description || "").join(" ");
        if (text) consoleMessages.push(text);
    }
    if (message.id === 2) {
                const result = JSON.parse(message.result?.result?.value || "{}");
                result.exceptions = exceptions;
                result.consoleMessages = consoleMessages.slice(-20);
                console.log(JSON.stringify(result));
                socket.send(JSON.stringify({ id: 3, method: "Page.captureScreenshot", params: { format: "png" } }));
            } else if (message.id === 3) {
                require("node:fs").writeFileSync("C:/work/NowChange/ItemChangeWorld/bin/skill-battle-preview-cdp.png",
                    Buffer.from(message.result.data, "base64"));
                socket.close();
    }
};
}
main().catch(error => { console.error(error); process.exitCode = 1; });
