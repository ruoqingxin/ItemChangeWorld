import { ConfigLoader, ConfigUtil } from "../src/script/config/ConfigUtil";
import { UIManager } from "../src/script/games/ui/UIManager";
import { GameplayManager } from "../src/script/module/gameplay/manager/GameplayManager";
import { closeSkillBattleScreens, currentSkillBattleView, openSkillBattleScreen } from "../src/script/module/gameplay/utils/GameplayNavigation";
import { SkillBattleManager } from "../src/script/module/skillBattle/manager/SkillBattleManager";
import { BuildConfigUtils } from "../src/script/module/build/utils/BuildConfigUtils";
import { ManualTestView } from "../src/script/module/manualTest/view/ManualTestView";
import { GameStart } from "../src/script/GameStart";

async function main(): Promise<void> {
    Laya.PlayerConfig.UI = { alwaysIncludeDefaultSkin: false } as any;


    Laya.TextRenderConfig.useTextureArray = false;
    Laya.Config.useWebGL2 = false;

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
    if (new URLSearchParams(window.location.search).get("manualTest") === "1") {
        await new Promise<void>((resolve, reject) => ConfigLoader.loadAllConfig(
            Laya.Handler.create(null, ok => ok ? resolve() : reject(new Error("配置加载失败")))));
        UIManager.ins().init();
        BuildConfigUtils.read(ConfigUtil.Tables);
        const view = UIManager.ins().openForm(ManualTestView);
        (window as any).__manualTestPreview = { view, get panel() { return view.panel; }, get session() { return view.panel.session; } };
        return;
    }
    new GameStart();
    await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 15000;
        const check = () => {
            if (currentSkillBattleView?.isOpened) resolve();
            else if (Date.now() >= deadline) reject(new Error("正式启动超时"));
            else setTimeout(check, 50);
        };
        check();
    });
    const trial = GameplayManager.getActive();
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
