
/*
 * @Author: GaryJy 1035465291@qq.com
 * @Date: 2024-04-30 15:33:23
 * @LastEditors: GaryJy 1035465291@qq.com
 * @LastEditTime: 2025-04-24 12:14:31
 * @FilePath: \minigame3.0\src\script\const\GameConst.ts
 * @Description:
 */
export default class GameConst {
    static readonly appName: string = "default";
    /**是否TOKEN异常 */
    public static IS_TOKEN_ERROR: boolean = false;
    /**是否账号被封禁 */
    public static IS_BAN_ROLE: boolean = false;
    /**是否异地登录 */
    public static IS_REPEAT_LOGIN: boolean = false;
    /**是否需要断线重连 */
    public static IS_NEED_RECONNECT: boolean = false;
}