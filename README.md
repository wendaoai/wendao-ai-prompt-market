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

字体仅接受 WOFF2，不设置固定文件大小上限，安装时按目录声明大小下载并校验 SHA-256。超过 16 MiB 的字体需要使用已取消字体大小上限的客户端。图片仅接受 JPEG、PNG 和 WebP；校验器会检查文件头、可解码尺寸、哈希、引用和孤立文件。资源目录不得包含脚本、HTML、CSS、可执行文件或压缩包。

官方模特和场景条目分别使用 `type: model`、`type: scene`，原图放在 `assets/models/` 或 `assets/scenes/`，并同时声明 `assetPath`、`previewPath`、MIME、尺寸、大小和哈希。`details` 至少填写 `width`、`height`；人物特征或场景描述可继续放入自定义字段。只有授权范围明确、允许随应用分发和用于内容生成的图片才能进入目录。模特和场景目录允许暂存尚未登记的候选图片，但只有写入对应 catalog 的资源才会对客户端可见。

## 发布顺序

这是不兼容的 schema v2。先发布本仓库并确认 GitCode raw API 可访问，再发布只读取 v2 的 Content Workbench 新版本。旧版客户端不在本次兼容范围；用户已收藏的提示词和作品保存在本地，不依赖本仓库协议。

应用把目录和预览缓存写入 `cache/resource-market`，把用户明确安装的文件写入 `resources/fonts`、`resources/materials` 或 `resources/models`。这些目录不进入发布 ZIP，应用升级也不会清理它们。

## 专业创作预览图库

专业创作的 12 张生图赛道和 5 张卡片预览位于 `previews/expert-resources/`，由狐文配置的图片服务（gpt-image-2）生成。全部使用渐进式 JPEG，长边 1024 像素；本批总计 2,271,376 字节。

索引：[previews/expert-resources/manifest.json](previews/expert-resources/manifest.json)。索引包含稳定资源 ID、名称、图片路径、尺寸、字节数和 SHA-256，可按资源 ID 对应桌面端的效果预览。这是专业创作预览文件集，使用独立索引；安装配方由桌面端的专业创作目录管理。

## 许可

提示词案例源自 `freestylefly/awesome-gpt-image-2`，遵循 MIT 许可并保留来源字段。字体遵循各自 `licenses/fonts/` 中的许可证。Content Workbench 素材的归属见条目及 `NOTICE.md`；新增素材必须先确认再分发权。

大字体兼容：超过旧版 16 MiB 上限的字体单独放在可选 `fonts-extended` catalog，资源类型仍为 `font`。新版合并展示；旧版忽略该未知目录，继续读取 `fonts` 和其他资源。


## 分类仓库与三个平台镜像

提示词、风格、AI 服务配置在本仓库维护；字体在 `wendao-ai-font-market`，视觉素材在 `wendao-ai-material-market`，模板在 `wendao-ai-template-market` 维护。
每类均由 GitCode 主仓库原生 Push 镜像同步到 GitHub/Gitee 的 `wendaoai` 组织同名仓库。

统一索引的 `source` 是固定来源别名（`fonts`、`materials`），目录同时声明 `sha256` 和 `count`。客户端按分类读取，未变化目录复用缓存，并在镜像限流或内容不一致时切换来源。

本仓库原有字体和视觉素材路径暂留只读快照，避免新客户端发布前破坏现有入口；新资源只在独立仓库维护。运行 `npm run sync-metadata` 不会改写这些旧快照。

克隆三个主仓库到同一个父目录后，先在资源仓库执行元数据同步和校验，推送并确认镜像一致；再在本仓库执行 `npm run sync-index`、`npm run validate`，提交统一索引。索引工具会自动递增市场补丁版本，资源 ID 不变。

## 离线资源包

支持离线包的狐文客户端可在资源中心选择“离线资源包”，按分类下载并安装，或先保存 ZIP，再通过“导入资源包”用于其他设备。原有单项浏览与安装继续可用；这些 ZIP 独立分发，不进入应用安装包。

清单位于 [`data/offline-packs.json`](data/offline-packs.json)，记录数量、版本、实际字节数、SHA-256 和已确认发布的下载来源。v1.0.0 提供提示词与配置 784 项、字体 29 项、视觉素材 18 项、模板 279 项。模板包含仅供预览的未适配条目；配置包不会覆盖个人服务配置。专业创作配方与其独立预览图库不属于提示词包。

四类 ZIP 均已发布至各自 GitCode 仓库的 `offline-v1.0.0` Release。Git Push 镜像只同步代码与清单，不能同步 Release 附件；其他平台只有在附件上传并核对元信息后才加入清单。目前 Gitee 还提供视觉素材 ZIP，其他未成功来源不对客户端公布。
