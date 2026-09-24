# Project VN

> 临时项目名。最终作品名确定后统一替换。

一个通过持续对话共同创作的视觉小说项目，使用 **WebGAL** 作为运行时，并通过 GitHub Actions 自动生成可安装的 Android APK。

## 当前状态

- WebGAL：固定到 4.6.5 对应提交
- Android：使用官方 WebGAL-Android 模板的固定提交
- Android 包名：`io.github.zhanfg.projectvn`
- 构建产物：`Project-VN-debug.apk`

## 目录

- `story/`：世界观、剧情大纲、时间线、文风规则
- `characters/`：角色档案
- `game/`：WebGAL 游戏内容和素材
- `.github/workflows/build-android.yml`：Android APK 自动构建

## 开发方式

剧情与设定先进入 `story/` 和 `characters/`，确认后同步落到 `game/scene/`。图片、立绘、CG、BGM 和语音分别放入 `game/` 对应素材目录。

每次提交都会触发 Android Debug APK 构建。正式发行签名流程会在作品进入可发布阶段后单独加入，签名密钥不会写入仓库。

## 上游

- WebGAL: https://github.com/OpenWebGAL/WebGAL
- WebGAL-Android: https://github.com/OpenWebGAL/WebGAL-Android
