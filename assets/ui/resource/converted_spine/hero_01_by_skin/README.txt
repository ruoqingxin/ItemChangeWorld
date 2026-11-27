hero_01 Spine 皮肤拆分结果
共 68 个可直接用于 LayaAir 的皮肤目录，其中包括 61 个合并皮肤和 7 个独立武器皮肤。
每个目录包含目标 skin、default skin、所需的 JSON、裁剪后的 atlas 和实际引用的 PNG。
目录名中的 __ 对应原 skin 名称中的 /。

每个目录只保留 atlas 实际声明的 PNG 页面。hero_0178.png 仅保留在
skin63、skin64、skin65 和 weapon_y__skin10 四个目录中，其余冗余副本已清理。

全部 JSON 均为 Spine 3.8.99，已清理其他皮肤的动画变形引用，并通过
LayaAir 内置 Spine 3.8 运行时逐套解析和播放 29 个动画。

原游戏 PNG 已经预乘 Alpha，Laya 中使用时应开启 Premultiplied Alpha，
并关闭 Use Fast Render。
