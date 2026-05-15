/**
 * 子包加载器
 * 支持同步加载子包
 * 支持子包之间配置依赖关系
 * Example：
 *      const loader = new SubpackageLoader();
        loader.loadAll(["ttf", "jslib", "subscript"], { subscript: "jslib" });
    ttf与jslib子包会同步加载，而subscript子包会在jslib子包加载完成后才开始
 */
export class SubpackageLoader {
    private _loadMap: { [name: string]: boolean } = {};
    private _subpackages: string[] = [];
    private _depMap: { [key: string]: string };
    private _packageLoadedNum: number = 0;
    public get loaded() {
        return this._packageLoadedNum == this._subpackages.length;
    }
    /**
     * 请求加载子包列表
     * @param subpackages 子包数组
     * @param depMap 依赖关系字典
     */
    public loadAll(subpackages: string[], depMap: { [key: string]: string }) {
        this._subpackages = subpackages;
        this._depMap = depMap;
        console.log("subpackage num: " + subpackages.length);
        if (subpackages.length > 0) {
            this._packageLoadedNum = 0;
            for (let sub of subpackages) {
                this._loadOne(sub);
            }
        }
    }
    private _loadOne(sub: string) {
        // 如果依赖的子包未加载，则等待
        if (this._depMap[sub] && !this.isPackageLoaded(this._depMap[sub])) {
            Laya.timer.once(100, this, () => {
                this._loadOne(sub);
            });
            return;
        }
        console.log("request load sub:" + sub);
        Laya.loader.loadPackage(sub, null, null).then(() => {
            console.log("load sub end:" + sub);
            this._loadMap[sub] = true;
            this._packageLoadedNum++;
        }).catch(() => {
            console.log("load sub failed:" + sub + ", try later");
            Laya.timer.once(100, this, () => {
                this._loadOne(sub);
            });
        });
    }

    /**
     * 判断某个子包是否加载完毕
     * @param sub 子包名称
     * @returns 
     */
    public isPackageLoaded(sub: string) {
        if (this._subpackages.indexOf(sub) == -1) {
            return true;
        }
        return this._loadMap[sub];
    }
}