# 弹幕集成

## 概述

下载完成并重命名后，自动从 DanDanPlay 获取该集弹幕，生成兼容格式的 XML 文件，上传到 PikPak 与视频相同目录。使用支持 DanDanPlay 弹幕的播放器（如 dandanplay 或 Infuse+弹弹play 插件）可直接加载。

## 配置

```json
{
  "dandanplay": {
    "enabled": true,
    "appId": "your_app_id",
    "appSecret": "your_app_secret",
    "chConvert": 1
  }
}
```

申请 API：https://www.dandanplay.com/

`chConvert` 参数：
- `0` — 不转换
- `1` — 转换为简体中文
- `2` — 转换为繁体中文

## 工作流程

```
重命名成功 → 触发 onRenamed 回调
      ↓
  用官方标题搜索 DanDanPlay /search/episodes
      ↓
  匹配对应集数的 episodeId
      ↓
  /comment/{episodeId}?withRelated=true 获取弹幕
      ↓
  生成标准 XML 格式
      ↓
  上传到 PikPak（同目录，文件名与视频相同但扩展名为 .xml）
```

## XML 格式

生成的 XML 与 DanDanPlay 客户端格式兼容：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<i>
  <chatserver>chat.bilibili.com</chatserver>
  <chatid>195160001</chatid>
  <d p="0.000,1,25,16777215,0,0,0,0">弹幕内容</d>
  ...
</i>
```

`p` 属性格式：`时间(秒),类型,字号,颜色,发送时间戳,弹幕池,用户ID,行号`

## 相关代码

- `src/core/danmaku/client.ts` — DanDanPlay API 客户端
- `src/core/danmaku/xml-generator.ts` — XML 文件生成
- `src/core/danmaku/service.ts` — 协调搜索、获取、生成、上传
- `src/core/danmaku/types.ts` — 类型定义
- `src/server/routes/danmaku.ts` — 弹幕 REST API 路由
