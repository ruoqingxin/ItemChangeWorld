import { AppConfig } from "./AppConfig";
import GameConst from "./const/GameConst";
import EventEngine from "./games/eventSystem/EventEngine";
import { SoundManager } from "./games/sound/SoundManager";
import { SoundDef } from "./sound/SoundDef";
import { StageEnum } from "./stage/StageEnum";
import StageFactory from "./stage/StageFactory";
import DeviceUtils from "./utils/DeviceUtils";


export class GameStart {
    constructor() {
        // if (Laya.LayaEnv.isEditor && DeviceUtils.ins().isDevelop()) {
        //     Laya.loader.load("logincfg.json", Laya.Handler.create(this, (res: Laya.TextResource) => {
        //         if (!res) {
        //             return;
        //         }
        //         const cfg = res.data;
        //         Laya.LocalStorage.setItem("ws", cfg.server);
        //         Laya.LocalStorage.setItem("name", cfg.account);
        //     }))
        // }

        // 关闭物理更新
        Laya.Stat.enablePhysicsUpdate = false;
        // 关闭多点触碰
        Laya.InputManager.multiTouchEnabled = false;
        // 设置顶部padding
        //ElementMapper.TOP_PADDING = 55;

        // 移除console日志
        //ConsoleLogger.instance.initialize(DeviceUtils.ins().isDevelop(), false);

        console.log("Laya.LayaEnv.isEditor:" + Laya.LayaEnv.isEditor);
        //console.log("DeviceUtils.ins().isDevelop():" + DeviceUtils.ins().isDevelop());
        this.hideSplashScreen();
        //installCpuParticle3DHook();

        //Hook.init();
        this.analyseUrl();

        Laya.alertGlobalError(DeviceUtils.ins().isDevelop());
        Laya.Shader3D.debugMode = DeviceUtils.ins().isDevelop();

        Laya.loader.maxLoader = 25;
        Laya.Resource.DEBUG = DeviceUtils.ins().isDevelop();
        // if (!DeviceUtils.ins().isDevelop() && window["conchConfig"]) {
        //     //值为0：表示关闭所有日志输出
        //     //值为1：表示只有Fatal日志输出
        //     //值为2：表示只有Fatal和Error日志输出
        //     //值为n：表示只有LogLevel <= n的日志输出
        //     window["conchConfig"].setLogLevel(2);
        // }

        // GamePlatform.initialize();

        SoundManager.COMMON_CLICK_SOUND = SoundDef.SYS_BTNCLICK;
        SoundManager.COMMON_CLOSE_SOUND = SoundDef.CLOSE;
        EventEngine.appName = GameConst.appName;

        asgard.stage.StageManager.init(new StageFactory());
        asgard.stage.StageManager.enterStage(GameConst.appName, StageEnum.STAGE_LOBBY);
    }

    /**
     * 隐藏native加载界面
     */
    hideSplashScreen(): void {
        const hideSplashScreen = window['hideSplashScreen'];
        if (hideSplashScreen) {
            window['hideSplashScreen'] = () => { };
            Laya.timer.once(500, this, () => {
                hideSplashScreen();
                console.log("hideSplashScreen");
            });
        }
    }



    /**浏览器解析url */
    private analyseUrl() {
        if (DeviceUtils.ins().isDevelop()) {
            let _stat = DeviceUtils.ins().getQueryVariable("stat");
            if (_stat === `1`)
                Laya.Stat.show();
        }
    }
}

// 加载配置
if (window["appConfig"]) {
    const appConfig = window["appConfig"];
    AppConfig.id = appConfig.id;
    AppConfig.version = appConfig.version;
    AppConfig.buildNumber = appConfig.buildNumber;
    AppConfig.branch = appConfig.branch;
    AppConfig.projectCode = appConfig.projectCode;
    AppConfig.buildType = appConfig.buildType;
    AppConfig.url = appConfig.url;
    AppConfig.urlSub = appConfig.urlSub;
    AppConfig.defines = appConfig.defines ? appConfig.defines.split(';') : [];
    console.log(JSON.stringify(appConfig));
}
// 子包入口注册，用于外部主包访问
window["GameStart"] = GameStart;