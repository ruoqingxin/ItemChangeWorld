LayaAir 使用说明
================

这份资源来自 Spine 3.8.99。已验证只有 LayaAir 的 Spine 3.8 runtime 能完整渲染；
4.1 runtime 虽然能解析，但骨骼变换不兼容，只会显示少量附件。
项目 PlayerSettings.json 的 spineVersion 已设置为 3.8。

资源目录：assets/ui/resource/converted_spine/hero_00_sample
入口文件：hero_00.json
配套文件：hero_00.atlas，以及同目录 17 张 PNG

使用方式：
1. 在 Laya IDE 刷新资源目录。
2. 将 hero_00.json 拖到场景层级面板，或在 Spine 组件的 Source 中选择它。
3. 关闭 Use Fast Render；Skin Name 选择 laya_all；动画名称先选择 idle，勾选循环。
4. .atlas 和 PNG 必须和 hero_00.json 放在同一目录，不要只复制 JSON。

可用动画：idle、idle2、idle3、attack1_sword、dead_j、hit_j 等。

说明：laya_all 是 default + body/skin1 + head/skin1 的合并皮肤，Laya 面板可直接使用。
