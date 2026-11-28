const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("sharp");

const outDir = path.resolve(__dirname, "../assets/ui/atlas/module/skillBattle");

const assets = {
    "panel-jade.png": `
        <svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#173329" stop-opacity="0.82"/>
                    <stop offset="1" stop-color="#07110d" stop-opacity="0.9"/>
                </linearGradient>
                <linearGradient id="pa" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stop-color="#b8e2ce"/>
                    <stop offset="0.45" stop-color="#6fa488" stop-opacity="0.75"/>
                    <stop offset="1" stop-color="#7a9a86" stop-opacity="0.35"/>
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="60" height="60" rx="9" fill="url(#pg)"/>
            <rect x="2.5" y="2.5" width="59" height="59" rx="9" fill="none" stroke="url(#pa)" stroke-width="1.4"/>
            <rect x="6" y="6" width="52" height="52" rx="6" fill="none" stroke="#7fa892" stroke-opacity="0.16"/>
            <path d="M8 3h16" stroke="#ccead9" stroke-opacity="0.75" stroke-width="1.2"/>
            <path d="M8 61h10" stroke="#c7b77d" stroke-opacity="0.45" stroke-width="1"/>
            <path d="M56 61h-11" stroke="#7fa892" stroke-opacity="0.28" stroke-width="1"/>
        </svg>`,
    "panel-ember.png": `
        <svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#3a211b" stop-opacity="0.82"/>
                    <stop offset="1" stop-color="#120b08" stop-opacity="0.9"/>
                </linearGradient>
                <linearGradient id="ra" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stop-color="#f0b4a3"/>
                    <stop offset="0.5" stop-color="#c66b5b" stop-opacity="0.72"/>
                    <stop offset="1" stop-color="#8f5145" stop-opacity="0.32"/>
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="60" height="60" rx="9" fill="url(#rg)"/>
            <rect x="2.5" y="2.5" width="59" height="59" rx="9" fill="none" stroke="url(#ra)" stroke-width="1.4"/>
            <rect x="6" y="6" width="52" height="52" rx="6" fill="none" stroke="#d08272" stroke-opacity="0.16"/>
            <path d="M8 3h16" stroke="#f4c2b2" stroke-opacity="0.78" stroke-width="1.2"/>
            <path d="M8 61h10" stroke="#e6ae7c" stroke-opacity="0.5" stroke-width="1"/>
            <path d="M56 61h-11" stroke="#d08272" stroke-opacity="0.3" stroke-width="1"/>
        </svg>`,
    "intent-panel.png": `
        <svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="ig" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#26150f" stop-opacity="0.86"/>
                    <stop offset="1" stop-color="#0b0806" stop-opacity="0.94"/>
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="60" height="60" rx="7" fill="url(#ig)"/>
            <rect x="2.5" y="2.5" width="59" height="59" rx="7" fill="none" stroke="#cc6b5c" stroke-opacity="0.72" stroke-width="1.4"/>
            <path d="M4 8h14" stroke="#f4c2b2" stroke-opacity="0.85" stroke-width="1.2"/>
            <path d="M4 13h7" stroke="#e6ae7c" stroke-opacity="0.55" stroke-width="1"/>
            <path d="M7 4v12" stroke="#f4c2b2" stroke-opacity="0.32" stroke-width="1"/>
        </svg>`,
    "dock-panel.png": `
        <svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#08130e" stop-opacity="0.94"/>
                    <stop offset="0.24" stop-color="#0b1a13" stop-opacity="0.98"/>
                    <stop offset="1" stop-color="#040a07" stop-opacity="0.99"/>
                </linearGradient>
                <linearGradient id="dl" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stop-color="#7fa892" stop-opacity="0.15"/>
                    <stop offset="0.2" stop-color="#b8e2ce" stop-opacity="0.6"/>
                    <stop offset="0.8" stop-color="#b8e2ce" stop-opacity="0.6"/>
                    <stop offset="1" stop-color="#7fa892" stop-opacity="0.15"/>
                </linearGradient>
            </defs>
            <rect x="2" y="2" width="60" height="60" rx="6" fill="url(#dg)"/>
            <path d="M4 4h56" stroke="url(#dl)" stroke-width="1.2"/>
            <path d="M4 9h18M42 9h18" stroke="#9ac2aa" stroke-opacity="0.18" stroke-width="1"/>
            <rect x="3" y="3" width="58" height="58" rx="6" fill="none" stroke="#7fa892" stroke-opacity="0.28" stroke-width="1"/>
        </svg>`,
    "button-normal.png": `
        <svg width="64" height="48" viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#294536" stop-opacity="0.94"/>
                    <stop offset="1" stop-color="#0c1b13" stop-opacity="0.96"/>
                </linearGradient>
            </defs>
            <rect x="1.5" y="1.5" width="61" height="45" rx="7" fill="url(#bg)"/>
            <rect x="2" y="2" width="60" height="44" rx="7" fill="none" stroke="#7fa892" stroke-opacity="0.42" stroke-width="1.1"/>
            <path d="M5 3h18" stroke="#d8eede" stroke-opacity="0.35" stroke-width="1"/>
            <rect x="4" y="4" width="56" height="40" rx="5" fill="none" stroke="#c9e3d4" stroke-opacity="0.08"/>
        </svg>`,
    "button-selected.png": `
        <svg width="64" height="48" viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#58a882" stop-opacity="0.98"/>
                    <stop offset="1" stop-color="#173c2a" stop-opacity="0.98"/>
                </linearGradient>
                <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="2.2" result="b"/>
                    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
            </defs>
            <rect x="1.5" y="1.5" width="61" height="45" rx="7" fill="url(#sg)" filter="url(#glow)"/>
            <rect x="2" y="2" width="60" height="44" rx="7" fill="none" stroke="#d3f5e4" stroke-opacity="0.88" stroke-width="1.4"/>
            <path d="M5 3h20" stroke="#eafff4" stroke-opacity="0.65" stroke-width="1.2"/>
            <path d="M6 42h-1M58 42h1" stroke="#9fd7ba" stroke-opacity="0.55" stroke-width="1"/>
        </svg>`,
    "button-disabled.png": `
        <svg width="64" height="48" viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg">
            <rect x="1.5" y="1.5" width="61" height="45" rx="7" fill="#0a130e" fill-opacity="0.78"/>
            <rect x="2" y="2" width="60" height="44" rx="7" fill="none" stroke="#77867b" stroke-opacity="0.28" stroke-width="1"/>
            <path d="M5 3h12" stroke="#91a397" stroke-opacity="0.2" stroke-width="1"/>
        </svg>`,
    "bar-frame.png": `
        <svg width="64" height="16" viewBox="0 0 64 16" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="62" height="14" rx="7" fill="#050b08" fill-opacity="0.92"/>
            <rect x="1.5" y="1.5" width="61" height="13" rx="6.5" fill="none" stroke="#9ab3a1" stroke-opacity="0.5" stroke-width="1"/>
            <rect x="4" y="4" width="56" height="8" rx="4" fill="#000000" fill-opacity="0.35"/>
        </svg>`,
    "bar-hp.png": `
        <svg width="64" height="16" viewBox="0 0 64 16" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="hg" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#8ee6ae"/><stop offset="1" stop-color="#4ba66f"/>
            </linearGradient></defs>
            <rect x="3" y="3" width="58" height="10" rx="5" fill="url(#hg)"/>
            <path d="M6 4.5h22" stroke="#e9ffef" stroke-opacity="0.5" stroke-width="1"/>
        </svg>`,
    "bar-mp.png": `
        <svg width="64" height="16" viewBox="0 0 64 16" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#9fd9f1"/><stop offset="1" stop-color="#4d83ad"/>
            </linearGradient></defs>
            <rect x="3" y="3" width="58" height="10" rx="5" fill="url(#mg)"/>
            <path d="M6 4.5h22" stroke="#eaf8ff" stroke-opacity="0.5" stroke-width="1"/>
        </svg>`,
    "bar-shield.png": `
        <svg width="64" height="16" viewBox="0 0 64 16" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#f1d69a"/><stop offset="1" stop-color="#a98643"/>
            </linearGradient></defs>
            <rect x="3" y="3" width="58" height="10" rx="5" fill="url(#sg)"/>
            <path d="M6 4.5h22" stroke="#fff3d5" stroke-opacity="0.5" stroke-width="1"/>
        </svg>`,
};

async function main() {
    fs.mkdirSync(outDir, { recursive: true });
    for (const [name, svg] of Object.entries(assets)) {
        const target = path.join(outDir, name);
        await sharp(Buffer.from(svg), { density: 72 }).png().toFile(target);
        const meta = {
            uuid: crypto.randomUUID(),
        };
        fs.writeFileSync(`${target}.meta`, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
        console.log(name);
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
