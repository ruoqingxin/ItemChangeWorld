
import { BaseClass } from "src/games/common/BaseClass";
import { BaseModule } from "./BaseModule";

/**
 * 模块管理器(未解耦，内部引用)
 */
export class ModuleManager extends BaseClass {
    /**
     * 模块数组
     */
    static readonly moduleArray: BaseModule[] = [];


    init() {
        for (let module of ModuleManager.moduleArray) {
            module.onRegisterView();
            module.onInit();
        }
    }
}
