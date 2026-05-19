import { BaseClass } from "./BaseClass";

export abstract class BaseDataClass extends BaseClass {
    // clear() {
    //     (this as any).ins = null;
    // }
    /**
     * 初始化数据
     */
    onReady() { };
}