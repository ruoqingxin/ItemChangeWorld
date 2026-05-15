import { BaseClass } from "src/games/common/BaseClass";
import GameConst from "../const/GameConst";
import { RedDotManager } from "src/games/reddot/RedDotManager";
import { ModuleManager } from "../manager/ModuleManager";
import NetService from "../net/NetService";
import GameMessageFactory from "../net/GameMessageFactory";

export default class GameMain extends BaseClass {

    Init() {
        ModuleManager.ins().init();

        NetService.Init();
        asgard.message.MessageDispatcher.init(GameMessageFactory.ins());
        asgard.events.EventsDispatcher.init(GameConst.appName);
        Laya.timer.frameLoop(1, this, this.onUpdate);

        //  ModuleManager.ins().loginModule.connetServer();
    }

    private onUpdate(): void {
        let delta: number = Laya.timer.delta;//*两帧之间的时间间隔,单位毫秒。
        let time: number = Laya.timer.currTimer;//当前时间   

        asgard.stage.StageManager.onFrame(time, delta);
        RedDotManager.ins().onUpdate();
    }
}