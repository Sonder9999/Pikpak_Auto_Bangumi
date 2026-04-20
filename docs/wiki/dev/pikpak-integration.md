# PikPak 集成

## 认证模式

### WEB 模式（默认）

模拟浏览器 Web 客户端，使用 SALTS 签名算法。支持 token 刷新，避免频繁登录。

优先尝试 refresh token 刷新，失败后用账号密码登录。

### LIB 模式（回退）

使用 PikPak SDK 风格认证，作为 WEB 模式失败时的备选。

## Token 管理

- Token 缓存在 `data/pikpak_token.json`（被 gitignore 排除）
- 启动时自动读取缓存，尝试 refresh token 刷新
- 刷新成功后写回缓存文件

## 云端文件操作

### 目录操作

`ensurePath(basePath, subPath)` — 逐层 find-or-create，幂等操作：
1. 列出父目录内容，检查目标文件夹是否存在
2. 存在则直接返回 id，不存在则创建
3. 支持多层级路径

### 离线下载

提交 magnet/torrent URL 到指定父文件夹：
```
POST /drive/v1/files
{
  "kind": "drive#file",
  "name": "",
  "upload_type": "UPLOAD_TYPE_URL",
  "url": { "url": "magnet:?xt=..." },
  "parent_id": "folder_id"
}
```

### 任务轮询

每 30 秒查询一次离线任务状态：
```
GET /drive/v1/tasks?type=offline
```
检测 `phase` 字段为 `PHASE_TYPE_COMPLETE` 时触发重命名流程。

### 文件重命名

```
PATCH /drive/v1/files/{fileId}
{ "name": "新文件名.mkv" }
```

### 文件上传（Aliyun OSS）

上传弹幕 XML 等小文件：
1. POST `/drive/v1/files` 获取 Aliyun STS 临时凭证
2. 构造 OSS URL：`https://{bucket}.{endpoint}/{key}`
3. HMAC-SHA1 签名 Authorization 头
4. PUT 请求上传文件内容

## 注意事项

- `file_duplicated_name` 错误：PikPak 不允许同名文件（包括回收站中的），重复运行相同测试时会遇到
- 认证日志：refresh token 成功时仍可能打印 "All authentication methods failed"（已知 cosmetic bug）
