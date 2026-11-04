// Run with NODE_PATH pointing at a runtime containing lucide and sharp.
const { icons } = require("lucide");
const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");
const output = path.join(__dirname, "../assets/ui/texture/skillBattle");
fs.mkdirSync(output, { recursive: true });
Promise.all(["Sword", "Shield", "Zap", "ShieldOff"].map(async (name, index) => {
    const nodes = icons[name].map(([tag, attributes]) =>
        `<${tag} ${Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(" ")}/>`).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24"
        fill="none" stroke="#c5d5bd" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${nodes}</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(output, `skill-${index + 1}.png`));
})).catch(error => { console.error(error); process.exitCode = 1; });
