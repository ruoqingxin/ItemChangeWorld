/**
 * 搜打撤搜索时长：品质越高，搜索越久
 */
export class OpenSearchUtil {
    /** 基础搜索时长（毫秒） */
    private static readonly BASE_MS = 350;
    /** 每档品质额外时长（毫秒） */
    private static readonly PER_QUALITY_MS = 280;

    static getSearchDurationMs(quality: number): number {
        const q = Math.max(1, Math.min(7, quality || 1));
        return OpenSearchUtil.BASE_MS + (q - 1) * OpenSearchUtil.PER_QUALITY_MS;
    }
}
