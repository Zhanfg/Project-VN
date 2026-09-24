# 放学后

> 副标题仍在确定中。

一部以高中社团为舞台、把工程、计算机科学、算法、数学、物理等知识自然写进剧情的长篇视觉小说。作品本体是完全预写、确定性的传统 VN；制作阶段可以使用辅助工具，但 APK 运行时不依赖 AI 或在线模型。

## 当前状态

- WebGAL：固定到 4.6.5 对应提交
- Android：使用官方 WebGAL-Android 模板的固定提交
- Windows：Tauri 2 轻量壳，程序与 `game-data/` 分离
- KaTeX：固定到 0.18.7，随 APK 离线打包
- Shiki：固定到 4.4.3，仅在构建期生成代码高亮
- Android applicationId：`io.github.zhanfg.afterschool`
- Android Debug 构建产物：`AfterSchool-debug.apk`
- Windows 构建产物：`AfterSchool-Windows-portable`

## 目录

- `story/`：世界观、剧情大纲、时间线、文风规则
- `characters/`：角色档案
- `content/technical/`：代码、终端、算法、图表、结构图、电路、仪器和协议等作者源文件
- `content/vn/registry.json`：开放式路线 / 分支 / 结局 / 章节注册表
- `content/packs/packs.json`：跨平台资源 pack 与体积预算
- `platform/windows/`：Windows Tauri 壳
- `engine/technical-layer/`：作品级 Technical Presentation Layer
- `game/`：WebGAL 游戏内容和素材
- `docs/math-authoring.md`：公式编写规范
- `docs/technical-presentation.md`：技术内容编写规范
- `docs/vn-feature-audit.md`：VN/Galgame 功能审计与作品级路线图
- `docs/vn-registry.md`：开放式 VN 元数据与章节选择规则
- `docs/resource-architecture.md`：面向 GB 级内容的资源架构
- `tools/patch-webgal-math.mjs`：公式渲染扩展
- `tools/patch-webgal-tech.mjs`：技术内容层扩展
- `tools/build-technical-content.mjs`：构建技术演示资产
- `.github/workflows/build-android.yml`：共享 WebGAL runtime + Android / Windows 自动构建

## 公式

剧本可以直接使用固定 TeX：

`<math>V=IR</math>`

以及独立公式：

`<math display>\tau = F r \sin\theta</math>`

构建时会对所有场景公式做语法校验；KaTeX、CSS 和字体全部进入 APK，不使用 CDN。

## Technical Presentation Layer

当前支持 CodeView、TerminalView、AlgorithmView、PlotView、DiagramView、CircuitView、InstrumentView 和 ProtocolView。

例如：

`tech:show -kind=code -src=code/blink -placement=right -step=0;`

随后可通过 `tech:step` 推进预先写好的演示步骤。技术画面状态与 WebGAL Stage State 一起存档和恢复。

## 倒计时选择

普通选择继续使用 WebGAL `choose`。需要压力的剧情可以写：

`choose:立刻切断电源:safe|继续观察:wait -timeout=6 -timeoutChoose=1;`

倒计时在菜单、回想和应用后台暂停；超时分支由作者明确指定。

## 开放式 VN Registry

当前路线、分支、结局和章节注册表可以保持为空，不要求现在就锁剧情。以后统一用：

`vn:mark -kind=任意类别 -id=稳定ID;`

记录全局进度。章节选择器通过：

`vn:chapterSelect;`

打开。章节尚未接 scene 时会显示为 `PLANNED`，不会阻止构建。

## 大型资源架构

从现在起运行时资源都会生成 SHA-256 / 大小 / pack / 平台交付方式索引。核心运行时设有 **128 MiB 硬预算**；作品总内容可以继续增长到数百 MB 或数 GB，但大媒体和未来章节包不能无限塞进 core。

Windows 构建采用：

`AfterSchool.exe + game-data/`

分离布局；Android 目前仍提供单 APK 方便测试，同时原生壳已预留 `filesDir/game-data/` 外部资源覆盖层，后续拆章节包无需修改剧情中的逻辑资源路径。

CI 只构建一次 WebGAL runtime，然后并行产出 Android APK 与 Windows portable，避免多平台重复做资源生成、哈希和前端编译。

## 开发方式

剧情与设定先进入 `story/` 和 `characters/`，确认后同步落到 `game/scene/`。技术素材源文件放在 `content/technical/`，由构建脚本生成播放器使用的轻量 JSON/SVG。

PR 会先构建一次共享 WebGAL runtime，再并行验证 Android Debug APK 与 Windows portable；合并到 `main` 后再次执行双平台主线构建。正式发行签名流程会在作品进入可发布阶段后单独加入，签名密钥不会写入仓库。

## 上游

- WebGAL: https://github.com/OpenWebGAL/WebGAL
- WebGAL-Android: https://github.com/OpenWebGAL/WebGAL-Android
- KaTeX: https://github.com/KaTeX/KaTeX
- Shiki: https://github.com/shikijs/shiki
