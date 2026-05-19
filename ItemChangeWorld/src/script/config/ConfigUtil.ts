
import PackRes from "../games/asset/PackRes";
import ByteBuf from "./bright/serialization/ByteBuf";
import { Tables } from "./schema";

export class ConfigUtil {
    public static Tables: Tables = null;

}
export class ConfigLoader {
    private static dataMap = new Map<string, Uint8Array>();
    public static jsonFileNames: string[] = [];
    private static _configPath: string = "config/configbin.bin";
    private static configPackRes: PackRes = null;
    public static loadConfigName(): void {
        ConfigLoader.jsonFileNames = Tables.getTableNames()
    }

    public static loadAllConfig(callback: Laya.Handler) {
        var t = Date.now();
        this.loadConfigName();
        Laya.loader.load(this._configPath, Laya.Handler.create(this, (res) => {
            if (!res) {
                callback && callback.runWith(false);
            } else {
                let packRes = PackRes.parse(res.data, this._configPath);
                ConfigLoader.configPackRes = packRes;
                ConfigUtil.Tables = new Tables(this.getFileData);
                callback && callback.runWith(true);
            }
        }), null, Laya.Loader.BUFFER, 0, true);
    }

    private static getFileData(fileName: string): ByteBuf {
        let data = ConfigLoader.configPackRes.getRes("config/" + fileName);
        if (data instanceof ArrayBuffer) {
            return new ByteBuf(new Uint8Array(data));
        }
        return null;
    }
}
