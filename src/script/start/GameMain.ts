
import GameConst from "../const/GameConst";

import { BaseClass } from "../games/common/BaseClass";
import { RedDotManager } from "../games/reddot/RedDotManager";
import GameManager from "../manager/GameManager";


export default class GameMain extends BaseClass {

    Init() {
        asgard.events.EventsDispatcher.init(GameConst.appName);
        Laya.timer.frameLoop(1, this, this.onUpdate);

        GameManager.ins().enterGameplay();


    }

    private onUpdate(): void {
        let delta: number = Laya.timer.delta;//*两帧之间的时间间隔,单位毫秒。
        let time: number = Laya.timer.currTimer;//当前时间

        asgard.stage.StageManager.onFrame(time, delta);
        RedDotManager.ins().onUpdate();
    }
}
