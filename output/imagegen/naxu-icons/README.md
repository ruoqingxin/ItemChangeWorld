# 纳虚器独立图标

从用户提供的 `7uqhRPxi.png` 原画切分，共 12 枚，保留原有造型与配色，未重新生成或重绘。

## 文件

- `112/`：可直接使用的独立 PNG，112×112 像素、RGBA 真透明，占 2×2 个 56×56 格子。
- `naxu-icons-112.zip`：上述 12 张独立图标，解压后可直接选取。
- `rgba/`：原分辨率透明切图，供后续调整尺寸。
- `preview.png`：六档品质框效果预览；框和文字仅在预览图中。
- `transparency-check.png`：浅色、深色棋盘底的原尺寸透明检查图。
- `naxu-icons-atlas.png`：六列两行的透明对照图，整图 672×224，每格 112×112。
- `sheet-extraction.json`：原图哈希、切分区域、孔洞与核心保留记录。
- `validation.json`：实际尺寸、透明留白和文件哈希检查结果。

## 对应关系

| 品质 | 文件 | 名称 |
| --- | --- | --- |
| 普通·白 | `naxu-pouch-q1.png` | 素麻纳虚囊 |
| 普通·白 | `naxu-box-q1.png` | 灰木纳虚匣 |
| 优秀·绿 | `naxu-pendant-q2.png` | 青玉纳虚佩 |
| 优秀·绿 | `naxu-gourd-q2.png` | 青藤纳虚葫 |
| 精良·蓝 | `naxu-box-q3.png` | 玄纹纳虚匣 |
| 精良·蓝 | `naxu-flask-q3.png` | 流纹纳虚瓶 |
| 稀有·紫 | `naxu-seal-q4.png` | 紫阙纳虚印 |
| 稀有·紫 | `naxu-ring-q4.png` | 紫阙纳虚戒 |
| 史诗·金 | `naxu-gourd-q5.png` | 金阙纳虚葫 |
| 史诗·金 | `naxu-mirror-q5.png` | 金阙纳虚镜 |
| 传说·红 | `naxu-orb-q6.png` | 赤霄纳虚珠 |
| 传说·红 | `naxu-cauldron-q6.png` | 赤霄纳虚鼎 |

图标已去除黑底与文字，所有可见像素距离四边至少 8 像素；主体最长边为 96 像素。镂空处为透明，深色空间核心保留。独立图标不带品质框、文字和格线。

如导入本项目运行资源，使用精灵纹理（`textureType: 2`）、`sRGB: true`、`premultiplyAlpha: true`；现有项目预设已指定该类型。此次文件准备未替换运行时资源、配置或存档。
