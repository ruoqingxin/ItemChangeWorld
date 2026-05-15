/*
 * @Author: GaryJy 1035465291@qq.com
 * @Date: 2024-04-30 15:22:25
 * @LastEditors: GaryJy 1035465291@qq.com
 * @LastEditTime: 2025-06-10 17:18:45
 * @FilePath: \minigame3.0\src\script\net\GameMessageFactory.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */

import { BaseClass } from "src/games/common/BaseClass";
import GameConst from "../const/GameConst";
import DeviceUtils from "../utils/DeviceUtils";
import NetService, { NetMessageType } from "./NetService";
import { ErrorReportManager } from "src/games/report/ErrorReportManager";

export default class GameMessageFactory extends BaseClass implements asgard.message.IMessageFactory {

    private messageMap: any = {};
    private handlerMap: any = {};
    private _msgHandlerMap: { [msg: string]: Laya.Handler[] } = {};

    constructor() {
        super();
        this._msgHandlerMap = {};
    }

    public getAppName(): string {
        return GameConst.appName;
    }

    public clearData(): void {

    }

    public getMessage(msgId: number): asgard.utils.SimpleDelegate {
        return this.messageMap[1];
    }

    public getHandler(msgId: number): asgard.utils.SimpleDelegate {
        return this.handlerMap[1];
    }

    private onHandleCorePb(core: cmd.core_thin_pb): void {
        var strkey = "module:" + core.module + ",cmd:" + core.name;
        // console.log("GaryTest  onHandleCorePb   strkey  " + strkey);
        var msgType: NetMessageType = NetService.MessageTable[strkey]
        if (msgType != null) {
            let msgName = msgType.className;
            try {
                //@ts-ignore
                var msg = cmd[msgName].decode(core.msg, (core.msg.length));
            } catch (error) {
                console.warn("消息处理异常！！！！  ", msgName)
                return
            }

            if (DeviceUtils.ins().isDevelop() || (!DeviceUtils.ins().isMiniGame && Laya.Browser.onSafari)) {
                if (msgName != "client_heartbeat_toc" && msgName != "chat_panel_info_s2c"
                    && msgName != "g_cue_pos_syn_s2c" && msgName != "g_cue_power_dir_syn_s2c"
                ) {
                    let date = new Date();
                    console.warn("收到消息========", `{${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}:${date.getTime() % 1000}}`, msgName + JSON.stringify(msg))
                }
            }

            try {
                //往全局netProc广播消息，需要处理的地方 直接 netProc.on监听即可
                // Laya.stage.event(msgType.minName, msg);
                const handles: Laya.Handler[] = this._msgHandlerMap[msgType.minName];
                if (handles != null) {
                    for (const handle of handles) {
                        try {
                            handle.runWith(msg);
                        } catch (error) {
                            ErrorReportManager.ins().reportError(error);
                        }
                    }
                } else {
                    console.warn("未处理消息", msgName)
                }
            } catch (error) {
                console.warn("消息处理异常！！！！  ", msgName);
                if (DeviceUtils.ins().isDevelop()) {
                    throw error;
                }
            }
        }
    }

    public init(): void {
        console.log("GaryTest   GameMessageFactory   init");
        let msgDelg: asgard.utils.SimpleDelegate = new asgard.utils.SimpleDelegate(cmd.core_thin_pb, cmd.core_thin_pb.decode);
        this.messageMap[1] = msgDelg;
        let msgProcessDelg: asgard.utils.SimpleDelegate = new asgard.utils.SimpleDelegate(this, this.onHandleCorePb);
        this.handlerMap[1] = msgProcessDelg;
    }

    public registerMessage(msg: Function, caller: Object, method: Function) {
        var strClassName = msg.name;
        // console.log("GaryTest  GameMessageFactory    registMessage  :", strClassName);
        if (!this._msgHandlerMap[strClassName]) {
            this._msgHandlerMap[strClassName] = [];
        }
        if (this._msgHandlerMap[strClassName].findIndex(e => e.caller == caller) > -1) {
            console.error("repeat register:" + strClassName)
            return;
        }
        this._msgHandlerMap[strClassName].push(Laya.Handler.create(caller, method, null, false));
    }

    public unregisterMessage(msg: Function, caller: Object) {
        var strClassName = msg.name;
        // console.log("GaryTest  GameMessageFactory    unregistMessage  :", strClassName);
        if (!this._msgHandlerMap[strClassName]) {
            return;
        }
        this._msgHandlerMap[strClassName] = this._msgHandlerMap[strClassName].filter(e => e.caller != caller);
    }
}
