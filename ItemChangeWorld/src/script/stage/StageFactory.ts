import GameConst from "../const/GameConst";
import CustomSceneStage from "./CustomSceneStage";
import { LoadingStage } from "./LoadingStage";
import { LobbyStage } from "./LobbyStage";
import { StageEnum } from "./StageEnum";


export default class StageFactory implements asgard.stage.IStageFactory {
    public getAppName(): string {
        return GameConst.appName;
    }

    public getStage(stageid: number): asgard.stage.BaseStage {
        switch (stageid) {
            case StageEnum.STAGE_LODING:
                return new LoadingStage();
            case StageEnum.STAGE_LOBBY:
                return new LobbyStage();
            case StageEnum.STAGE_CUSTOM_SCENE:
                return new CustomSceneStage();
        }
        return null;
    }
}