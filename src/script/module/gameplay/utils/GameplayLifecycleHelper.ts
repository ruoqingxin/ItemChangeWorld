interface TimedRun {
    readonly error: string;
    expire(): boolean;
    pauseSearch?(flush?: boolean): void;
}

/** Owns foreground/deadline listeners for a lazily created run manager. */
export class GameplayLifecycleHelper {
    static watch(owner: object, run: TimedRun, expired: () => void): void {
        const check = () => {
            try {
                if (document.hidden) run.pauseSearch?.();
                if (!run.error && run.expire()) expired();
            } catch (error) { console.warn("局内事务保存失败，将重试", error); }
        };
        const pause = () => {
            try { run.pauseSearch?.(); }
            catch (error) { console.warn("搜索暂停保存失败", error); }
        };
        Laya.timer.loop(250, owner, check);
        window.addEventListener("focus", check);
        document.addEventListener("visibilitychange", check);
        if (run.pauseSearch) {
            window.addEventListener("blur", pause);
            window.addEventListener("pagehide", pause);
        }
        check();
    }
}
