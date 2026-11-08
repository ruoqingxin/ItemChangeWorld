import { SkillBattleView } from "./SkillBattleView";

/** Battle-only UI entry. Start and settlement are separate UIBaseViews. */
export class SkillBattleBattleView extends SkillBattleView {
    get path(): string { return "ui/prefab/module/skillBattle/SkillBattleBattleView.lh"; }
}
