import { BaseClass } from "../common/BaseClass";


export class SoundManager extends BaseClass {
    /**
     * 通用点击音效
     */
    static COMMON_CLICK_SOUND: string = null;
    /**
     * 通用关闭音效
     */
    static COMMON_CLOSE_SOUND: string = null;

    private _musicUrl: string = null;

    constructor() {
        super();
        Laya.SoundManager.autoStopMusic = true;
    }

    /**播放背景音乐 */
    playMusic(url: string) {
        try {
            this._musicUrl = url;
            Laya.SoundManager.playMusic(url, 0);
        }
        catch (e) {
            console.error(e);
        }
    }

    /**
     * 播放阶段背景音乐
     * @param url 背景音乐文件路径
     */
    playStageMusic(url: string) {
        try {
            Laya.SoundManager.playMusic(url, 0);
        }
        catch (e) {
            console.error(e);
        }
    }

    /**
     * 停止阶段背景音乐
     */
    stopStageMusic() {
        Laya.SoundManager.stopMusic();
        if (this._musicUrl) {
            Laya.SoundManager.playMusic(this._musicUrl, 0);
        }
    }

    /**暂停背景音乐 */
    pauseMusic() {
    }

    /**继续播放背景音乐 */
    resumeMusic() {
    }

    /**停止播放背景音乐 */
    stopMusic() {
        Laya.SoundManager.stopMusic();
    }

    /**
     * 播放声音
     * @param url 声音文件路径
     * @param loops 循环播放次数，默认1次
     */
    playSound(url: string, loops: number = 1) {
        Laya.SoundManager.playSound(url, loops);
    }

    /**停止声音单个声音 */
    stopSound(url: string) {
        Laya.SoundManager.stopSound(url);
    }

    setSoundVolume(volume: number): void {
        Laya.SoundManager.soundVolume = volume;
    }

    setMusicVolume(volume: number): void {
        Laya.SoundManager.musicVolume = volume;
    }

    setMusicMuted(value: boolean): void {
        Laya.SoundManager.musicMuted = value;
    }

    setSoundMuted(value: boolean): void {
        Laya.SoundManager.soundMuted = value;
    }
}