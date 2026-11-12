import { ConfigLoader, ConfigUtil } from "../src/script/config/ConfigUtil";
import { UIManager } from "../src/script/games/ui/UIManager";
import { GameplayManager } from "../src/script/module/gameplay/manager/GameplayManager";
import { closeSkillBattleScreens, currentSkillBattleView, openSkillBattleScreen } from "../src/script/module/gameplay/utils/GameplayNavigation";
import { SkillBattleManager } from "../src/script/module/skillBattle/manager/SkillBattleManager";

async function main(): Promise<void> {
    Laya.PlayerConfig.UI = { alwaysIncludeDefaultSkin: false } as any;
    // The preview can run on browsers whose WebGL texture-array path renders
    // glyphs as opaque quads. Use Laya's regular 2D texture upload path here.
    Laya.TextRenderConfig.useTextureArray = false;
    Laya.Config.useWebGL2 = false;
    // Native nested prefabs use the same UUID links as IDE/published assets.
    const uuidMap = await (await fetch("/ui-prefab-uuids.json")).json();
    Object.assign(Laya.AssetDb.inst.uuidMap, uuidMap);
    const resolveUUID = Laya.AssetDb.inst.UUID_to_URL_async.bind(Laya.AssetDb.inst);
    Laya.AssetDb.inst.UUID_to_URL_async = uuid => uuidMap[uuid] ?
        Promise.resolve(uuidMap[uuid]) : resolveUUID(uuid);
    await Laya.init(1280, 720);
    Laya.stage.scaleMode = Laya.Stage.SCALE_FIXED_AUTO;
    Laya.stage.screenMode = Laya.Stage.SCREEN_HORIZONTAL;
    Laya.stage.alignH = Laya.Stage.ALIGN_CENTER;
    Laya.stage.alignV = Laya.Stage.ALIGN_MIDDLE;
    Laya.stage.bgColor = "#111613";
    await new Promise<void>((resolve, reject) => ConfigLoader.loadAllConfig(
        Laya.Handler.create(null, ok => ok ? resolve() : reject(new Error("Config load failed")))));
    // Use the same UIManager/GRoot path as the actual game. The preview must
    // not place a second hand-built panel directly on the stage.
    UIManager.ins().init();
    GameplayManager.previewSingleTrial = new URLSearchParams(window.location.search).get("stage") === "1";
    GameplayManager.previewBuildTrial = new URLSearchParams(window.location.search).get("stage") === "2";
    GameplayManager.previewInventoryTrial = new URLSearchParams(window.location.search).get("stage") === "3";
    const trial = GameplayManager.getActive();
    openSkillBattleScreen(trial.screen);
    const initialView = currentSkillBattleView;
    const preview = {
        manager: SkillBattleManager.ins(), trial, ui: UIManager.ins(),
        get view() { return currentSkillBattleView || initialView; },
        get panel() { return ((currentSkillBattleView || initialView) as any).panel; },
        close: () => closeSkillBattleScreens(),
        reopen: () => {
            openSkillBattleScreen(trial.screen);
        },
    };
    (window as any).__skillBattlePreview = preview;
}
main().catch(error => { console.error(error); document.body.dataset.error = String(error); });
