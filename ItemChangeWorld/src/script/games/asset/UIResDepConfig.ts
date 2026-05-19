export class UIResDepConfig {
    public static readonly PATH: string = "ui/ui-deps.json";

    private static _loaded: boolean = false;
    private static _loading: boolean = false;
    private static _uiDepMap: { [key: string]: string[] } = {};

    public static load(caller: any, complete: () => void) {
        if (this._loaded) {
            if (complete) {
                complete.call(caller);
            }
            return;
        }

        if (this._loading) {
            Laya.timer.once(50, this, () => this.load(caller, complete));
            return;
        }

        this._loading = true;
        Laya.loader.load(this.PATH, Laya.Handler.create(this, (res) => {
            this._uiDepMap = (res && res.data) || {};
            this._loaded = true;
            this._loading = false;
            if (!res || !res.data) {
                console.warn("ui deps config missing: " + this.PATH);
            }
            if (complete) {
                complete.call(caller);
            }
        }), null, Laya.Loader.JSON, 0, false, null, true);
    }

    public static has(uiPath: string): boolean {
        return !!this._uiDepMap[uiPath];
    }

    public static getResolvedDeps(uiPath: string): string[] {
        const depSet = new Set<string>();
        const visitedUI = new Set<string>();

        const walk = (path: string) => {
            if (visitedUI.has(path)) {
                return;
            }
            visitedUI.add(path);

            const depList = this._uiDepMap[path];
            if (!depList || depList.length == 0) {
                return;
            }

            for (const dep of depList) {
                if (!dep) {
                    continue;
                }

                if (this._isHierarchy(dep)) {
                    depSet.add(dep);
                    if (dep.startsWith("ui/")) {
                        walk(dep);
                    }
                    continue;
                }

                depSet.add(this._toLoadPath(dep));
            }
        };

        walk(uiPath);
        depSet.delete(uiPath);
        return Array.from(depSet);
    }

    private static _isHierarchy(path: string): boolean {
        return path.endsWith(".lh")
            || path.endsWith(".ls")
            || path.endsWith(".scene")
            || path.endsWith(".prefab");
    }

    private static _toLoadPath(path: string): string {
        const atlas = Laya.AtlasInfoManager.getFileLoadPath(path);
        return atlas ? atlas.url : path;
    }
}
