# 文到 AI 资源市场

本仓库是 Content Workbench 的官方远程资源源，统一提供提示词、风格模板、字体、纸张、光效、装饰素材和官方模特。应用程序更新由 `cw-updater` 独立完成；这里的版本和下载失败不会触发或阻塞系统更新。

## 目录

```text
data/manifest.json            # schema v2 唯一入口
data/catalogs/*.json          # 各类资源目录
data/taxonomy/zh-CN.json      # 中文分类、风格和场景
assets/prompts/               # 提示词预览图
assets/fonts/                 # WOFF2 字体
assets/materials/             # 纸张、光效和装饰原图
assets/models/                # 官方模特原图与预览图
assets/scenes/                # 官方场景原图与预览图
licenses/fonts/               # 字体许可证
schemas/                      # JSON Schema
scripts/validate-market.mjs   # 完整性与安全校验
```

## 新增资源

1. 将文件放入对应 `assets/` 子目录。
2. 在对应 `data/catalogs/*.json` 增加条目，使用全局唯一的稳定字符串 ID。
3. 填写真实 `byteSize` 和 SHA-256；macOS 可运行 `stat -f %z FILE` 与 `shasum -a 256 FILE`。
4. 填写 MIME、授权、来源及字体或图片专属 `details`。授权不明确的文件禁止发布。
5. 更新目录版本、`marketVersion`、`generatedAt` 和 `sourceRevision`。
6. 运行 `npm run validate`，必须零错误后才能发布。

字体仅接受 WOFF2。图片仅接受 JPEG、PNG 和 WebP；校验器会检查文件头、可解码尺寸、哈希、引用和孤立文件。资源目录不得包含脚本、HTML、CSS、可执行文件或压缩包。

官方模特和场景条目分别使用 `type: model`、`type: scene`，原图放在 `assets/models/` 或 `assets/scenes/`，并同时声明 `assetPath`、`previewPath`、MIME、尺寸、大小和哈希。`details` 至少填写 `width`、`height`；人物特征或场景描述可继续放入自定义字段。只有授权范围明确、允许随应用分发和用于内容生成的图片才能进入目录。模特和场景目录允许暂存尚未登记的候选图片，但只有写入对应 catalog 的资源才会对客户端可见。

## 发布顺序

这是不兼容的 schema v2。先发布本仓库并确认 GitCode raw API 可访问，再发布只读取 v2 的 Content Workbench 新版本。旧版客户端不在本次兼容范围；用户已收藏的提示词和作品保存在本地，不依赖本仓库协议。

应用把目录和预览缓存写入 `cache/resource-market`，把用户明确安装的文件写入 `resources/fonts`、`resources/materials` 或 `resources/models`。这些目录不进入发布 ZIP，应用升级也不会清理它们。

## 专业创作预览图库

专业创作的 12 张生图赛道和 5 张卡片预览位于 `previews/expert-resources/`，由狐文配置的图片服务（gpt-image-2）生成。全部使用渐进式 JPEG，长边 1024 像素；本批总计 2,271,376 字节。

索引：[previews/expert-resources/manifest.json](previews/expert-resources/manifest.json)。索引包含稳定资源 ID、名称、图片路径、尺寸、字节数和 SHA-256，可按资源 ID 对应桌面端的效果预览。这是专业创作预览文件集，使用独立索引；安装配方由桌面端的专业创作目录管理。

## 许可

提示词案例源自 `freestylefly/awesome-gpt-image-2`，遵循 MIT 许可并保留来源字段。字体遵循各自 `licenses/fonts/` 中的许可证。Content Workbench 素材的归属见条目及 `NOTICE.md`；新增素材必须先确认再分发权。
