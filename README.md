# 放学后

> 副标题仍在确定中。

一部以高中社团为舞台、把工程、计算机科学、算法、数学、物理等知识自然写进剧情的长篇视觉小说。作品本体是完全预写、确定性的传统 VN；制作阶段可以使用辅助工具，但 APK 运行时不依赖 AI 或在线模型。

## 当前状态

- WebGAL：固定到 4.6.5 对应提交
- Android：使用官方 WebGAL-Android 模板的固定提交
- KaTeX：固定到 0.18.7，随 APK 离线打包
- Shiki：固定到 4.4.3，仅在构建期生成代码高亮
- Android applicationId：`io.github.zhanfg.afterschool`
- Debug 构建产物：`AfterSchool-debug.apk`

## 目录

- `story/`：世界观、剧情大纲、时间线、文风规则
- `characters/`：角色档案
- `content/technical/`：代码、终端、算法、图表、结构图等作者源文件
- `engine/technical-layer/`：作品级 Technical Presentation Layer
- `game/`：WebGAL 游戏内容和素材
- `docs/math-authoring.md`：公式编写规范
- `docs/technical-presentation.md`：技术内容编写规范
- `tools/patch-webgal-math.mjs`：公式渲染扩展
- `tools/patch-webgal-tech.mjs`：技术内容层扩展
- `tools/build-technical-content.mjs`：构建技术演示资产
- `.github/workflows/build-android.yml`：Android APK 自动构建

## 公式

剧本可以直接使用固定 TeX：

`<math>V=IR</math>`

以及独立公式：

`<math display>\tau = F r \sin\theta</math>`

构建时会对所有场景公式做语法校验；KaTeX、CSS 和字体全部进入 APK，不使用 CDN。

## Technical Presentation Layer

第一批支持 CodeView、TerminalView、AlgorithmView、PlotView 和 DiagramView。

例如：

`tech:show -kind=code -src=code/blink -placement=right -step=0;`

随后可通过 `tech:step` 推进预先写好的演示步骤。技术画面状态与 WebGAL Stage State 一起存档和恢复。

## 开发方式

剧情与设定先进入 `story/` 和 `characters/`，确认后同步落到 `game/scene/`。技术素材源文件放在 `content/technical/`，由构建脚本生成播放器使用的轻量 JSON/SVG。

PR 会构建 Android Debug APK；合并到 `main` 后再次构建主线 APK。正式发行签名流程会在作品进入可发布阶段后单独加入，签名密钥不会写入仓库。

## 上游

- WebGAL: https://github.com/OpenWebGAL/WebGAL
- WebGAL-Android: https://github.com/OpenWebGAL/WebGAL-Android
- KaTeX: https://github.com/KaTeX/KaTeX
- Shiki: https://github.com/shikijs/shiki
