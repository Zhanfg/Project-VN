# 放学后

> 副标题仍在确定中。

一部以高中社团为舞台、把工程、计算机科学、算法、数学、物理等知识自然写进剧情的长篇视觉小说。作品本体是完全预写、确定性的传统 VN；制作阶段可以使用辅助工具，但 APK 运行时不依赖 AI 或在线模型。

## 当前状态

- WebGAL：固定到 4.6.5 对应提交
- Android：使用官方 WebGAL-Android 模板的固定提交
- KaTeX：固定到 0.18.7，随 APK 离线打包
- Android applicationId：`io.github.zhanfg.afterschool`
- Debug 构建产物：`AfterSchool-debug.apk`

## 目录

- `story/`：世界观、剧情大纲、时间线、文风规则
- `characters/`：角色档案
- `game/`：WebGAL 游戏内容和素材
- `docs/math-authoring.md`：公式编写规范
- `patches/`：针对固定 WebGAL 版本的作品级扩展
- `tools/`：构建期内容检查
- `.github/workflows/build-android.yml`：Android APK 自动构建

## 公式

剧本可以直接使用固定 TeX：

`<math>V=IR</math>`

以及独立公式：

`<math display>\tau = F r \sin\theta</math>`

构建时会对所有场景公式做语法校验；KaTeX、CSS 和字体全部进入 APK，不使用 CDN。详细规则见 `docs/math-authoring.md`。

## 开发方式

剧情与设定先进入 `story/` 和 `characters/`，确认后同步落到 `game/scene/`。图片、立绘、CG、BGM 和语音分别放入 `game/` 对应素材目录。

每次提交都会触发 Android Debug APK 构建。正式发行签名流程会在作品进入可发布阶段后单独加入，签名密钥不会写入仓库。

## 上游

- WebGAL: https://github.com/OpenWebGAL/WebGAL
- WebGAL-Android: https://github.com/OpenWebGAL/WebGAL-Android
- KaTeX: https://github.com/KaTeX/KaTeX
