export class U3DResDepConfig {
    public static readonly PATH: string = "u3d/u3d-deps.json";

    private static _loaded: boolean = false;
    private static _loading: boolean = false;
    private static _depMap: { [key: string]: string[] } = {};

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
            this._depMap = (res && res.data) || {};
            this._loaded = true;
            this._loading = false;
            if (!res || !res.data) {
                console.warn("u3d deps config missing: " + this.PATH);
            }
            if (complete) {
                complete.call(caller);
            }
        }), null, Laya.Loader.JSON, 0, false, null, true);
    }

    public static has(path: string): boolean {
        return !!this._depMap[this._normalizePath(path)];
    }

    public static getResolvedDeps(path: string): string[] {
        const depSet = new Set<string>();
        const visited = new Set<string>();
        const normalizedPath = this._normalizePath(path);

        const walk = (targetPath: string) => {
            if (visited.has(targetPath)) {
                return;
            }
            visited.add(targetPath);

            const depList = this._depMap[targetPath];
            if (!depList || depList.length == 0) {
                return;
            }

            for (const dep of depList) {
                if (!dep) {
                    continue;
                }
                const normalizedDep = this._normalizePath(dep);
                depSet.add(normalizedDep);
                if (this._isHierarchy(normalizedDep) && this._depMap[normalizedDep]) {
                    walk(normalizedDep);
                }
            }
        };

        walk(normalizedPath);
        depSet.delete(normalizedPath);
        return Array.from(depSet);
    }

    private static _isHierarchy(path: string): boolean {
        return path.endsWith(".lh")
            || path.endsWith(".ls")
            || path.endsWith(".scene")
            || path.endsWith(".prefab");
    }

    private static _normalizePath(path: string): string {
        return path.replace(/\\/g, "/");
    }
}
