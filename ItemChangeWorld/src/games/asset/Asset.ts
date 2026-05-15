import { ResInfo } from "./ResInfo";
/**
 * 资源内存对象
 */
export class Asset {
    public lastUseAtTime: number = 0;
    /**
     * 资源是否自动回收
     */
    public autoCollect: boolean = true;
    /**
     * 当前资源引用对象数量
     */
    public get linkCount() {
        let cnt = 0;
        for (const copy of this._usingCopys) {
            if (!copy.destroyed) {
                cnt++;
            }
        }
        return cnt;
    }
    /**
     * private
     */
    _path: string;
    /**
     * private
     */
    _info: ResInfo;
    /**
     * private
     */
    _refCount: number = 0;
    /**
     * private
     */
    _res: any;
    /**
     * private
     */
    _loaded: boolean = false;

    get data() {
        return (this._res as Laya.TextResource).data;
    }
    get prefab() {
        return (this._res as Laya.PrefabImpl);
    }
    /**
     * 缓存的预制体
     */
    private _cacheCopys: (Laya.Sprite | Laya.Sprite3D)[] = [];
    /**
     * 正在使用的预制体
     */
    private _usingCopys: (Laya.Sprite | Laya.Sprite3D)[] = [];
    private _len: number = 0;
    /**
     * 资源是否已经加载
     */
    public get loaded() {
        return this._loaded;
    }
    /**
     * private
     */
    _onLoad() {
        if (this._loaded) {
            return;
        }
        this._res = Laya.loader.getRes(this._path, this._info.type);
        this._loaded = this._res != null;
        if (this._loaded) {
            let res = (this._res as Laya.Resource);
            if (res._addReference) {
                res._addReference(1);
            }
        }
        this.lastUseAtTime = Laya.Browser.now();
    }
    /**
     * private
     */
    _onDestroy(): boolean {
        if (!this._loaded) {
            return;
        }
        if (this.linkCount > 0) {
            console.error("无法回收对象：" + this._path + " 因为该资源依然被引用", this._usingCopys);
            return false;
        }
        if (this._len > 0) {
            for (let i = 0; i < this._len; i++) {
                let obj = this._cacheCopys[i];
                obj.destroy();
                this._cacheCopys[i] = null;
            }
            this._cacheCopys.length = 0;
            this._len = 0;
        }
        // 这里只清理引用计数，资源本体的清理交给laya的gc
        let res = (this._res as Laya.Resource);
        if (res._removeReference) {
            res._removeReference(1);
        }
        this._res = null;

        this._loaded = false;
        return true;
    }

    /**
     * 创建一个资源副本
     * @returns 资源副本
     */
    public instantiate() {
        this.lastUseAtTime = Laya.Browser.now();
        this._refCount++;
        if (this._len > 0) {
            let prefab = this._cacheCopys[this._len - 1];
            this._cacheCopys[this._len - 1] = null;
            this._len--;
            this._usingCopys.push(prefab);
            return prefab;
        }
        else {
            let prefab = this._res.create();
            this._usingCopys.push(prefab);
            return prefab;
        }
    }

    public instantiate_back(obj: Laya.Sprite | Laya.Sprite3D) {
        // 判断是否归属于该资源
        const resIndex = this._usingCopys.indexOf(obj);
        if (resIndex == -1) {
            console.error("res error belong", obj);
            return;
        }
        this._usingCopys.splice(resIndex, 1);

        if (obj.parent) {
            obj.removeSelf();
        }
        this.lastUseAtTime = Laya.Browser.now();
        this._refCount--;
        this._cacheCopys[this._len] = obj;
        this._len++;
    }

    private _findEChild(_echild: any, checkMap: { [key: string]: any }) {
        for (let child of _echild) {
            checkMap[child._$id] = child;
            if (child._$child) {
                this._findEChild(child._$child, checkMap);
            }
        }
    }

    /**
     * 获取资源原始关联
     * @returns 原始关联
     */
    public getEMap(): { [key: string]: any } {
        let _emap = {};
        let child = this._res.data?._$child
        if (child) {
            this._findEChild(child, _emap);
        }
        return _emap;
    }
}