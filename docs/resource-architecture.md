# Resource Architecture

《放学后》从现在起按“未来数百 MB 到数 GB”设计，而不是把整个 `game/` 永久塞进一个不可拆发行包。

## 原则

1. 作者源文件不进入运行时。
2. 运行时每个文件都有 SHA-256、大小、类型、pack 与平台 delivery 元数据。
3. 核心包保持小；大背景、立绘、语音、BGM、视频属于可拆 media / chapter pack。
4. Windows 程序壳和游戏数据分离。
5. Android 目前仍可生成单 APK，但原生壳预留外部 `game-data` overlay；以后切换到章节包、PAD 或独立资源安装不需要改剧情路径。
6. 精确重复资源在 CI 报告，避免多份同内容文件长期堆积。

## 当前 packs

- `core`：场景、配置、UI、生成元数据。
- `media`：背景、立绘、音频、视频、动画。
- `vendor`：KaTeX 等小型运行时依赖。

分类在 `content/packs/packs.json`。以后可以直接增加：

- `chapter-01`
- `chapter-02`
- `voice-main`
- `extra-cg`
- `after-story`

而不用修改游戏脚本路径。

## Core budget

当前 `core` 硬预算为 128 MiB。达到预算时 CI 直接失败，要求把大资源移到独立 pack，而不是继续让核心膨胀。

这不是限制作品总大小；作品总资源可以远大于 1GB，限制的是“必须随程序一起存在的核心”。

## Runtime index

CI 生成：

`game/runtime/resource-index.json`

每项记录：

- logical path
- size
- SHA-256
- resource kind
- pack ID
- Android / Windows delivery

这份索引以后直接用于：

- 完整性检查
- 差量更新
- pack 下载 / 安装
- Steam depot 映射
- 缓存淘汰
- 重复资源定位

## Android

当前 APK 为兼容开发阶段仍内置现有内容；Android 壳同时支持：

`filesDir/game-data/<logical path>`

作为外部覆盖层。

查找顺序：

1. 外部 `game-data`
2. APK 内置 assets

因此以后一个章节从 APK 拆出去时，WebGAL 中仍然引用原来的逻辑路径，不需要重写剧本。

## Windows

Windows 使用 Tauri 2。目标结构：

~~~text
AfterSchool.exe
engine/
game-data/
  config.txt
  scene/
  background/
  figure/
  bgm/
  ...
~~~

程序壳不把 GB 级资源编进 exe。Windows 构建首先生成同一份 WebGAL 核心，然后把 `game/` 数据独立放入 artifact。以后切 Steam 时可以直接把不同 pack 映射到不同 depot。

## 媒体格式

默认建议：

- 背景 / CG：WebP；需要更高压缩时再评估 AVIF。
- 立绘：WebP alpha，避免无意义 PNG。
- BGM：Opus/Ogg，保留无损母带在作者资产区。
- 语音：Opus/Ogg。
- 视频：WebM/VP9 或兼容性验证后的 AV1；不要把制作母版塞进 runtime。
- 字体：WOFF2。

不在 CI 无损转码大型媒体；转码属于制作管线，发行 CI 只验证最终 runtime 文件。
