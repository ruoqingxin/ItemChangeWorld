
export default class PackRes extends Laya.Resource {
    static compressMagicNumber = 6666;
    static supportASTC = true;
    private _resList = {};

    static parse(buffer: ArrayBuffer, url: string): PackRes {
        let packRes = new PackRes();
        packRes._resList = {};
        var hierarchyBasePath = Laya.URL.getPath(url);
        
        // 使用Laya.Byte替代DataView，减少内存分配
        let byte = new Laya.Byte(buffer);
        byte.endian = Laya.Byte.LITTLE_ENDIAN;
        byte.pos = 0;
        //先读取前面4字节 判断是否压缩
        let compressFlag = byte.readUint32();
        if(compressFlag == PackRes.compressMagicNumber){
            var SnappyJS = window['SnappyJS'];
            // 获取剩余数据
            let remainingData = byte.readUint8Array(byte.pos, byte.bytesAvailable);
            var uncompressed = SnappyJS.uncompress(remainingData.buffer);
            console.log("-------parse uncompress:",url);
            // 重新创建Byte对象指向解压后的数据
            byte = new Laya.Byte(uncompressed);
            byte.endian = Laya.Byte.LITTLE_ENDIAN;
        } else {
            // 如果不是压缩文件，前面4字节就是资源数量，需要重置位置
            byte.pos = 0;
        }

        // 读取资源数量
        const resourceCount = byte.readUint32();

        // 读取每个资源
        for (let i = 0; i < resourceCount; i++) {
            // 读取名称长度
            const nameLength = byte.readUint32();

            // 读取名称 - 直接读取UTF8字符串，避免创建临时ArrayBuffer
            const name = byte.readUTFBytes(nameLength);

            // 读取内容长度
            const contentLength = byte.readUint32();

            // 先判断文件类型，决定读取方式
            let isltcb = false;
            if (name.endsWith(".ltcb.ls")) {
                isltcb = true;
            }
            
            let content: ArrayBuffer | string;
            if (!isltcb && (name.endsWith(".lh") || name.endsWith(".ls") || name.endsWith(".lmat"))) {
                // 文本文件：直接读取字符串，避免创建临时ArrayBuffer
                content = byte.readUTFBytes(contentLength);
            } else {
                // 二进制文件：读取字节数组
                content = byte.readUint8Array(byte.pos, contentLength).buffer as ArrayBuffer;
            }
            
            // 存储资源
            let path = hierarchyBasePath + name
            packRes._resList[path] = content;
            // if (isltcb || (!name.endsWith(".lh") && !name.endsWith(".ls"))) {
            //     //带上:标识 不会被format
            //     let url = Laya.URL.formatURL("res3d:" + path);
            //     let content = Laya.loader.getRes(url);
            //     if (!content) {
            //         Laya.Loader["cacheResForce"](url, packRes);
            //     } else {
            //         if (content instanceof PackRes) {
            //             let arr = [content, packRes];
            //             Laya.Loader["cacheResForce"](url, arr);
            //         } else if (content instanceof Array) {
            //             content.push(packRes);
            //             Laya.Loader["cacheResForce"](url, content);
            //         }
            //     }
            // }
        }

        //上锁 不能释放该资源
        packRes.lock = true;

        Laya.Loader.cacheRes(url, packRes);
        return packRes;
    }


    public getRes(url: string): any {
        url = url.replace(/\s/g, "_");
        let res = this._resList[url];
        if (!res) {
            console.error("PackRes :"+this.url + " 不存在资源 " + url);
        }
        return res;
    }


}