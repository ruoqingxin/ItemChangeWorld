/**
 * ConsoleLogger - 接管console.log并保存字符串的TypeScript类
 * 类似Node.js的日志保存功能
 */
export class ConsoleLogger {
    private static _instance: ConsoleLogger;
    private logs: string[] = [];
    private maxLogSize: number = 100; // 最大日志数量
    private originalConsole: any = {};
    private isInitialized: boolean = false;

    public static get instance(): ConsoleLogger {
        if (!ConsoleLogger._instance) {
            ConsoleLogger._instance = new ConsoleLogger();
        }
        return ConsoleLogger._instance;
    }

    /**
     * 初始化console接管
     * @param useOrigin 是否使用原始console.log
     * @param recordLog 是否记录日志
     */
    initialize(useOrigin: boolean, recordLog: boolean): void {
        if (this.isInitialized) return;

        // 保存原始console方法
        this.originalConsole = {
            log: console.log,
            info: console.info,
            warn: console.warn,
            error: console.error,
        };

        // 重写console方法
        console.log = (...args: any[]) => {
            if (recordLog) {
                this.recordLog('LOG', args);
            }
            if (useOrigin) {
                this.originalConsole.log.apply(console, args);
            }
        };

        console.info = (...args: any[]) => {
            if (recordLog) {
                this.recordLog('INFO', args);
            }
            if (useOrigin) {
                this.originalConsole.info.apply(console, args);
            }
        };

        console.warn = (...args: any[]) => {
            if (recordLog) {
                this.recordLog('WARN', args);
            }
            if (useOrigin) {
                this.originalConsole.warn.apply(console, args);
            }
        };

        console.error = (...args: any[]) => {
            if (recordLog) {
                this.recordLog('ERROR', args);
            }
            if (useOrigin) {
                this.originalConsole.error.apply(console, args);
            }
        };
        this.isInitialized = true;
    }

    /**
     * 记录日志
     * @param level 日志级别
     * @param args 日志参数
     */
    private recordLog(level: string, args: any[]): void {
        const timestamp = new Date().toISOString();
        let logMessage = '';

        // 格式化日志消息
        try {
            logMessage = args.map(arg => {
                if (typeof arg === 'object') {
                    return JSON.stringify(arg, null, 2);
                }
                return String(arg);
            }).join(' ');
        } catch (e) {
            logMessage = '[无法序列化的对象]';
        }

        const formattedLog = `[${timestamp}]${logMessage}`;

        // 添加到日志数组
        this.logs.push(formattedLog);

        // 限制日志数量
        if (this.logs.length > this.maxLogSize) {
            this.logs.shift(); // 移除最旧的日志
        }
    }

    /**
     * 获取所有保存的日志
     */
    public getLogs(): string[] {
        return [...this.logs];
    }

    /**
     * 获取格式化后的日志字符串
     */
    public getFormattedLogs(): string {
        return this.logs.join('\n');
    }
}