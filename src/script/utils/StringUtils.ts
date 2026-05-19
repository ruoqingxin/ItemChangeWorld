/**
 * 字符串工具类
 */
export class StringUtils {
    /**
     * 判断字符串是否为空
     * @param str 
     * @returns 
     */
    static isNullOrEmpty(str: string) {
        if (!str) {
            return true;
        }
        return false;
    }

    static format(fmt: string, ...args): string {
        return fmt.replace(/\{(\d+)\}/g, function (m, i) { return args[i]; });
    }

    static padLeft(num, n) {
        let nums = '00000000000000000000000000000' + num;
        return nums.substr(nums.length - n);
    }
}