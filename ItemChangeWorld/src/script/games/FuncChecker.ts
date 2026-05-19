/**
 * 功能检查器
 */
export class FuncChecker {
    /**
     * 功能检查回调
     */
    static onCheckFuncAvailable: (id: number) => boolean;
    /**
     * 检查功能是否可用
     */
    static isFuncAvailable(id: number): boolean {
        return FuncChecker.onCheckFuncAvailable?.(id) || false;
    }
}