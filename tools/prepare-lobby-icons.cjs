const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const sharp = require("sharp");
const { icons } = require("lucide");

// 使用 Lucide 生成设置页的通用图标；大厅愿力与齿轮由青玉原画切图维护。
(async () => {
    const directory = path.resolve(__dirname, "../assets/ui/atlas/module/lobby");
    await fs.mkdir(directory, { recursive: true });
    await fs.copyFile(path.join(path.dirname(require.resolve("lucide/package.json")), "LICENSE"),
        path.join(directory, "LICENSE-lucide.txt"));
    for (const [name, icon] of Object.entries({
        close: "X", music: "Music",
        sound: "Volume2", check: "Check", back: "ArrowLeft",
    })) {
        const nodes = icons[icon];
        if (!nodes) throw new Error(`缺少图标：${icon}`);
        const body = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs)
            .filter(([key]) => key !== "key").map(([key, value]) => `${key}="${value}"`).join(" ")}/>`).join("");
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="${name === "wish" ? "#b3f3e5" : "#f5e7bf"}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
        const file = path.join(directory, `${name}.png`);
        await sharp(Buffer.from(svg)).png().toFile(file);
        let meta;
        try { meta = JSON.parse(await fs.readFile(file + ".meta", "utf8")); }
        catch { meta = { uuid: randomUUID() }; }
        meta.importer = { textureType: 2, sRGB: true, premultiplyAlpha: true, generateMipmap: false };
        await fs.writeFile(file + ".meta", JSON.stringify(meta, null, 2) + "\n");
    }
    console.log("大厅 Lucide 图标已输出。");
})().catch(error => { console.error(error); process.exitCode = 1; });
