# 阶段 B：最小战斗界面实施与验收

日期：2026-11-04  
依据：《固定站位回合制战斗实施方案.md》阶段 B。  
状态：客户端实现、自动化测试、真实 Laya 浏览器预览已完成；玩法与视觉体验仍待人工试玩反馈。

## 1. 本阶段内容

- 进入大厅后自动打开 `SkillBattleView`，不再进入旧卡牌调试界面。
- 上方敌人、下方玩家，固定逻辑站位，三种独立遭遇可切换。
- 显示回合、双方生命与护盾、敌人五行、敌人当前意图和可打断标记、剑势与铁剑耐久。
- 四招式图标、剑势消耗、选择、结果预览、取消与确认。
- 剑势不足时可查看准确失败原因，无法提交行动。
- 预览显示基础伤害、敌方护盾吸收、敌方实际失血、本回合承受伤害、获得护盾与行动后剑势。
- 引擎绘制占位角色及战场；短距离出击、受击闪烁与震动、伤害或护盾数字、死亡淡出。
- 动画期间锁定招式、确认、取消和遭遇切换；允许跳过动画。
- 胜利、失败、重打和选择其他独立遭遇。

三种遭遇均从满生命、零剑势和初始耐久独立开始。此处切换不是连续秘境，也不会领取奖励。

## 2. 实现边界

客户端根目录：`E:\NowChange\ItemChangeWorld`。

| 文件 | 职责 |
| --- | --- |
| `src/script/module/skillBattle/view/SkillBattleView.ts` | 接入 UIBaseView、UIManager 与真实配置，处理打开、关闭和尺寸适配 |
| `src/script/module/skillBattle/view/SkillBattlePanel.ts` | Laya 原生交互界面与事件动画，不计算战斗规则 |
| `src/script/module/skillBattle/view/SkillBattlePresenter.ts` | 保存选中预览与原始确认令牌，锁定输入，维护独立显示快照 |
| `assets/ui/prefab/module/skillBattle/SkillBattleView.lh` | 新界面预制体入口 |
| `src/script/stage/LobbyStage.ts` | 自动打开新战斗界面 |
| `assets/ui/texture/skillBattle/` | 四个 Lucide 占位招式图标及许可证 |

确认只调用一次阶段 A 的 `SkillBattleManager.confirmAction`，立即提交完整回合结果。表现层随后逐条播放事件，生命与护盾变化直接采用事件数据。

选中招式时保留该次预览的 `battleId + revision`，确认时不重新生成令牌。过期预览会明确报错，不额外推进回合。

跳过或关闭时清理面板计时器、角色与数字 Tween，丢弃未播事件，并恢复已提交快照。重新打开使用当前战斗结果，不自动补血、不重新出招。

## 3. 自动化验收

客户端根目录执行：

```powershell
tsc --noEmit --pretty false
.\tools\test-skill-battle.ps1
```

结果：TypeScript 编译通过，47 项测试通过，其中原阶段 A 42 项保持通过，新增 5 项：

1. 预览、取消与剑势不足不会修改正式状态。
2. 确认立即锁定，重复确认不会多打一回合。
3. 在事件序列任意前缀后跳过，恢复的状态与正式结果相同。
4. 过期选中令牌拒绝提交，保留当前正式状态。
5. 胜利、失败、重新打开与显式重开独立遭遇。

测试仍读取真实 `assets/config/configbin.bin`，没有修改数值表或二进制包。

## 4. 浏览器验收

`tools/preview-skill-battle.cjs` 启动独立预览，默认地址为 `http://127.0.0.1:18094`：

```powershell
node .\tools\preview-skill-battle.cjs
```

预览使用本机 LayaAir IDE 引擎、生产 `SkillBattlePanel` 与同一份真实配置，不是另写的网页战斗。默认引擎目录从 `%LOCALAPPDATA%\Programs\LayaAirIDE\resources` 读取，可用 `LAYA_IDE_RESOURCES` 覆盖；端口可用 `PORT` 覆盖。

浏览器测试：

```powershell
# NODE_PATH 指向包含 playwright 和 sharp 的依赖目录
node .\tools\test-skill-battle-browser.cjs
```

使用 Playwright Chromium，在 1440×1000、390×844、360×640 三个尺寸实际点击，36 项检查通过：

- 资源不足、选择取消、确认连点、结算中招式点击不会误提交。
- 出击位置确实随动画改变，跳过后显示快照与已提交状态一致。
- 灵鼠以剑击、剑击、贯虹获胜，剩余生命 38。
- 守卫连续剑击会失败，展示失败界面，可重打或切换遭遇。
- 妖兔重击可以被破势打断，意图推进到下一项。
- 打断动画中关闭，等待后重新打开，正式结果不变、输入恢复。
- 守卫石甲显示 6 护盾，下一次剑击预览为吸收 6、失血 0。
- 画布非空，角色和图标正常渲染；测试页面没有未捕获异常。

截图位于客户端 `bin/skill-battle-browser/`，该目录被现有 `.gitignore` 排除。

另外已在现有 Laya IDE 完整工程预览 `http://127.0.0.1:18092` 中，用真实鼠标依次选择剑击、剑击、贯虹并确认，正常获胜且剩余生命 38；手机尺寸与切换桌面尺寸后均可显示新界面，没有未捕获异常。大厅入口、真实配置、预制体和图标加载均已贯通。IDE 预览仍报告原资源依赖清单 `ui/ui-deps.json`、`u3d/u3d-deps.json` 缺失的 404，本阶段未改动资源打包系统；新战斗预制体与图标加载正常。

## 5. 尚未包含

- 正式立绘、精修背景、正式特效与音效。
- 法囊、属性石、疗伤丹、灼烧、耐久消耗。
- 跨战斗生命与物资、三战路线、强化、掉落、撤离、存档与收藏。
- 长期平衡验证。阶段 A 的守卫无损长循环等观察仍然有效，本阶段未调整数值。

下一阶段为 C：五格法囊、火土注灵、疗伤丹、原子资源校验，以及跨战斗生命、物资和耐久保留。
