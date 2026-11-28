const SKIN_PATHS = {
    panelJade: "ui/atlas/module/skillBattle/panel-jade.png",
    panelEmber: "ui/atlas/module/skillBattle/panel-ember.png",
    intentPanel: "ui/atlas/module/skillBattle/intent-panel.png",
    dockPanel: "ui/atlas/module/skillBattle/dock-panel.png",
    buttonNormal: "ui/atlas/module/skillBattle/button-normal.png",
    buttonSelected: "ui/atlas/module/skillBattle/button-selected.png",
    buttonDisabled: "ui/atlas/module/skillBattle/button-disabled.png",
    barFrame: "ui/atlas/module/skillBattle/bar-frame.png",
    barHp: "ui/atlas/module/skillBattle/bar-hp.png",
    barMp: "ui/atlas/module/skillBattle/bar-mp.png",
    barShield: "ui/atlas/module/skillBattle/bar-shield.png",
};

export type BattleSkinKey = keyof typeof SKIN_PATHS;

/**
 * 战斗界面皮肤资源管理。
 * 面板、按钮和血条统一走同一套 9 宫格纹理，避免继续用运行时矩形拼 UI。
 */
export class BattleUISkin {
    private static loading: Promise<BattleUISkin> | null = null;
    private readonly textures = new Map<BattleSkinKey, Laya.Texture>();

    static load(): Promise<BattleUISkin> {
        if (!this.loading) {
            this.loading = Promise.all(Object.entries(SKIN_PATHS).map(async ([key, path]) => {
                const texture = await Laya.loader.load(path);
                if (!texture) throw new Error(`战斗 UI 皮肤加载失败：${path}`);
                return [key as BattleSkinKey, texture as Laya.Texture] as const;
            })).then(entries => {
                const skin = new BattleUISkin();
                for (const [key, texture] of entries) skin.textures.set(key, texture);
                return skin;
            });
        }
        return this.loading;
    }

    texture(key: BattleSkinKey): Laya.Texture | null {
        return this.textures.get(key) || null;
    }
}
