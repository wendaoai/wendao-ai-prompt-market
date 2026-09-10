# 文到 AI 资源市场

本仓库是 Content Workbench 的官方远程资源源，统一提供提示词、风格模板、字体、纸张、光效和装饰素材。应用程序更新由 `cw-updater` 独立完成；这里的版本和下载失败不会触发或阻塞系统更新。

## 目录

```text
data/manifest.json            # schema v2 唯一入口
data/catalogs/*.json          # 六类资源目录
data/taxonomy/zh-CN.json      # 中文分类、风格和场景
assets/prompts/               # 提示词预览图
assets/fonts/                 # WOFF2 字体
assets/materials/             # 纸张、光效和装饰原图
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

## 发布顺序

这是不兼容的 schema v2。先发布本仓库并确认 GitCode raw API 可访问，再发布只读取 v2 的 Content Workbench 新版本。旧版客户端不在本次兼容范围；用户已收藏的提示词和作品保存在本地，不依赖本仓库协议。

应用把目录和预览缓存写入 `cache/resource-market`，把用户明确安装的文件写入 `resources/fonts` 或 `resources/materials`。这些目录不进入发布 ZIP，应用升级也不会清理它们。

## 许可

提示词案例源自 `freestylefly/awesome-gpt-image-2`，遵循 MIT 许可并保留来源字段。字体遵循各自 `licenses/fonts/` 中的许可证。Content Workbench 素材的归属见条目及 `NOTICE.md`；新增素材必须先确认再分发权。
