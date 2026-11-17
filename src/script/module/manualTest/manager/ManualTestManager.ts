import { ManualTestData } from "../data/ManualTestData";
import { ManualTestRules as R } from "../utils/ManualTestRules";
import type { ManualTestAction, ManualTestResult } from "../types/ManualTestTypes";

/** Memory-only sandbox. Never obtains a production session, inventory, or storage adapter. */
export class ManualTestManager {
    readonly data = new ManualTestData();
    get state() { return this.data.state; }
    get draft() { return this.data.draft; }
    get error() { return this.data.error; }
    start(): boolean {
        try {
            const state = R.start(this.data.draft);
            state.revision = (this.state?.revision ?? -1) + 1;
            this.data.state = state; this.data.error = ""; return true;
        } catch (e) { this.data.error = (e as Error).message; return false; }
    }
    preview(action: ManualTestAction): ManualTestResult {
        if (!this.state) return { ok: false, reason: "请先开始演练", state: null };
        return R.resolve(this.state, action);
    }
    commit(action: ManualTestAction, revision: number): ManualTestResult {
        if (!this.state || this.state.revision !== revision) {
            return { ok: false, reason: "演练状态已变化，请重新选择", state: this.state };
        }
        const result = this.preview(action);
        if (result.ok) this.data.state = result.state;
        this.data.error = result.reason || "";
        return result;
    }
}
