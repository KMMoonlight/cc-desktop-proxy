# CC Desktop Proxy

本项目是一个基于 Electron + React 的本地桌面客户端，用来把 `Claude` 和 `Codex` 两套本地 CLI 工作流整合进一个多工作区、多分屏的 GUI 中。

CC Desktop Proxy is a local Electron + React desktop client that brings `Claude` and `Codex` CLI workflows into a multi-workspace, multi-pane GUI.

- [中文](#中文)
- [English](#english)

## 中文

### 项目简介

CC Desktop Proxy 不是一个云端代理服务，而是一个运行在你本机上的桌面壳层：

- 它直接调用本地安装的 `claude` 和/或 `codex` CLI
- 它围绕本地工作目录、会话状态、审批记录和 Git 变更来组织界面
- 它把多分屏会话、附件、技能、审批和 Git diff 这些常见开发动作统一到一个窗口里

如果你希望同时管理多个仓库、多个 agent 会话，并且希望用 GUI 来查看 diff、审批请求和 provider 状态，这个项目就是为这类场景准备的。

### 核心功能

- 双 Provider 会话
  在同一个应用里使用 `Claude` 和 `Codex`。每个会话都可以在真正开始对话前切换 provider，并分别维护模型、模式和推理强度。
- 多工作区、多分屏
  支持添加多个本地仓库，在一个窗口中拆分多个 conversation pane，并通过快捷键快速聚焦、关闭或新建 pane。
- Git 变更窗口
  可以查看工作区当前的 Git 变更、文件树、patch、增删行统计，并直接把工作区或当前文件交给代码编辑器打开。
- 代码编辑器联动
  应用会检测本机常见编辑器，并允许你在设置中选择默认编辑器。消息里的本地路径链接也会优先在选定编辑器中打开。
- 会话级控制
  支持 provider、model、Claude mode、Codex reasoning effort、Codex plan mode 等会话级选项。
- Provider 设置
  支持为每个 provider 单独配置启用状态、system prompt 和本地状态刷新。
- Slash 命令
  内置 `/clear`、`/model`、`/provider`、`/theme`、`/mcp`、`/skills`，以及 Claude 专属 `/mode`、Codex 专属 `/reasoning`（兼容 `/effort`）。
- Skills 管理
  支持发现并调用用户级、项目级和系统级 skills，也支持通过 `/skills install <path> [--scope user|project]` 安装本地 skill。
- 审批与安全控制
  支持 CLI 审批请求展示与响应，也支持对 Codex 的 `workspace-write` 权限升级做工作区级记忆，避免重复确认。
- 附件与富文本消息
  支持文件选择、粘贴图片/文件、Markdown 渲染、代码块复制、工具活动聚合展示。
- Provider 状态概览
  设置页可以查看 Claude / Codex 本地状态摘要，例如模型、活跃信息、认证方式、套餐、token 使用和 rate limit。

### 技术栈

- Electron
- React 18
- Vite
- Tailwind CSS
- Radix UI
- 本地 CLI 子进程编排（`claude` / `codex`）

### 快速开始

#### 1. 准备环境

- 安装较新的 Node.js LTS 和 `npm`
- 安装至少一个本地 provider CLI：
  `claude` 或 `codex`
- 如果命令不在 `PATH` 中，可以通过环境变量显式指定
- 如果你要使用打包脚本或图标生成脚本，建议在 macOS 上执行

#### 2. 安装依赖

```bash
npm install
```

#### 3. 启动开发环境

```bash
npm run dev
```

这个命令会同时启动：

- Vite renderer
- Electron 主进程

#### 4. 以生产构建方式启动

```bash
npm run start
```

#### 5. 构建前端

```bash
npm run build
```

### 环境变量

开发和本地运行阶段常用的环境变量：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `CLAUDE_BIN` | Claude CLI 可执行文件路径或命令名 | `claude` |
| `CODEX_BIN` | Codex CLI 可执行文件路径或命令名 | `codex` |
| `CLAUDE_CONFIG_DIR` | Claude 本地配置根目录 | `~/.claude` |
| `CODEX_HOME` | Codex 本地配置根目录 | `~/.codex` |

macOS 发布相关变量见：

- `.env.release.example`
- `build_release_info.md`

### Skills 目录约定

应用会自动扫描以下 skill 目录，并把结果暴露给对应 provider：

- Claude 用户级: `~/.claude/skills`
- Claude 项目级: `<workspace>/.claude/skills`
- Codex 用户级: `~/.codex/skills`
- Codex 项目级: `<workspace>/.codex/skills`
- 系统级: 上述目录下的 `.system` 子目录

常用命令：

```bash
/skills list
/skills install ./path-to-skill --scope project
```

### 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发环境 |
| `npm run start` | 先构建再启动 Electron |
| `npm run build` | 仅构建前端 |
| `npm run build:icon` | 生成 macOS 图标资源 |
| `npm run dist:mac` | 构建并输出 macOS `.dmg` |
| `npm run dist:mac:dir` | 构建并输出 macOS `.app` 目录 |
| `npm run release:mac` | 使用正式签名/公证配置执行 macOS 发布 |
| `npm run release:mac:check` | 只检查发布环境变量，不真正打包 |

### Slash 命令速览

| 命令 | 说明 |
| --- | --- |
| `/clear` | 清空并新建一个对话 |
| `/model <name>` | 设置当前会话模型 |
| `/provider claude|codex` | 切换当前会话 provider |
| `/theme light|dark|system` | 切换界面主题 |
| `/mcp ...` | 透传执行 MCP 相关 CLI 命令 |
| `/skills ...` | 列出或安装 skills |
| `/mode ...` | Claude 会话模式切换 |
| `/reasoning ...` | Codex 推理强度切换 |
| `/effort ...` | `/reasoning` 的兼容别名 |

### 项目结构

```text
electron/    Electron 主进程、runtime、preload IPC bridge
src/         React 前端界面和通用组件
build/       macOS 图标、entitlements 等打包资源
scripts/     图标生成与 macOS 发布脚本
dist/        前端构建产物
release/     打包输出目录
```

### 发布说明

当前仓库已经接入 macOS 打包流程：

- 使用 `electron-builder`
- 支持 `.dmg` 和 `.app` 目录产物
- 提供 `scripts/release-mac.mjs`
- 通过 `.env.release.local` 读取签名与 notarization 配置

如果要正式发布给其他用户，至少需要准备：

- 签名配置：`CSC_NAME` 或 `CSC_LINK` + `CSC_KEY_PASSWORD`
- 公证配置：
  `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER`

示例模板见 `.env.release.example`。

### 当前限制

- 项目目前没有真正的自动化测试套件，`npm test` 仍是占位脚本
- 发布链路主要面向 macOS
- 应用功能依赖本地 `claude` / `codex` CLI 的可用性与本地配置
- 某些体验细节会明显偏向桌面开发场景，而不是通用聊天客户端

## English

### Overview

CC Desktop Proxy is not a cloud relay service. It is a local desktop shell that runs on your machine and organizes local agent workflows around your repositories.

It:

- calls locally installed `claude` and/or `codex` CLIs directly
- keeps track of local workspaces, sessions, approvals, and Git changes
- brings multi-pane conversations, attachments, skills, approvals, and Git diff browsing into one desktop window

It is meant for developers who want to manage multiple repos and multiple agent conversations from a single GUI.

### Key Features

- Dual-provider conversations
  Use `Claude` and `Codex` in the same app. Each session can choose its provider before the conversation is locked in, and keeps its own model/mode/reasoning state.
- Multi-workspace, multi-pane UI
  Add multiple local repositories, split the window into multiple panes, and switch panes with keyboard shortcuts.
- Git diff window
  Inspect changed files, patches, line stats, and open the workspace or the selected file in your editor.
- Code editor integration
  The app detects common editors and lets you choose a default one. Local file links in messages can open directly in that editor.
- Session-level controls
  Manage provider, model, Claude mode, Codex reasoning effort, and Codex plan mode per conversation.
- Provider settings
  Configure provider enablement, provider-level system prompts, and local status refresh from settings.
- Slash commands
  Includes `/clear`, `/model`, `/provider`, `/theme`, `/mcp`, `/skills`, plus Claude-only `/mode` and Codex-only `/reasoning` with `/effort` compatibility.
- Skill discovery and installation
  Discover user, project, and system skills, and install local skills with `/skills install`.
- Approval workflow
  Surface CLI approval requests in the UI and remember workspace-level rules for repeated command or Codex write escalations.
- Attachments and rich messages
  Supports file picking, pasted files/images, Markdown rendering, copy buttons, and tool-activity rendering.
- Provider status dashboard
  Settings can show local Claude / Codex status summaries such as active model, usage metadata, auth mode, plan type, token usage, and rate limits.

### Stack

- Electron
- React 18
- Vite
- Tailwind CSS
- Radix UI
- Local CLI subprocess orchestration (`claude` / `codex`)

### Quick Start

#### 1. Prerequisites

- Install a recent Node.js LTS release and `npm`
- Install at least one local provider CLI:
  `claude` or `codex`
- If the binaries are not on `PATH`, point to them with environment variables
- Use macOS if you want the included packaging and icon-generation flow

#### 2. Install dependencies

```bash
npm install
```

#### 3. Run in development

```bash
npm run dev
```

This starts both:

- the Vite renderer
- the Electron main process

#### 4. Run the packaged app locally

```bash
npm run start
```

#### 5. Build the renderer

```bash
npm run build
```

### Environment Variables

Common variables for local development and runtime:

| Variable | Purpose | Default |
| --- | --- | --- |
| `CLAUDE_BIN` | Claude CLI executable path or command | `claude` |
| `CODEX_BIN` | Codex CLI executable path or command | `codex` |
| `CLAUDE_CONFIG_DIR` | Claude local config root | `~/.claude` |
| `CODEX_HOME` | Codex local config root | `~/.codex` |

For macOS release configuration, see:

- `.env.release.example`
- `build_release_info.md`

### Skill Directories

The app scans the following skill roots automatically:

- Claude user scope: `~/.claude/skills`
- Claude project scope: `<workspace>/.claude/skills`
- Codex user scope: `~/.codex/skills`
- Codex project scope: `<workspace>/.codex/skills`
- System scope: the `.system` subdirectory inside the roots above

Examples:

```bash
/skills list
/skills install ./path-to-skill --scope project
```

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development environment |
| `npm run start` | Build first, then launch Electron |
| `npm run build` | Build the renderer only |
| `npm run build:icon` | Generate macOS icon assets |
| `npm run dist:mac` | Build and package a macOS `.dmg` |
| `npm run dist:mac:dir` | Build and package a macOS `.app` directory |
| `npm run release:mac` | Run the macOS release flow with signing/notarization config |
| `npm run release:mac:check` | Validate release env vars without packaging |

### Slash Commands

| Command | Description |
| --- | --- |
| `/clear` | Start a fresh conversation |
| `/model <name>` | Set the current session model |
| `/provider claude|codex` | Switch the current session provider |
| `/theme light|dark|system` | Change the UI theme |
| `/mcp ...` | Forward MCP-related CLI commands |
| `/skills ...` | List or install skills |
| `/mode ...` | Switch Claude session mode |
| `/reasoning ...` | Switch Codex reasoning effort |
| `/effort ...` | Compatibility alias for `/reasoning` |

### Project Layout

```text
electron/    Electron main process, runtime, preload IPC bridge
src/         React renderer and reusable UI components
build/       macOS icons, entitlements, and packaging assets
scripts/     icon generation and macOS release scripts
dist/        built renderer output
release/     packaged application output
```

### Release Notes

The repository already includes a macOS packaging flow:

- `electron-builder`
- `.dmg` and `.app` targets
- `scripts/release-mac.mjs`
- `.env.release.local` for signing and notarization secrets

For a proper end-user release, you should prepare:

- signing config: `CSC_NAME` or `CSC_LINK` + `CSC_KEY_PASSWORD`
- notarization config:
  `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER`

See `.env.release.example` for the template.

### Current Limitations

- There is no real automated test suite yet; `npm test` is still a placeholder
- The release pipeline is primarily macOS-focused
- App behavior depends on locally installed `claude` / `codex` CLIs and their local config state
- The UX is intentionally optimized for developer workflows rather than a general-purpose chat client
