export const enum UILayer {
    Base = 0,
    /**
     * 主界面
     */
    HighBase,
    /**普通界面都在这个层级*/
    Second,
    /**仅提示相关界面设置在OnlyTip层，不要将其他任何Form设置在OnlyTip层*/
    OnlyTip,
    /**仅确认框Form设置在MessageBox层，不要将其他任何Form设置在MessageBox层*/
    MessageBox,
    /**仅锁屏Form设置在Top层，不要将其他任何Form设置在Top层*/
    Top,
    /**不要将其他任何Form设置在FloatTip层*/
    FloatTip,
    /**不要将任何Form设置在Max层*/
    Max
}