export interface IEffectSpec {
    effectId: number;
    value: number;
    target: number;
    param?: number;
}

export class BattleConfigUtils {
    static isEnabled(row: { enabled?: number } | null | undefined): boolean {
        if (!row) {
            return false;
        }

        if (row.enabled === undefined || row.enabled === null) {
            return true;
        }

        return Number(row.enabled) === 1;
    }

    static toNumber(value: unknown, fallback: number = 0): number {
        if (value === undefined || value === null || value === "") {
            return fallback;
        }

        const num = Number(value);
        return Number.isNaN(num) ? fallback : num;
    }


    static parseEffectGroup(raw: number[][]): IEffectSpec[] {
        if (raw === undefined || raw === null) {
            return [];
        }

        if (Array.isArray(raw)) {
            return raw
                .map(arr => this.parseEffectArray(arr))
                .filter((v): v is IEffectSpec => !!v);
        }
        return [];
    }

    private static parseEffectArray(arr: number[]): IEffectSpec | null {
        if (!arr || arr.length < 3) {
            return null;
        }
        const effectId = Number(arr[0]);
        const value = Number(arr[1]);
        const target = Number(arr[2]);
        const param = arr.length >= 4 ? Number(arr[3]) : undefined;

        if (Number.isNaN(effectId) || Number.isNaN(value) || Number.isNaN(target)) {
            return null;
        }
        return {
            effectId,
            value,
            target,
            param,
        };
    }
}
