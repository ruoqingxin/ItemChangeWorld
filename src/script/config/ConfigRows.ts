export function byConfigId<T extends { id: number }>(rows: readonly T[], table: string): T[] {
    const ids = new Set<number>();
    for (const {id} of rows) {
        if (!Number.isSafeInteger(id) || id <= 0 || ids.has(id)) {
            throw new Error(`${table} 的编号无效或重复：${id}`);
        }
        ids.add(id);
    }
    return rows.slice().sort((a,b) => a.id - b.id);
}

export function byBehaviorCode<K extends string, T extends { id: number; code: string }>(
    rows: readonly T[], expected: readonly K[], table: string,
): Array<T & { code: K }> {
    const codes = new Set<string>(expected);
    const sorted = byConfigId(rows, table);
    for (const {code} of sorted) {
        if (!codes.delete(code)) throw new Error(`${table} 的行为码未知或重复：${code}`);
    }
    if (codes.size) throw new Error(`${table} 缺少行为码：${[...codes].join("、")}`);
    return sorted as Array<T & { code: K }>;
}
