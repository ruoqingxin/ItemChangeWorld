const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const ide = process.env.LAYA_IDE_RESOURCES || path.join(process.env.LOCALAPPDATA, "Programs/LayaAirIDE/resources");
const esbuild = require(path.join(ide, "node_modules/esbuild"));
const port = Number(process.env.PORT || 18094);
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>末法寻仙 · 战斗</title><style>html,body{margin:0;width:100%;height:100%;background:#111613;overflow:hidden}</style>
</head><body><script src="/libs/laya.core.js"></script><script src="/libs/laya.webgl_2D.js"></script>
<script src="/libs/laya.ui2.js"></script><script src="/preview.js"></script></body></html>`;
const types = { ".js": "application/javascript", ".bin": "application/octet-stream", ".png": "image/png" };
http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://localhost:${port}`).pathname;
        if (url === "/favicon.ico") { res.writeHead(204).end(); return; }
        if (url === "/") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); return; }
        if (url === "/preview.js") {
            const result = await esbuild.build({
                entryPoints: [path.join(__dirname, "preview-skill-battle.ts")],
                bundle: true, write: false, format: "iife", target: "es2020",
                tsconfig: path.join(root, "tsconfig.json"),
            });
            res.setHeader("Content-Type", "application/javascript");
            res.end(result.outputFiles[0].contents);
            return;
        }
        const base = url.startsWith("/libs/") ? path.join(ide, "engine/libs") : path.join(root, "assets");
        const relative = url.startsWith("/libs/") ? url.slice(6) : url.slice(1);
        const file = path.resolve(base, relative);
        if (!file.startsWith(path.resolve(base) + path.sep)) { res.writeHead(403).end(); return; }
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
        res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
        res.end(fs.readFileSync(file));
    } catch (error) {
        console.error(error.message);
        res.writeHead(500).end(error.message);
    }
}).listen(port, "127.0.0.1", () => console.log(`Skill battle preview: http://127.0.0.1:${port}`));
