import { Asset } from "./Asset";
import { ResInfo } from "./ResInfo";
export class AssetRequest {
    /**
     * private
     */
    _resInfos: ResInfo[] = [];

    /**
     * 加载完成后的第一个错误信息，加载成功则 = null
     */
    error: string = null;

    /**
     * 如果赋值为true，本次加载资源都将被自动锁定不卸载
     */
    autoLockRes: boolean;
    public _onProgress: (progress: number) => void = null;
    public _caller: (request: AssetRequest) => void = null;
    public _method: (request: AssetRequest) => void = null;

    private _mainAsset: Asset;
    /**
     * 当前加载后得到的第一个资源
     */
    public get mainAsset() {
        return this._mainAsset;
    }

    /**
     * 内部使用
     */
    public _onCompleteCall() {
        if (this._caller && this._method) {
            this._method.apply(this._caller, [this]);
        }
    }

    /**
     * 内部使用
     */
    public _addResInfo(resInfo: ResInfo) {
        this._resInfos.push(resInfo);
    }

    /**
     * 内部使用
     */
    public _setMainAsset(asset: Asset) {
        this._mainAsset = asset;
    }

    /**
     * 放弃当前请求
     */
    public abort() {
        this._caller = null;
        this._method = null;
    }
}