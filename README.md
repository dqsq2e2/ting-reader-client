# TingReader Desktop Client

TingReader 的官方桌面客户端，基于 Electron 构建。这是一个纯客户端应用，需要连接到自托管的 TingReader 服务器使用。

## 功能特性

*   **纯客户端架构**：轻量级设计，只需输入服务器地址即可连接您的私有书库。
*   **本地缓存**：
    *   自动缓存播放过的音频文件，节省流量并提升加载速度。
    *   智能缓存管理（LRU 策略）：默认限制 2GB / 50 个文件，自动清理旧文件。
    *   支持手动一键清空缓存。
*   **无缝漫游**：
    *   自动处理服务器 302 重定向（支持 DDNS、内网穿透等场景）。
    *   自动同步播放进度到服务器。
*   **原生体验**：
    *   支持 Windows 媒体控制键（播放/暂停、上一曲、下一曲）。
    *   自动检查更新（基于 GitHub Releases）。

## 开发指南

### 前置要求

*   Node.js 18+
*   npm

### 安装依赖

```bash
cd ting-reader-client
npm install
```

### 启动开发环境

```bash
npm run electron:dev
```

此命令会同时启动：
1.  Frontend 开发服务器 (Vite)
2.  Electron 窗口

### 构建安装包

```bash
npm run electron:build
```

构建产物（`.exe` 安装包）将生成在 `dist_electron` 目录中。

## 发布流程

本项目使用 GitHub Actions 进行自动构建和发布。

1.  修改 `package.json` 中的 `version` 字段。
2.  提交代码并推送到 `main` 分支。
3.  GitHub Actions 会自动检测版本变化：
    *   如果该版本尚未发布，则自动构建 Windows 安装包。
    *   自动创建 Git Tag (`v1.0.0`)。
    *   自动创建 GitHub Release 并上传 `.exe` 和 `latest.yml`。

## 缓存说明

客户端使用自定义协议 `ting://` 来拦截音频请求并实现缓存。

*   **缓存位置**：
    *   Windows: `%APPDATA%\ting-reader-client\media_cache`
*   **缓存策略**：
    *   **上限**：2GB 或 50 个文件。
    *   **清理**：写入新文件时自动检查，优先删除最久未使用的文件。

## 许可证

MIT
