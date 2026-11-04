import { ConfigUtil } from "../../../config/ConfigUtil";
import { SkillBattleManager } from "../manager/SkillBattleManager";
import type { ISkillActionResolution } from "../types/SkillBattleTypes";
import { SkillBattleConfigUtils } from "../utils/SkillBattleConfigUtils";

export class SkillBattleDebug {
    static mountToWindow(): void {
        (window as any).SkillBattleDebug = {
            start: (encounterId = 1) => this.start(encounterId),
            preview: (skillId: number) => this.preview(skillId),
            play: (skillId: number) => this.play(skillId),
            run: (encounterId: number, skillIds: number[]) => this.run(encounterId, skillIds),
            state: () => SkillBattleManager.ins().state,
            logs: () => SkillBattleManager.ins().logs,
            print: () => console.log(SkillBattleManager.ins().printState()),
            reset: () => SkillBattleManager.ins().reset(),
        };
        console.log("[SkillBattleDebug] 阶段 A：start(1..3)，preview(招式ID)，play(招式ID)，run(遭遇ID, 招式ID数组)");
        console.log("[SkillBattleDebug] 招式 1=剑击，2=守势，3=贯虹，4=破势；与旧 BattleDebug 相互独立");
    }

    static start(encounterId = 1) {
        const state = SkillBattleManager.ins().start(SkillBattleConfigUtils.readEncounter(ConfigUtil.Tables, encounterId));
        console.log(SkillBattleManager.ins().printState());
        return state;
    }

    static preview(skillId: number): ISkillActionResolution {
        const result = SkillBattleManager.ins().previewAction({ type: "skill", skillId });
        console.log(result.ok ? result.preview : result.reason);
        return result;
    }

    static play(skillId: number): ISkillActionResolution {
        const manager = SkillBattleManager.ins();
        const action = { type: "skill" as const, skillId };
        const preview = manager.previewAction(action);
        if (!preview.ok) {
            console.warn(preview.reason);
            return preview;
        }
        const logCount = manager.logs.length;
        const result = manager.confirmAction(action, preview.preview!.token);
        console.log(manager.logs.slice(logCount).join("\n"));
        console.log(manager.printState());
        return result;
    }

    static run(encounterId: number, skillIds: number[]) {
        this.start(encounterId);
        for (const skillId of skillIds) {
            const result = this.play(skillId);
            if (!result.ok || result.state.phase !== "player_input") {
                break;
            }
        }
        return { state: SkillBattleManager.ins().state, logs: SkillBattleManager.ins().logs };
    }
}
