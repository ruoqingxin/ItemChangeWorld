import GameConst from "../const/GameConst";
import { StageEnum } from "./StageEnum";
import { AppConfig } from "../AppConfig";
import { StringUtils } from "../utils/StringUtils";
import { ConfigLoader } from "../config/ConfigUtil";
import GameMain from "../start/GameMain";
import { UIManager } from "../games/ui/UIManager";
import { UIResDepConfig } from "../games/asset/UIResDepConfig";
import { U3DResDepConfig } from "../games/asset/U3DResDepConfig";
import { ResLoader } from "../games/asset/ResLoader";

export class LoadingStage extends asgard.stage.BaseStage {
    private _loadFlowStartTime: number = 0;
    private _loadStageStartTimeMap: Map<string, number> = new Map();
    private _loadStageDurationMap: Map<string, number> = new Map();


    constructor() {
        super(GameConst.appName, StageEnum.STAGE_LODING);
    }


    public onEnter(): void {
        this.resetLoadCostRecord();
        this.markStageStart("total");
        this.beginLogin();
        this.beginLoad();
    }

    onExit(): void {
    }

    beginLogin() {
        asgard.events.EventsDispatcher.init(GameConst.appName);
        UIManager.ins().init();
    }

    beginLoad() {
        this.markStageStart("loadConfig");
        this.loadConfig();
    }

    loadConfig() {
        if (!StringUtils.isNullOrEmpty(AppConfig.url)) {
            // 打包后的平台需要根据版本号动态获取配置
            this.startLoadConfig();
        }
        else {
            this.markStageEnd("loadConfig");
            this.onLoadFileConfigEnd();
        }
    }

    /**
     * 加载远程配置
     */
    private startLoadConfig() {
        //Reporter.SendEvent('start_01', "loadConfig");
        this.loadVersionInfoByUrl(AppConfig.url, `${AppConfig.id}`, (info) => {
            if (info.is_test !== undefined && !StringUtils.isNullOrEmpty(info.url)) {
                AppConfig.url = info.url;
                //先走打包机本地test_{id}.json
                this.loadVersionInfoByUrl(info.url, `test_${AppConfig.id}`, (realInfo) => {
                    console.log(`[startLoadConfig] 二次拉取真实配置: url=${info.url}, gameId=test_${AppConfig.id}, is_test=${realInfo.is_test}`);
                    //test_{id}.json 配置走正式 再拉取正式
                    if (!realInfo.is_test) {
                        this.loadVersionInfoByUrl(info.url, `${AppConfig.id}`, (normalInfo) => {
                            console.log(`[startLoadConfig] 三次拉取真实配置: url=${info.url}, gameId=test_${AppConfig.id}, is_test=${normalInfo.is_test}`);
                            this.applyRemoteVersionInfo(normalInfo);
                        }, null);
                    } else {
                        this.applyRemoteVersionInfo(realInfo);
                    }
                }, null);
            } else {
                this.applyRemoteVersionInfo(info);
            }
        }, () => {
            Laya.timer.once(1000, this, this.startLoadConfig);
            //Reporter.SendEvent('error_01', "load_configjson");
            console.log("startLoadConfig   error");
        });
    }

    private loadVersionInfoByUrl(
        baseUrl: string,
        gameId: string,
        onSuccess: (info: {
            version: string;
            buildNumber: number,
            wsAddress: string,
            fileconfig: string,
            is_sandbox: boolean,
            url: string,
            is_test?: boolean,
            force_update: boolean
        }) => void,
        onError: () => void
    ) {
        const url: string = `${baseUrl}/games/${gameId}.json?v=${Date.now()}`;
        Laya.loader.load(url, Laya.Handler.create(this, (data) => {
            if (!data || !data.data || data.data.length <= 0) {
                onError();
                return;
            }

            const verList: {
                version: string;
                buildNumber: number,
                wsAddress: string,
                fileconfig: string,
                is_sandbox: boolean,
                url: string,
                is_test?: boolean,
                force_update: boolean
            }[] = data.data;
            let info = verList.find(e => e.version == AppConfig.version);
            if (!info) {
                // 如果找不到匹配版本，则使用最新版本，并开启强制更新
                info = verList[0];
                AppConfig.force_update = true;
            }
            else {
                AppConfig.force_update = info.force_update ?? false;
            }
            onSuccess(info);
        }), null, Laya.Loader.JSON, 0, false, null, true);
    }

    private applyRemoteVersionInfo(info: {
        version: string;
        buildNumber: number,
        wsAddress: string,
        fileconfig: string,
        is_sandbox: boolean,
        url: string,
        is_test?: boolean,
        force_update: boolean
    }) {
        this.markStageEnd("loadConfig");
        AppConfig.force_update = info.force_update ?? false;
        AppConfig.is_sandbox = info.is_sandbox ?? false;
        if (info.wsAddress) {
            AppConfig.wsAddress = info.wsAddress;
        }
        AppConfig.buildNumber = info.buildNumber;

        //Reporter.SendEvent('start_02', "loadVersion");
        console.log("version", info);
        // GamePlatform.checkUpdate();
        console.log("fileconfig update:" + info.fileconfig);
        this.loadFileConfig(info.fileconfig);
    }

    /**
     * 加载fileconfig配置
     */
    private loadFileConfig(fileconfig: string) {
        this.markStageStart("fileConfig");
        //Reporter.SendEvent('start_02', "loadFileConfig");
        let url: string = `${AppConfig.url}/${AppConfig.urlSub}/${fileconfig}`;
        Laya.loader.load(url, Laya.Handler.create(this, (data) => {
            if (data) {
                // 如果还有首包资源在内，需要考虑文件夹过滤
                // 设置cdn资源过滤
                const cdnArr = [
                    "internal",
                    "chessGame",
                    "config",
                    "scene",
                    "model2d",
                    "sound",
                    "ui",
                    "u3d",
                    "video",
                    "shader"
                ];
                for (const dic of cdnArr) {
                    Laya.URL.basePaths[dic] = AppConfig.url + "/" + AppConfig.urlSub;
                }
                Laya.loader._parseFileConfig(data.data);
                this.onLoadFileConfigEnd();
            }
            else {
                Laya.timer.once(1000, this, this.loadFileConfig);
                //Reporter.SendEvent('error_02', "loadFileConfig");
                console.log("loadFileConfig   error");
            }
        }), null, Laya.Loader.JSON, 0, false, null, true);
    }

    /**
     * 加载fileconfig完成回调
     */
    private onLoadFileConfigEnd() {
        this.markStageEnd("fileConfig");
        this.markStageStart("configTable");
        let doneCount = 0;
        const onDepConfigLoaded = () => {
            doneCount++;
            if (doneCount >= 2) {
                ConfigLoader.loadAllConfig(Laya.Handler.create(this, () => {
                    this.markStageEnd("configTable");
                    this.preloadRes();
                }));
            }
        };

        UIResDepConfig.load(this, onDepConfigLoaded);
        U3DResDepConfig.load(this, onDepConfigLoaded);
    }

    /**
     * 预加载资源
     */
    private preloadRes() {
        this.markStageStart("preloadRes");
        // 预加载一些资源
        const assetRequest = ResLoader.createAssetsRequest([
            //UIReconnectView.PATH,
            //UILoadingView.PATH,
            //UIRotateLoadingTipsView.PATH,
            //UILobbyView.PATH,
            //UIMaterialColorUtils.shader_path,
            // "config/shader.json"
        ])
        // 不对本次加载的资源进行卸载
        assetRequest.autoLockRes = true;
        ResLoader.beginAssetRequest(assetRequest, this, () => {
            if (assetRequest.error) {
                // 保证加载完成
                Laya.timer.once(100, this, this.preloadRes);
            }
            else {
                this.markStageEnd("preloadRes");
                // Laya.loader.load("config/shader.json").then((res) => {
                //     const t = Date.now();
                //     let shaderVariants = new Laya.ShaderVariantCollection(res.data);
                //     shaderVariants.compileAll();
                //     console.log("compile shader time: " + (Date.now() - t));
                // });
                //UIManager.ins().cacheForm(UILobbyView);
                //UIManager.ins().cacheForm(UILoadingView);
                // UIManager.ins().cacheForm(UIRotateLoadingTipsView);
                UIManager.ins().isReady = true;
                this.onLoadEnd();
            }
        });
    }


    private onLoadEnd() {
        this.markStageEnd("total");
        this.logLoadCostSummary();
        // 加载资源完成后在进行继续加载
        Laya.timer.once(100, this, () => {
            // let loginView = UIManager.ins().getForm(UILoginView);
            // if (loginView && !loginView.progressConfigLoad) {
            //     loginView.progressConfigLoad = true;
            //    loginView.simulateLoadingProgress(100, 1);
            // }
            // 初始化主系统
            this.doGameMainInit();

        });
        console.log("onLoadEnd");
    }

    private doGameMainInit() {
        GameMain.ins().Init();
    }

    private resetLoadCostRecord() {
        this._loadFlowStartTime = Date.now();
        this._loadStageStartTimeMap.clear();
        this._loadStageDurationMap.clear();
    }

    private markStageStart(stageName: string) {
        if (!this._loadStageStartTimeMap.has(stageName)) {
            this._loadStageStartTimeMap.set(stageName, Date.now());
        }
    }

    private markStageEnd(stageName: string) {
        const startTime = this._loadStageStartTimeMap.get(stageName);
        if (startTime === undefined) {
            return;
        }
        const duration = Date.now() - startTime;
        this._loadStageDurationMap.set(stageName, duration);
        this._loadStageStartTimeMap.delete(stageName);
        console.log(`[LoadingStage] 阶段耗时 ${stageName}: ${duration}ms`);
    }

    private logLoadCostSummary() {
        const totalDuration = this._loadStageDurationMap.get("total") ?? (Date.now() - this._loadFlowStartTime);
        const stageOrder = ["loadConfig", "fileConfig", "configTable", "preloadRes"];
        const stageText = stageOrder
            .filter((stageName) => this._loadStageDurationMap.has(stageName))
            .map((stageName) => `${stageName}=${this._loadStageDurationMap.get(stageName)}ms`)
            .join(", ");
        console.log(`[LoadingStage] 加载总耗时: ${totalDuration}ms${stageText ? `, 分阶段: ${stageText}` : ""}`);
    }
}