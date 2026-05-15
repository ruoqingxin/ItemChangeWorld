/**
 * 打包平台配置
 */
export class AppConfig {
    /**
     * 当前打包projectCode
     */
    static projectCode: string = 'xiangqi';
    /**
     * 当前打包branch
     */
    static branch: string = 'dev';
    /**
     * 当前打包buildType
     */
    static buildType: string = 'editor';
    /**
     * 当前打包id 详情规则请参考打包规则文档
     */
    static id: number = 1;
    /**
     * 当前版本号
     */
    static version: string = '1.0.0';
    /**
     * 构建号
     */
    static buildNumber: number = 0;
    /**
     * 当前cdn
     */
    static url: string = '';
    /**
     * cdn子目录
     */
    static urlSub: string = '';
    /**
     * 登录url
     */
    static wsAddress: string = 'ws://159.75.109.51:13308';
    /**
     * 是否开启打点上报
     */
    static enable_report: boolean;
    /**
     * 是否是审核模式
     */
    static is_sandbox: boolean;
    /**
     * 是否开启强制更新
     */
    static force_update: boolean;
    /**
     * 当前定义宏
     */
    static defines: string[] = ['DEVELOP'];

    /**
     * 获取完整版本号
     * @returns 
     */
    static getFullVersion() {
        return `${this.version}.${this.buildNumber}`;
    }

    /**
     * 当前是否是版署环境
     * @returns 
     */
    static isBanShuEvn() {
        return this.defines.indexOf(`BANSHU`) != -1;
    }
}