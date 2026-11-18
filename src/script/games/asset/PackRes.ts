export default class PackRes extends Laya.Resource {
    private readonly resources: Record<string, ArrayBuffer> = {};

    static parse(buffer: ArrayBuffer, url: string): PackRes {
        const pack = new PackRes(), byte = new Laya.Byte(buffer);
        byte.endian = Laya.Byte.LITTLE_ENDIAN;
        const readLength = (): number => {
            if (byte.pos + 4 > buffer.byteLength) throw new Error("配置包长度字段缺失");
            const length = byte.readUint32();
            if (length > buffer.byteLength - byte.pos) throw new Error("配置包内容越界");
            return length;
        };
        const count = readLength(), base = Laya.URL.getPath(url);
        for (let i = 0; i < count; i++) {
            const name = byte.readUTFBytes(readLength());
            if (!name || name.includes("/") || name.includes("\\") || pack.resources[base + name])
                throw new Error("配置包表名无效或重复");
            const length = readLength();
            pack.resources[base + name] = byte.readUint8Array(byte.pos, length).buffer as ArrayBuffer;
        }
        if (byte.pos !== buffer.byteLength) throw new Error("配置包存在多余数据");
        pack.lock = true;
        Laya.Loader.cacheRes(url, pack);
        return pack;
    }

    getRes(url: string): ArrayBuffer {
        const data = this.resources[url];
        if (!data) throw new Error(`配置包缺少表：${url}`);
        return data;
    }
}
