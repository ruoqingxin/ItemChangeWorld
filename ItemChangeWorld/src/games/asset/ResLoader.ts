import { AssetRequest } from "./AssetRequest";
import { Asset } from "./Asset";
import { ResInfo } from "./ResInfo";
import { StringUtils } from "src/script/utils/StringUtils";
import { UIResDepConfig } from "./UIResDepConfig";
import { U3DResDepConfig } from "./U3DResDepConfig";
/**
 * 资源加载与内存管理
 */
export class ResLoader {
    private static _infoDic: { [key: string]: ResInfo } = {};
    private static _assets: { [key: string]: Asset } = {};
    /**
     * 上一次内存清理时间
     */
    private static _lastClearTimeAt: number = 0;

    private static _getResInfo(url: string) {
        let info = this._infoDic[url];
        if (!info) {
            info = new ResInfo();
            info.url = url;
            info.preloaded = Laya.loader.getRes(url) != null;
            this._infoDic[url] = info;
        }
        return info;
    }
    /**
     * 创建一个资源加载请求
     * @param url 请求url
     * @returns 请求对象
     */
    public static createAssetRequest(url: string | { path: string, type: string }): AssetRequest {
        let request = new AssetRequest();
        let info = this._getResInfo(typeof url == "string" ? url : url.path);
        if (typeof url == "object" && url.type) {
            info.type = url.type;
        }
        request._addResInfo(info);
        return request;
    }
    /**
     * 创建多个资源加载请求
     * @param urls 资源列表
     * @returns 请求对象
     */
    public static createAssetsRequest(urls: (string | { path: string, type: string })[]): AssetRequest {
        let request = new AssetRequest();
        for (let url of urls) {
            if (!url) {
                continue;
            }
            let info = this._getResInfo(typeof url == "string" ? url : url.path);
            if (typeof url == "object" && url.type) {
                info.type = url.type;
            }
            request._addResInfo(info);
        }
        return request;
    }
    /**
     * 开始资源加载请求
     * @param request 请求对象
     * @param caller 执行域(this)。
     * @param method 加载完成回调函数
     */
    public static beginAssetRequest(request: AssetRequest, caller: any, method: (request: AssetRequest) => void) {
        this._appendPackedDependencies(request);
        request._caller = caller;
        // 包装回调，如果是 UI 资源则自动加载关联资源
        request._method = async (req: AssetRequest) => {
            // 如果包含 UI 资源，先加载关联资源（检查全部请求资源）
            if (!req.error) {
                const uiPaths: string[] = [];
                for (const info of req._resInfos) {
                    if (info.type == Laya.Loader.HIERARCHY && info.url.startsWith("ui/") && !UIResDepConfig.has(info.url)) {
                        uiPaths.push(info.url);
                    }
                }
                if (uiPaths.length > 0) {
                    const depLists = await Promise.all(uiPaths.map(uiPath => this._collectUIDependencies(uiPath)));
                    const depSet = new Set<string>();
                    for (const list of depLists) {
                        for (const item of list) {
                            depSet.add(item);
                        }
                    }
                    if (depSet.size > 0) {
                        // 创建依赖资源请求并加载
                        const depRequest = this.createAssetsRequest(Array.from(depSet));
                        depRequest.autoLockRes = req.autoLockRes;
                        await new Promise<void>((resolve) => {
                            this.beginAssetRequest(depRequest, this, (depReq: AssetRequest) => {
                                if (depReq.error) {
                                    req.error = depReq.error;
                                }
                                resolve();
                            });
                        });
                    }
                }
            }
            // 调用原始回调
            method && method.apply(caller, [req]);
        };
        this._loadGroup(request, request._resInfos);
    }

    private static _appendPackedDependencies(request: AssetRequest) {
        let hasPackedHierarchy = false;
        for (const info of request._resInfos) {
            if (this._canResolvePackedDeps(info.url)) {
                hasPackedHierarchy = true;
                break;
            }
        }
        if (!hasPackedHierarchy) {
            return;
        }

        const urlSet = new Set<string>();
        const queue: string[] = [];

        for (const info of request._resInfos) {
            urlSet.add(info.url);
            if (this._canResolvePackedDeps(info.url)) {
                queue.push(info.url);
            }
        }
        if (queue.length == 0) {
            return;
        }

        const visited = new Set<string>();

        while (queue.length > 0) {
            const path = queue.shift();
            if (!path) {
                continue;
            }
            if (visited.has(path)) {
                continue;
            }
            visited.add(path);

            const depList = this._getPackedDepList(path);
            for (const dep of depList) {
                if (urlSet.has(dep)) {
                    continue;
                }

                urlSet.add(dep);
                const info = this._getResInfo(dep);
                if (path.startsWith("u3d/") && (
                    path.endsWith(".png") ||
                    path.endsWith(".jpg")
                )) {
                    info.type = Laya.Loader.TEXTURE2D;
                }
                request._addResInfo(info);
                if (this._isHierarchyPath(dep) && this._isPackedDepRootPath(dep)) {
                    queue.push(dep);
                }
            }
        }
    }

    private static _canResolvePackedDeps(url: string): boolean {
        return url.endsWith(".lh") && this._isPackedDepRootPath(url);
    }

    private static _isPackedDepRootPath(url: string): boolean {
        return url.startsWith("ui/") || url.startsWith("u3d/");
    }

    private static _getPackedDepList(path: string): string[] {
        if (path.startsWith("ui/")) {
            return UIResDepConfig.getResolvedDeps(path);
        }
        if (path.startsWith("u3d/")) {
            return U3DResDepConfig.getResolvedDeps(path);
        }
        return [];
    }

    private static _isHierarchyPath(url: string): boolean {
        return url.endsWith(".lh")
            || url.endsWith(".ls")
            || url.endsWith(".scene")
            || url.endsWith(".prefab");
    }

    private static _loadGroup(request: AssetRequest, group: ResInfo[]) {
        let loadNum = 0;
        for (let resinfo of group) {
            if (!resinfo.loaded && !resinfo.preloaded) {
                loadNum++;
            }
        }
        if (loadNum > 0) {
            try {
                let list = [];
                for (let resinfo of group) {
                    if (!resinfo.loaded) {
                        list.push(resinfo);
                    }
                }
                Laya.loader.load(list, Laya.Handler.create(this, this._onLoadAssetRequestPre, [request]), request._onProgress);
            }
            catch (e) {
                console.error(e);
                request.error = "request create error " + e;
                this._onLoadAssetRequestPre(request);
            }
        }
        else {
            this._onLoadAssetRequestPre(request);
        }
    }

    private static _onLoadAssetRequestPre(request: AssetRequest) {
        for (let i = 0, len = request._resInfos.length; i < len; i++) {
            let info = request._resInfos[i];
            let asset = this.loadAsset(info);
            info.loaded = asset.loaded;
            if (asset.loaded && request.autoLockRes) {
                asset.autoCollect = false;
            }
            if (!request.mainAsset) {
                request._setMainAsset(asset);
            }
            if (!request.error && !info.loaded) {
                request.error = "res load failed " + info.getError();
            }
        }

        request._onCompleteCall();
    }

    /**
     * 收集 UI 资源的依赖资源列表
     * @param uiPath UI资源路径
     * @returns 依赖资源列表
     */
    private static async _collectUIDependencies(uiPath: string): Promise<string[]> {
        let asset = this.getAsset(uiPath);
        if (!asset) {
            return [];
        }
        asset.autoCollect = false;

        const depAssetList: string[] = [];
        const promiseList: Promise<string>[] = [];

        const findAllImages = (t: any) => {
            if (t._$type == "GImage") {
                const url: string = t.src;

                if (url.startsWith("res://")) {
                    let uuid = url.substring(6);
                    const promise = Laya.AssetDb.inst.UUID_to_URL_async(uuid);
                    promise.then(url2 => {
                        const atlas = Laya.AtlasInfoManager.getFileLoadPath(url2);
                        if (atlas != null) {
                            if (depAssetList.indexOf(atlas.url) == -1) {
                                depAssetList.push(atlas.url);
                            }
                        }
                        else {
                            if (depAssetList.indexOf(url2) == -1) {
                                depAssetList.push(url2);
                            }
                        }
                    });
                    promiseList.push(promise);
                }
                else if (!StringUtils.isNullOrEmpty(url)) {
                    const atlas = Laya.AtlasInfoManager.getFileLoadPath(url);
                    if (atlas != null) {
                        if (depAssetList.indexOf(atlas.url) == -1) {
                            depAssetList.push(atlas.url);
                        }
                    }
                    else {
                        if (depAssetList.indexOf(url) == -1) {
                            depAssetList.push(url);
                        }
                    }
                }
            }
            if (t._$child) {
                for (let i = 0, len = t._$child.length; i < len; i++) {
                    findAllImages(t._$child[i]);
                }
            }
        };

        findAllImages(asset.data);
        if (promiseList.length > 0) {
            await Promise.all(promiseList);
        }

        return depAssetList;
    }

    private static loadAsset(resinfo: ResInfo) {
        let url = resinfo.url;
        let asset = this._assets[url];
        if (!asset) {
            asset = new Asset();
            asset._path = url;
            asset._info = resinfo;
            this._assets[url] = asset;
        }
        if (!asset._loaded) {
            asset._onLoad();
        }
        return asset;
    }

    /**
     * 从加载列表中获取一个Asset对象
     * @param url 资源url
     * @returns Asset对象
     */
    public static getAsset(url: string) {
        let asset = this._assets[url];
        if (!asset || !asset._loaded) {
            return null;
        }
        return asset;
    }

    /**
     * 从加载列表中获取一个资源对象
     * @param url 资源url
     * @returns 资源对象
     */
    public static getAssetSource(url: string) {
        let asset = this._assets[url];
        if (!asset || !asset._loaded) {
            return null;
        }
        return asset._res;
    }

    /**
     * 内存清理
     * 最后一次使用时间距今 > clearTimeDelta 将会被回收
     * @param clearTimeDelta 清理旧资源时间间隔
     */
    public static clearMemory(clearTimeDelta: number = 1000) {
        const now = Laya.Browser.now();
        let unloadNum = 0;
        for (const key in this._assets) {
            const asset = this._assets[key];
            if (asset.autoCollect && now - asset.lastUseAtTime > clearTimeDelta && asset.linkCount == 0) {
                asset._onDestroy();
                delete this._assets[key];
                delete this._infoDic[key];
                unloadNum++;
                // console.log("clear res " + key);
            }
        }

        // 30秒间隔调用laya的gc
        if (unloadNum > 0 && now - this._lastClearTimeAt > 30000) {
            this._lastClearTimeAt = now;
            // console.log("gc");
            Laya.Scene.gc();
        }
    }

    /**
     * 请求一次http
     * @param url 请求url
     * @param callback 请求完成回调
     * @param postData post数据
     */
    public static beginHttpRequest(url: string, callback: (error: string, content: string) => void, postData?: string) {
        let workHttp: Laya.HttpRequest;
        let retryTimes = 0;
        let preFunc: Function = null;
        let requestFunc = () => {
            if (workHttp) {
                workHttp.offAll();
                workHttp = null;
                console.warn("request timeout:" + url + " times:" + retryTimes);
            }
            if (retryTimes >= 3) {
                Laya.timer.clearAll(preFunc);
                callback("request timeout " + url, null);
                return;
            }
            retryTimes++;
            try {
                workHttp = new Laya.HttpRequest();
                workHttp.once(Laya.Event.COMPLETE, this, (result) => {
                    Laya.timer.clearAll(preFunc);
                    try {
                        callback(null, result);
                    }
                    catch (e) {
                        console.error(e);
                    }
                });
                workHttp.once(Laya.Event.ERROR, this, (result) => {
                    Laya.timer.clearAll(preFunc);
                    try {
                        console.error("request failed:" + url + " error:" + String(result));
                        callback(String(result), null);
                    }
                    catch (e) {
                        console.error(e);
                    }
                });
                if (postData) {
                    let headers: string[];
                    if (postData.startsWith("{") || postData.startsWith("[")) {
                        headers = ["Content-Type", "application/json;charset=UTF-8"];
                    } else {
                        headers = ["Content-Type", "application/x-www-form-urlencoded;charset=UTF-8"];
                    }
                    workHttp.send(url, postData, 'post', 'text', headers);
                } else {
                    workHttp.send(url, null, 'get', 'text');
                }
            }
            catch (e) {
                Laya.timer.clearAll(preFunc);
                let reportLog = "";
                if (typeof (e) === "object") {
                    let o = e as { message: string, stack: string };
                    if (o.message) {
                        reportLog = o.message;
                    }
                    if (o.stack) {
                        reportLog += o.stack;
                    }
                    if (!reportLog) {
                        reportLog = e.toString();
                    }
                } else {
                    reportLog = String(e);
                }
                console.error("request failed:" + url + " catch error:" + reportLog);
                callback("catch error:" + reportLog, null);
            }
        };
        preFunc = requestFunc;
        Laya.timer.loop(15000, preFunc, preFunc);
        requestFunc();
    }
}