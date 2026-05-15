import { ConsoleLogger } from "./ConsoleLogger";
import { AppConfig } from "src/script/AppConfig";
import { BaseClass } from "../common/BaseClass";
/**
 * 错误上报管理
 */
export class ErrorReportManager extends BaseClass {
    /**
     * 错误上报地址
     */
    public readonly reportUrl = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=a1d02916-86e1-42ea-af86-926b6f6ef935";
    /**
     * 防止重复错误上报
     */
    private _reportMap: { [key: string]: boolean } = {};
    private readonly sourceMapHtmlUrl = "http://192.168.0.250:8081/res/packages/sourceMapHtml/index.html";
    /**
     * 上报错误
     * @param e e
     */
    reportError(e: Error) {
        console.error(e);
        if (AppConfig.buildType === "editor") {
            return;
        }
        const key = e.stack || e.message;
        if (this._reportMap[key]) {
            return;
        }
        this._reportMap[key] = true;
        const stack = e.stack || 'No stack trace available';
        const sourceMapUrl = this.buildSourceMapUrl(stack);
        const message =
            `**堆栈还原**: [点击查看详情](${sourceMapUrl})\n` +
            `**堆栈信息**:\n\`\`\`\n${stack}\n\`\`\``;
        //Reporter.sendMsgToWework(this.reportUrl, message)
    }
    reportLog(str: string) {
        const e = new Error(str);
        this.reportError(e);
    }

    private buildSourceMapUrl(stack: string): string {
        const encodedStack = encodeURIComponent(stack || "");
        return `${this.sourceMapHtmlUrl}?projectCode=${AppConfig.projectCode}&id=${AppConfig.id}&branch=${AppConfig.branch}&buildType=${AppConfig.buildType}&version=${AppConfig.getFullVersion()}&stack=${encodedStack}`;
    }
}