import { BaseClass } from "../../games/common/BaseClass";
import { AppConfig } from "../AppConfig";


export default class DeviceUtils extends BaseClass {
    /**
     * 是否是网页
     */
    public get isWeb(): boolean {
        return AppConfig.buildType === "web" || AppConfig.buildType === "editor";
    }

    /**
     * 判断当前是否是开发环境
     */
    public isDevelop(): boolean {
        return AppConfig.defines.indexOf("DEVELOP") > -1;
    }

    /**
     * 获取启动参数
     * @param variable 
     * @returns 
     */
    public getQueryVariable(variable: string) {
        if (window.location) {
            var query = window.location.search.substring(1);
            var vars = query.split("&");
            for (var i = 0; i < vars.length; i++) {
                var pair = vars[i].split("=");
                if (pair[0] == variable) { return pair[1]; }
            }
            return "";
        }
    }
}