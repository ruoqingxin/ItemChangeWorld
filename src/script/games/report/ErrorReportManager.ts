import { BaseClass } from "../common/BaseClass";

/** 当前客户端在本地输出异常，同一堆栈只记录一次。 */
export class ErrorReportManager extends BaseClass {
    private readonly reported = new Set<string>();

    reportError(error: Error): void {
        const key = error.stack || error.message;
        if (this.reported.has(key)) return;
        this.reported.add(key);
        console.error(error);
    }

    reportLog(message: string): void {
        this.reportError(new Error(message));
    }
}
