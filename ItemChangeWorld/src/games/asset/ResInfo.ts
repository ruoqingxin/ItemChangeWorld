import { AssetRequest } from "./AssetRequest";

export class ResInfo implements Laya.ILoadURL {
    url: string;
    sourceResInfo: ResInfo;
    type: string;
    priority: number;
    useWorkerLoader: boolean;
    group: string;
    preloaded: boolean;
    loaded: boolean;

    public getError() {
        if (this.sourceResInfo) {
            return "path:" + this.url + " source:" + this.sourceResInfo.url;
        }
        return "path:" + this.url + " source:none";
    }
}