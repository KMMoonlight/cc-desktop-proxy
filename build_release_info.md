# Build Release Info

## 当前已配置的打包能力

- 已接入 `electron-builder`
- 已配置 macOS `.dmg` 打包
- 已配置应用图标生成脚本
- 当前默认产出为 `arm64` mac 安装包

## 相关文件

- 打包配置: `package.json`
- 图标源文件: `build/icon.svg`
- 图标导出脚本: `scripts/build-mac-icon.mjs`
- 一键发布脚本: `scripts/release-mac.mjs`
- 发布环境变量模板: `.env.release.example`
- 生成的 mac 图标: `build/icon.icns`

## 常用命令

### 1. 构建前端

```bash
npm run build
```

### 2. 仅生成图标

```bash
npm run build:icon
```

这个命令会生成:

- `build/icon.png`
- `build/icon.icns`

### 3. 生成 macOS DMG 安装包

```bash
npm run dist:mac
```

这个命令会依次执行:

1. `npm run build`
2. `npm run build:icon`
3. `electron-builder --mac dmg`

### 4. 仅生成 `.app` 目录

```bash
npm run dist:mac:dir
```

这个命令适合本地先验证应用能否正常启动。

### 5. 一键发布打包

```bash
npm run release:mac
```

这个脚本会:

1. 读取 `.env.release.local`
2. 校验正式签名配置
3. 校验 notarization 配置
4. 执行前端构建
5. 执行图标生成
6. 执行正式 mac 打包

只做检查但不打包:

```bash
npm run release:mac:check
```

只生成 `.app` 目录:

```bash
npm run release:mac -- --dir
```

指定架构:

```bash
npm run release:mac -- --arch arm64
npm run release:mac -- --arch x64
npm run release:mac -- --arch universal
```

## 打包产物位置

默认输出目录:

- `release/`

典型产物:

- `release/CLI Proxy-1.0.0-arm64.dmg`
- `release/mac-arm64/CLI Proxy.app`

## 图标生成说明

图标设计源文件是:

- `build/icon.svg`

图标导出脚本会在 macOS 上调用系统工具:

- `qlmanage`
- `sips`
- `iconutil`

生成流程:

1. 先把 `SVG` 栅格化成 `1024x1024 PNG`
2. 再生成 `icon.iconset`
3. 最后导出 `build/icon.icns`

## 使用环境要求

- 需要在 macOS 上执行
- 需要本机可用 `npm`
- 需要安装项目依赖

首次拉起项目后建议先执行:

```bash
npm install
```

## 当前状态

- 已成功生成图标
- 已成功生成 macOS `.dmg`

当前已验证产物:

- `release/CLI Proxy-1.0.0-arm64.dmg`

## 注意事项

- 当前打包使用的是 `ad-hoc` 签名
- 当前没有配置 Apple notarization
- 本机安装测试通常没问题
- 如果要发给其他用户，建议继续接入正式签名和公证

## 正式签名 + notarization

### 目标

如果要把安装包发给其他用户，建议至少做到下面两件事:

1. 使用 `Developer ID Application` 证书进行正式签名
2. 使用 Apple notarization 对 `.dmg` 进行公证

当前项目已经使用 `electron-builder`，只要签名证书和 Apple 凭据准备好，继续执行:

```bash
npm run release:mac
```

即可沿用现有打包流程。

### 一、准备签名证书

你需要加入 Apple Developer Program，并在 Apple Developer 账号下准备:

- `Developer ID Application` 证书

在本机开发环境里，最直接的做法是:

1. 把证书导入 macOS Keychain
2. 确保证书在 `login` keychain 中可用
3. 让 `electron-builder` 自动发现证书

如果本机有多个可用证书，也可以显式指定:

```bash
export CSC_NAME="Developer ID Application: Your Name (TEAMID)"
```

如果是 CI 或不想依赖本机钥匙串，也可以使用 `.p12`:

```bash
export CSC_LINK="/absolute/path/to/DeveloperID.p12"
export CSC_KEY_PASSWORD="your-p12-password"
```

建议先复制模板文件:

```bash
cp .env.release.example .env.release.local
```

然后把你自己的证书和 notarization 凭据填进去。

### 二、推荐的 notarization 方式

推荐优先使用 `App Store Connect API Key`，而不是旧的账号密码方式。

原因:

- 更适合自动化
- 密钥权限边界更清晰
- `electron-builder` 官方也更推荐这一组变量

你需要准备:

- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

示例:

```bash
export APPLE_API_KEY="/absolute/path/to/AuthKey_ABC1234567.p8"
export APPLE_API_KEY_ID="ABC1234567"
export APPLE_API_ISSUER="01234567-89ab-cdef-0123-456789abcdef"
```

然后直接执行:

```bash
npm run release:mac
```

只要签名证书也可用，`electron-builder` 就会在构建后自动尝试 notarization。

### 三、备选方式: notarytool keychain profile

如果你不想使用 API Key，也可以使用 `notarytool` 的 keychain profile。

先把凭据存入 keychain:

```bash
xcrun notarytool store-credentials "cli-proxy-notary" \
  --apple-id "your-apple-id@example.com" \
  --team-id "TEAMID1234" \
  --password "app-specific-password"
```

然后设置环境变量:

```bash
export APPLE_KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
export APPLE_KEYCHAIN_PROFILE="cli-proxy-notary"
```

再执行:

```bash
npm run release:mac
```

### 四、Apple ID + app-specific password 方式

这是 `electron-builder` 支持的另一种方式，但一般不如 API Key 推荐。

```bash
export APPLE_ID="your-apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="TEAMID1234"
```

然后执行:

```bash
npm run release:mac
```

### 五、建议的本机发布流程

```bash
npm install
cp .env.release.example .env.release.local
# 编辑 .env.release.local，填入真实证书和 Apple 凭据
npm run release:mac
```

### 六、打包完成后的验证命令

验证签名:

```bash
codesign -dv --verbose=4 "release/mac-arm64/CLI Proxy.app"
```

验证 Gatekeeper:

```bash
spctl -a -vvv "release/mac-arm64/CLI Proxy.app"
```

验证 notarization stapling:

```bash
xcrun stapler validate "release/CLI Proxy-1.0.0-arm64.dmg"
```

如果想给 `.app` 本体做 stapler 校验，也可以执行:

```bash
xcrun stapler validate "release/mac-arm64/CLI Proxy.app"
```

### 七、失败排查

如果 notarization 失败，优先检查:

- 签名证书是否是 `Developer ID Application`
- `TEAM ID` 是否正确
- `APPLE_*` 环境变量是否配置完整
- 构建机时间是否正常
- 是否误用了过期凭据

如果你使用的是 `notarytool` profile 方式，可以下载日志:

```bash
xcrun notarytool history --keychain-profile "cli-proxy-notary"
```

或者按返回的 submission id 拉日志:

```bash
xcrun notarytool log <submission-id> --keychain-profile "cli-proxy-notary" notarization-log.json
```

### 八、额外说明

- Apple 已在 `2023-11-01` 后停止支持 `altool` 对 notary service 的调用，后续应使用 `notarytool`
- 当前项目文档默认按 `arm64` 产物说明
- 如果后续要打 `universal` 或 `x64`，产物文件名会变化，但签名 / 公证流程不变

## 后续可选增强

- 增加 `universal` 包
- 增加 `x64` 包
- 自定义 DMG 背景图和窗口布局
