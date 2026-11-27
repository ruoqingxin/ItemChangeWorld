仙逆：本尊人物 / Spine 资源

characters/
  完整人物分类资源，包含 Spine、人物预制体以及相关依赖。

spine/
  apk/    APK 内置 Spine 资源
  remote/ 运行时下载的 Spine 资源

character_preview/
  已转换为 PNG 的可查看人物纹理。

说明：
- 原始 JSON、BIN、ASTC、atlas 等文件均保留。
- characters 与 spine 之间可能存在重复文件，这是为了同时保留分类资源和独立 Spine 目录。
- 若项目使用 Cocos Creator，需要保持相对目录和 UUID 引用，不能只复制 PNG。
