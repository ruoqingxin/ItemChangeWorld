import { ConfigLoader, ConfigUtil } from "../src/script/config/ConfigUtil";
import { UIManager } from "../src/script/games/ui/UIManager";
import { SkillBattleStartView } from "../src/script/module/skillBattle/view/SkillBattleStartView";
import { SkillBattleBattleView } from "../src/script/module/skillBattle/view/SkillBattleBattleView";
import { SkillBattleSettlementView } from "../src/script/module/skillBattle/view/SkillBattleSettlementView";
import { SkillBattleUISession } from "../src/script/module/skillBattle/view/SkillBattleUISession";
import { currentSkillBattleView, openSkillBattleScreen } from "../src/script/module/skillBattle/view/SkillBattleUINavigation";
import { SkillBattleManager } from "../src/script/module/skillBattle/manager/SkillBattleManager";
import { SkillBattleMapView } from "../src/script/module/expedition/view/SkillBattleMapView";

async function main(): Promise<void> {
    Laya.PlayerConfig.UI = { alwaysIncludeDefaultSkin: false } as any;
    // The preview can run on browsers whose WebGL texture-array path renders
    // glyphs as opaque quads. Use Laya's regular 2D texture upload path here.
    Laya.TextRenderConfig.useTextureArray = false;
    Laya.Config.useWebGL2 = false;
    await Laya.init(1280, 720);
    Laya.stage.scaleMode = Laya.Stage.SCALE_SHOWALL;
    Laya.stage.screenMode = Laya.Stage.SCREEN_HORIZONTAL;
    Laya.stage.alignH = Laya.Stage.ALIGN_CENTER;
    Laya.stage.alignV = Laya.Stage.ALIGN_MIDDLE;
    Laya.stage.bgColor = "#111613";
    await new Promise<void>((resolve, reject) => ConfigLoader.loadAllConfig(
        Laya.Handler.create(null, ok => ok ? resolve() : reject(new Error("Config load failed")))));
    // Use the same UIManager/GRoot path as the actual game. The preview must
    // not place a second hand-built panel directly on the stage.
    UIManager.ins().init();
    const trial = SkillBattleUISession.getTrial();
    openSkillBattleScreen(trial.screen);
    const initialView = currentSkillBattleView;
    const preview = {
        manager: SkillBattleManager.ins(), trial, ui: UIManager.ins(),
        get view() { return currentSkillBattleView || initialView; },
        get panel() { return ((currentSkillBattleView || initialView) as any).panel; },
        close: () => {
            UIManager.ins().closeForm(SkillBattleStartView);
            UIManager.ins().closeForm(SkillBattleBattleView);
            UIManager.ins().closeForm(SkillBattleMapView);
            UIManager.ins().closeForm(SkillBattleSettlementView);
        },
        reopen: () => {
            openSkillBattleScreen(trial.screen);
        },
    };
    (window as any).__skillBattlePreview = preview;
}
main().catch(error => { console.error(error); document.body.dataset.error = String(error); });
