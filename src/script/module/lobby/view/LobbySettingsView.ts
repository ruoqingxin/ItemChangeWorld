import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { UIManager } from "../../../games/ui/UIManager";
import { ManualTestView } from "../../manualTest/view/ManualTestView";

interface LobbyAudioSettings { music: boolean; sound: boolean; }

export class LobbySettingsView extends UIBaseView {
    private static readonly audioKey = "nowchange.audio.v1";
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/lobby/LobbySettingsView.lh"; }
    private musicCheck: Laya.GImage;
    private soundCheck: Laya.GImage;
    private message: Laya.GTextField;
    private audio: LobbyAudioSettings;

    private static readAudio(): LobbyAudioSettings {
        try {
            const value = JSON.parse(window.localStorage.getItem(this.audioKey) || "{}");
            return { music: value?.music !== false, sound: value?.sound !== false };
        } catch { return { music: true, sound: true }; }
    }

    static applySavedAudio(): void {
        const value = this.readAudio();
        Laya.SoundManager.musicMuted = !value.music;
        Laya.SoundManager.soundMuted = !value.sound;
    }

    protected onConstruct(): void {
        this.musicCheck = this.getElement("img_music_check");
        this.soundCheck = this.getElement("img_sound_check");
        this.message = this.getElement("txt_settings_message");
        this.addClickListener(this.getElement("btn_close"), this.close);
        this.addClickListener(this.getElement("btn_music"), () => this.toggleAudio("music"));
        this.addClickListener(this.getElement("btn_sound"), () => this.toggleAudio("sound"));
        this.addClickListener(this.getElement("btn_manual_test"), this.onClickManualTest);
    }

    onOpen(): void {
        this.audio = LobbySettingsView.readAudio();
        this.message.text = "";
        this.updateView();
    }

    private toggleAudio(kind: keyof LobbyAudioSettings): void {
        const next = { ...this.audio, [kind]: !this.audio[kind] };
        try {
            window.localStorage.setItem(LobbySettingsView.audioKey, JSON.stringify(next));
            this.audio = next;
            LobbySettingsView.applySavedAudio();
            this.message.text = "";
            this.updateView();
        } catch { this.message.text = "设置保存失败，请重试"; }
    }

    public updateView(): void {
        this.musicCheck.visible = this.audio.music;
        this.soundCheck.visible = this.audio.sound;
    }

    private onClickManualTest(): void {
        this.close();
        UIManager.ins().openForm(ManualTestView);
    }

    protected onClose(): void {}
}
