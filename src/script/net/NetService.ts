import GameConst from "../const/GameConst";
import DeviceUtils from "../utils/DeviceUtils";
import { GameCmd } from "./Protoid";


export class NetMessageType {
    public cmd: number;
    public module: number;
    public className: string;
    public minName: string;
    public tostring(): string {
        return "module:" + this.module + ",cmd:" + this.cmd;
    }
}

export default class NetService {
    static netSession: asgard.net.NetSession;
    static messageTable: any = {}

    static isHide: boolean = false;
    static msgArr: any = [];

    public static get MessageTable() {
        return this.messageTable;
    }

    public static Init() {
        this.messageTable = {};
        for (const key in GameCmd) {
            var muduleEnum: any = key;
            if (muduleEnum == "ModuleId") {
                continue;
            }
            const map = new Map<number, string>();
            //忽略单行类型错误警告  // @ts-nocheck  忽略全文
            //@ts-ignore
            for (const key in GameCmd[muduleEnum]) {
                var keyToAny: any = key;
                if (!isNaN(keyToAny)) {
                    var messgage = new NetMessageType();
                    messgage.cmd = Number(key);
                    messgage.module = Number.parseInt(GameCmd.ModuleId[muduleEnum]);
                    //@ts-ignore
                    messgage.className = GameCmd[muduleEnum][key];
                    //console.log(messgage.className)
                    // console.log("GaryTest  messgage.className   " +messgage.className);
                    if (!cmd[messgage.className]) {
                        // console.error("can not find className: " + messgage.className);
                        continue;
                    }
                    messgage.minName = cmd[messgage.className].name;
                    // console.log("GaryTest  Netservice   " + messgage.tostring());
                    // console.log("GaryTest  Netservice   " + messgage.className);
                    this.messageTable[messgage.minName] = messgage;
                    this.messageTable[messgage.className] = messgage;
                    this.messageTable[messgage.tostring()] = messgage;
                }
                else if (DeviceUtils.ins().isDevelop()) {
                    const numKey = GameCmd[muduleEnum][key];
                    if (map.has(numKey)) {
                        console.error("协议重复 " + key + " and " + map.get(numKey));
                    }
                    else {
                        map.set(numKey, key);
                    }
                }
            }
        }
    }


    static PlatformOnShow() {
        console.log("切回前台判断 网络情况 ", NetService.heartTime, NetService.isConnect());
        if (NetService.heartTime != 0) {
            //先前连接成功
            if (!NetService.isConnect()) {
                NetService.heartTime = 0;
                NetService.onConnectClose();
            }
        }
    }

    public static connet(url: string): void {
        if (!asgard.net.NetManager.IsConnected(GameConst.appName)) {
            this.netSession = asgard.net.NetManager.tryConnectByUrl(GameConst.appName, url, this, this.onConnectSuccess);
            asgard.net.NetManager.tryClose(GameConst.appName, this, this.onConnectClose);
            asgard.net.NetManager.tryError(GameConst.appName, this, this.onConnectError);
        }
    }

    public static isConnect(): boolean {
        return asgard.net.NetManager.IsConnected(GameConst.appName);
    }

    public static send(msg: any): void {
        if (this.isHide) {
            this.msgArr.push(msg);
            return;
        }

        var msgkey = msg["constructor"].name;
        var messageType: NetMessageType = this.messageTable[msgkey];
        if (messageType == null) {
            console.error("Protoid类找不到协议" + msgkey + msg);
            return;
        }
        const msgName = messageType.className;

        let core: cmd.core_thin_pb = new cmd.core_thin_pb();
        if (messageType.cmd == 0 || messageType.module == 0) {
            console.error(msg);
            return;
        }

        //断线情况 send消息存储
        if (!this.isConnect()) {
            console.log("断线情况 send消息存储  == ", messageType.className)
            if (messageType.className != "client_heartbeat_c2s") {
                this.msgArr.push(msg);
                this.reconnect();
            }
            return;
        }

        core.name = messageType.cmd;
        core.module = messageType.module;
        core.msg = cmd[messageType.className].encode(msg, null).finish();

        let buffer = cmd.core_thin_pb.encode(core, null).finish();
        if (buffer.length / 1024 >= 64) {

            // let url = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=98bd73c5-e259-45ec-805e-277d6652641f";
            // CommonFun.sendWeWorkMsg(url, "发送网络数据超出 " + buffer.length + " core.module " + core.module + " core.cmd " + messageType.cmd);
            // return buffer.length;
        }

        asgard.net.NetManager.sendMessage(GameConst.appName, 0, buffer);

        if (DeviceUtils.ins().isDevelop() && (DeviceUtils.ins().isDevelop() || !DeviceUtils.ins().isMiniGame && (Laya.Browser.onSafari))) {

            if (msgName != "client_heartbeat_tos"
                && msgName != "g_cue_pos_syn_c2s"
                && msgName != "g_cue_power_dir_syn_c2s"
            ) {
                let date = new Date();
                console.warn("发送消息:====" + `{${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}:${date.getTime() % 1000}}` + msgName + " length:" + buffer.length + JSON.stringify(msg));
            }
        }
    }

    private static onConnectSuccess(): void {
        // GameConst.SetTip("服务器连接成功...");
        console.log("网络 服务器连接成功");
        GameConst.IS_TOKEN_ERROR = false;
        //UIManager.ins().closeForm(UIReconnectView);
        const msg = new cmd.client_connect_tos();
        this.send(msg);
        this.stopHeartBeat();
        Laya.timer.loop(5000, this, this.sendHeartBeat);
        Laya.timer.once(2000, this, () => {
            this.sendHeartBeat();
        });
    }

    public static ClearMsgArr() {
        this.msgArr = [];
    }

    /**登录成功判断是否有缓存待发送消息 */
    public static OnLoginSuccess() {
        for (let msg of this.msgArr) {
            this.send(msg);
        }
        this.msgArr = [];
    }

    public static heartTime: number;

    static heartbeatcmd: cmd.client_heartbeat_tos = new cmd.client_heartbeat_tos();
    public static sendHeartBeat() {
        // console.log("=====sendHeartBeat======", Laya.Browser.now(), PlayerData.ins().playerId);
        if (GameConst.IS_TOKEN_ERROR) return;
        this.heartbeatcmd.time_ms = Laya.Browser.now();//new Date().getTime();
        if (asgard.net.NetManager.IsConnected(GameConst.appName)) {
            this.send(this.heartbeatcmd);
        } else {
            this.stopHeartBeat();
            this.reconnect();
        }
    }

    public static onConnectError(res: any): void {
        console.log("网络 连接错误");
        this.tryReconnect(0);
    }

    public static onConnectClose(): void {
        console.log("网络 连接被关闭");
        this.tryReconnect(30);
    }

    public static reconnect() {
        console.log("网络 重新连接");
        this.tryReconnect(30);
    }

    /**
     * 停止心跳包
     */
    static stopHeartBeat() {
        Laya.timer.clearAll(this);
    }

    /**
     * 主动关闭网络断开心跳 防止 关闭网络没回调情况
     */
    public static closeNet() {
        asgard.net.NetManager.close(GameConst.appName);
        // UIManager.ins().closeForm(UIReconnectView);
        this.stopHeartBeat();
    }

    /**
     * 尝试触发重连逻辑
     * @param seconds 自动秒数 0 = 手动
     */
    private static tryReconnect(seconds: number) {
        this.heartTime = 0;
        this.stopHeartBeat();

        if (GameConst.IS_BAN_ROLE || GameConst.IS_REPEAT_LOGIN || GameConst.IS_NEED_RECONNECT) {
            return;
        }
        // if (!this.isConnect() && !UIManager.ins().getForm(UIReconnectView)) {
        //     asgard.net.NetManager.close(GameConst.appName);
        //    //UIManager.ins().openForm(UIReconnectView, seconds);
        // }
    }
}
