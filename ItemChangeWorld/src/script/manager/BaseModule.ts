
import { IShareQueryBase } from "../module/ad/enum/IShareQuery";
import GameMessageFactory from "../net/GameMessageFactory";
import { ModuleManager } from "./ModuleManager";

/**
 * 模块基类
 */
export abstract class BaseModule {
    constructor() {
        ModuleManager.moduleArray.push(this);
    }
    /**
     * 初始化
     */
    abstract onInit();
    /**
     * 注册界面跳转
     * 只允许注册带唯一id的一级界面，禁止注册二级界面
     */
    abstract onRegisterView();
    /**
     * 登录完成通知，并附带少量登录数据
     * 请注意，大部分数据后台会放入到onAfterLogin期间收到的包内，onLogin期间请勿重复拉取信息
     */
    abstract onLogin(toc: cmd.client_login_toc);
    /**
     * 登录完成后通知，附带大量数据
     */
    abstract onAfterLogin(s2c: cmd.player_data_syn_s2c);

    /**
     * 跨天时触发
     */
    abstract onCrossDay(s2c: cmd.player_refresh_data_syn_s2c);

    /**
     * 分享
     * @param query 分享参数
     */
    onShare(query: IShareQueryBase) {
    }
    /**
     * 注册协议回调
     * @param msg proto目标协议
     * @param method 自处理回调
     */
    registerMessage(msg: Function, method: Function) {
        GameMessageFactory.ins().registerMessage(msg, this, method);
    }
}