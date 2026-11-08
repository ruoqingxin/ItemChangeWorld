import { UIManager } from "../../../games/ui/UIManager";
import { SkillBattleStartView } from "./SkillBattleStartView";
import { SkillBattleBattleView } from "./SkillBattleBattleView";
import { SkillBattleSettlementView } from "./SkillBattleSettlementView";
import type { UIBaseView } from "../../../games/ui/UIBaseView";

export type SkillBattleScreen = "start" | "battle" | "settlement";
export let currentSkillBattleView: UIBaseView;

export function openSkillBattleScreen(screen: SkillBattleScreen): void {
    const ui = UIManager.ins();
    ui.closeForm(SkillBattleStartView);
    ui.closeForm(SkillBattleBattleView);
    ui.closeForm(SkillBattleSettlementView);
    if (screen === "start") currentSkillBattleView = ui.openForm(SkillBattleStartView);
    else if (screen === "battle") currentSkillBattleView = ui.openForm(SkillBattleBattleView);
    else currentSkillBattleView = ui.openForm(SkillBattleSettlementView);
}
