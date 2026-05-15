import { BaseClass } from "./BaseClass";

// 定义泛型对象池类
export class ObjectPool<T> {
    private pool: T[] = [];

    constructor(private create: () => T) {}

    public getObject(): T {
        return this.pool.length > 0 ? this.pool.pop()! : this.create();
    }

    public recycleObject(object: T): void {
        this.pool.push(object);
    }

    public clear(): void {
        this.pool = [];
    }
}

// 定义泛型对象池管理器类
export class PoolManager extends BaseClass {
    private pools: Map<string, ObjectPool<any>> = new Map();

    public getPool<T>(type: new () => T, create: () => T): ObjectPool<T> {
        const key = type.name;
        if (!this.pools.has(key)) {
            this.pools.set(key, new ObjectPool(create));
        }
        return this.pools.get(key)!;
    }

    public getObject<T>(type: new () => T): T {
        const pool = this.getPool(type, () => new type());
        return pool.getObject();
    }

    public recycleObject<T>(type: new () => T, object: T): void {
        const pool = this.getPool(type, () => new type());
        pool.recycleObject(object);
    }

    public clearPool<T>(type: new () => T): void {
        const key = type.name;
        if (this.pools.has(key)) {
            this.pools.get(key)!.clear();
        }
    }

    public clearAllPools(): void {
        this.pools.forEach(pool => pool.clear());
        this.pools.clear();
    }
}



