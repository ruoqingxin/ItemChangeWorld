import { ConfigLoader, ConfigUtil } from "../src/script/config/ConfigUtil";
import { SkillBattlePanel } from "../src/script/module/skillBattle/view/SkillBattlePanel";
import { SkillBattleManager } from "../src/script/module/skillBattle/manager/SkillBattleManager";
import { SkillBattleConfigUtils } from "../src/script/module/skillBattle/utils/SkillBattleConfigUtils";

async function main(): Promise<void> {
    Laya.PlayerConfig.UI = { alwaysIncludeDefaultSkin: false } as any;
    await Laya.init(720, 1280);
    Laya.stage.scaleMode = Laya.Stage.SCALE_SHOWALL;
    Laya.stage.screenMode = Laya.Stage.SCREEN_NONE;
    Laya.stage.alignH = Laya.Stage.ALIGN_CENTER;
    Laya.stage.alignV = Laya.Stage.ALIGN_MIDDLE;
    Laya.stage.bgColor = "#111613";
    await new Promise<void>((resolve, reject) => ConfigLoader.loadAllConfig(
        Laya.Handler.create(null, ok => ok ? resolve() : reject(new Error("Config load failed")))));
    const panel = new SkillBattlePanel(id => SkillBattleConfigUtils.readEncounter(ConfigUtil.Tables, id));
    Laya.stage.addChild(panel);
    panel.openEncounter(1);
    (window as any).__skillBattlePreview = {
        panel, manager: SkillBattleManager.ins(),
        close: () => { panel.suspend(); panel.visible = false; },
        reopen: () => { panel.visible = true; panel.openEncounter(SkillBattleManager.ins().state?.encounterId || 1); },
    };
}
main().catch(error => { console.error(error); document.body.dataset.error = String(error); });
