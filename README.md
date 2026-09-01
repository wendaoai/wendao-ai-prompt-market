# 文到 AI 提示词广场

`wendao-ai-prompt-market` 是文到 AI 图片生成器的远端提示词广场数据仓库。

应用仅从 GitCode 读取 `data/manifest.json`、案例索引和图片。浏览广场不会把案例或图片写入本地；用户点击“收藏到我的提示词”后，才会将该条提示词和对应图片下载到本机用户数据目录。

## 数据结构

```text
data/
  manifest.json
  cases.json
  style-library.json
  images/
```

`cases.json` 和 `style-library.json` 保持与上游兼容。新增或替换数据时，更新 `manifest.json` 的 `catalogVersion`。

## 来源与许可

初始数据来自 [freestylefly/awesome-gpt-image-2](https://github.com/freestylefly/awesome-gpt-image-2)，遵循其 MIT 许可。每个案例保留原始来源链接和作者标识；使用或再分发时请保留这些归属信息。
