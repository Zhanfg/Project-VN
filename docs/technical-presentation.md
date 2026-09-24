# Technical Presentation Layer

《放学后》的知识内容全部由固定剧本驱动。技术层负责把预先写好的代码、终端记录、算法 Trace、图表和结构图变成适合视觉小说的演出；成品 APK 不在运行时生成知识内容。

## 第一批视图

- **CodeView**：构建期使用 Shiki 4.4.3 做 TextMate 语法高亮；运行时只显示静态 HTML，并支持逐步高亮行。
- **TerminalView**：轻量自研，固定区分 command / stdout / stderr / warning / comment，不引入真正 shell。
- **AlgorithmView**：显示数组、索引、活动区间和预先生成的算法步骤。
- **PlotView**：第一版使用确定性 SVG 生成器，适合波形、函数和实验曲线。
- **DiagramView**：第一版使用确定性 SVG 节点/边模型，适合流程图、状态机和简单系统架构。

## 剧本指令

显示：

~~~text
tech:show -kind=code -src=code/blink -placement=right -step=0;
~~~

切换步骤：

~~~text
tech:step -step=1;
~~~

隐藏：

~~~text
tech:hide;
~~~

清空：

~~~text
tech:clear;
~~~

支持的 `kind`：

- `code`
- `terminal`
- `algorithm`
- `plot`
- `diagram`

支持的 `placement`：

- `left`
- `right`
- `center`
- `full`

## 内容生产

作者源文件放在 `content/technical/`。CI 会：

1. 固定安装 Shiki 4.4.3。
2. 把代码高亮、图表和结构图预编译成轻量 JSON/SVG。
3. 输出到 `game/technical/generated/`。
4. 校验每个生成内容至少含一个可播放步骤。
5. 把 Technical Layer 注入固定版本 WebGAL 后再构建 APK。

生成目录不提交 Git。

## 依赖策略

- **xterm.js** 暂不接入：它面向真实终端仿真，而当前 TerminalView 只需要确定性剧情重放。
- **Mermaid** 暂不作为 APK 运行时依赖：复杂 UML/时序图以后优先在构建阶段转 SVG。
- **Observable Plot** 暂不作为 APK 运行时依赖：前期图表直接生成 SVG 更轻；需要复杂统计图后再提升制作端能力。

技术画面状态存入 WebGAL Stage State，所以它与普通舞台状态一起参与存档、回溯和恢复。
