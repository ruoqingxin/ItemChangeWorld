仙逆：本尊 hero_01 全量部件资源
==============================

入口：hero_01.json
图集：hero_01.atlas
纹理：hero_01.png、hero_012.png ... hero_0178.png

当前 JSON 已移除所有不带前缀的组合皮肤，只保留运行时组合所需的部件：
- default：1 个
- body/*：61 个身体皮肤
- head/*：73 个头部皮肤
- weapon_j/*：6 个近战武器皮肤
- weapon_y/*：1 个武器皮肤

合计 142 个皮肤，29 个动画，78 个 atlas 页面。
Spine 版本为 3.8.99，文件已压缩为单行 JSON。

组合规则：
- 身体：body/skinN
- 头部：head/skinN
- 武器：weapon_j/skinN 或 weapon_y/skinN
- 三者必须合并成运行时 Skin 后使用，不能同时给 Laya 组件设置三个 Skin Name。

Spine 3.8 核心运行时组合示例：
```ts
const skeletonData = skeleton.data;
const combinedSkin = new spine.Skin("player.composite");

combinedSkin.addSkin(skeletonData.findSkin("body/skin1"));
combinedSkin.addSkin(skeletonData.findSkin("head/skin1"));
combinedSkin.addSkin(skeletonData.findSkin("weapon_j/skin1"));

skeleton.setSkin(combinedSkin);
skeleton.setSlotsToSetupPose();

// j_weapon10 等额外武器插槽没有默认 attachmentName，需要显式挂接。
const weaponSlotNames = ["j_weapon", "j_weapon10"];
for (const slotName of weaponSlotNames) {
  const slot = skeleton.findSlot(slotName);
  const entry = combinedSkin
    .getAttachments()
    .find((item) => item.slotIndex === slot.data.index);
  if (entry) {
    slot.setAttachment(entry.attachment);
  }
}
```

LayaAir 设置：
- Spine 版本选择 3.8
- 使用换装模式 aniMode = 1
- 关闭 Use Fast Render
- 开启 Premultiplied Alpha

原游戏 PNG 已预乘 Alpha。关闭 Premultiplied Alpha 后再次相乘，
会产生黑边、灰边或半透明区域颜色异常。
