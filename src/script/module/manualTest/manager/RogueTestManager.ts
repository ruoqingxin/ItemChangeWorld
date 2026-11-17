import { RogueTestConfig } from "../utils/RogueTestConfig";
import { RogueTestRules } from "../utils/RogueTestRules";
import type { RogueAction, RogueState, RogueResult } from "../types/RogueTestTypes";

export class RogueTestManager {
    readonly draft = RogueTestConfig.defaults();
    state: RogueState = null;
    error = "";
    start(): boolean {
        try {
            const next = RogueTestRules.start(this.draft);
            next.revision = (this.state?.revision ?? -1) + 1;
            this.state = next; this.error = ""; return true;
        } catch (e) { this.error = (e as Error).message; return false; }
    }
    preview(action: RogueAction): RogueResult {
        return this.state ? RogueTestRules.resolve(this.state, action) : { ok: false, state: null, reason: "请先开始演练" };
    }
    commit(action: RogueAction, revision: number): RogueResult {
        if (!this.state || revision !== this.state.revision) return { ok: false, state: this.state, reason: "状态已变化，请重新选择" };
        const result = this.preview(action);
        if (result.ok) this.state = result.state;
        this.error = result.reason || ""; return result;
    }
}
