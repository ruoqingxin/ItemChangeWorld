import type { ManualTestState, ManualTestSetup } from "../types/ManualTestTypes";
import { ManualTestConfig } from "../utils/ManualTestConfig";

export class ManualTestData {
    draft: ManualTestSetup = ManualTestConfig.defaults();
    state: ManualTestState | null = null;
    error = "";
}
