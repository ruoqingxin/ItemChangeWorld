
import GameConst from "../const/GameConst";
import { BaseClass } from "../games/common/BaseClass";
import { StageEnum } from "../stage/StageEnum";

export default class GameManager extends BaseClass {
    onLoginSuccess() {
        let stage = asgard.stage.StageManager.CurStage(GameConst.appName);
        if (!stage || stage.stageId == StageEnum.STAGE_LODING) {
            asgard.stage.StageManager.enterStage(GameConst.appName, StageEnum.STAGE_LOBBY);
        }
    }

}