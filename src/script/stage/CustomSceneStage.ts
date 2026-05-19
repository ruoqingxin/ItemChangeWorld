import GameConst from "../const/GameConst";
import { ResLoader } from "../games/asset/ResLoader";
import { StageEnum } from "./StageEnum";

/**
 * 自定义场景，可以给一些需要加载场景的子玩法使用
 */
export default class CustomSceneStage extends asgard.stage.BaseStage {
    /**对局场景 */
    private _gameScene: Laya.Scene = null;
    private _gameSceneScript3D: CustomSceneScript = null;

    private static _scenePath: string = "";
    private static _sceneScript: new () => CustomSceneScript = null;
    private static _preloadAssetsCallback: () => string[] = null;

    constructor() {
        super(GameConst.appName, StageEnum.STAGE_CUSTOM_SCENE);
    }

    /**
     * 设置自定义场景
     * @param scenePath 场景路径
     * @param preloadAssetsCallback 预加载资源回调
     * @param sceneScript 场景脚本
     */
    public static setCustomScene(scenePath: string, preloadAssetsCallback: () => string[], sceneScript: new () => CustomSceneScript) {
        this._scenePath = scenePath;
        this._preloadAssetsCallback = preloadAssetsCallback;
        this._sceneScript = sceneScript;
    }

    public onEnter(): void {
        // UIManager.ins().openForm(UILoadingView);
        const assets = CustomSceneStage._preloadAssetsCallback();
        assets.push(CustomSceneStage._scenePath);
        ResLoader.beginAssetRequest(ResLoader.createAssetsRequest(assets), this, () => {
            this._onSceneLoaded();
        });
    }

    private _onSceneLoaded() {
        const asset = ResLoader.getAsset(CustomSceneStage._scenePath);
        let scene = asset.prefab.create() as Laya.Scene;
        scene.open();

        this._gameScene = scene;
        this._gameSceneScript3D = this._gameScene.scene3D.addComponent(CustomSceneStage._sceneScript);
    }

    public onExit(): void {
        //存储对局信息 给 全局用
        //UIManager.ins().closeForm(UILoadingView);

        if (this._gameSceneScript3D) {
            this._gameSceneScript3D.onLeaveStage();
            this._gameSceneScript3D.destroy();
            this._gameSceneScript3D = null;
        }

        if (this._gameScene != null) {
            this._gameScene.destroy();
            this._gameScene = null;
        }
    }
}
export abstract class CustomSceneScript extends Laya.Script {
    public abstract onLeaveStage(): void;
}