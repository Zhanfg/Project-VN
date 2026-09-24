# Technical Presentation Layer

《放学后》的知识内容全部由固定剧本驱动。技术层负责把预先写好的代码、终端记录、算法 Trace、图表、电路、仪器和协议过程变成适合视觉小说的演出；成品 APK 不在运行时生成知识内容。

## 当前视图

- **CodeView**：构建期使用 Shiki 4.4.3 做 TextMate 语法高亮；运行时只显示静态 HTML，并支持逐步高亮行。
- **TerminalView**：轻量自研，固定区分 command / stdout / stderr / warning / comment，不引入真正 shell。
- **AlgorithmView**：显示数组、索引、活动区间和预先生成的算法步骤。
- **PlotView**：确定性 SVG，适合波形、函数和实验曲线。
- **DiagramView**：确定性 SVG 节点/边模型，适合流程图、状态机和系统架构。
- **CircuitView**：有元件与 net 语义的确定性原理图；每一步可以聚焦元件或网络。
- **InstrumentView**：固定支持万用表、示波器和逻辑分析仪。
- **ProtocolView**：显示通信参与者、消息方向、字段解码与逐步协议过程。

## 剧本指令

所有视图统一使用同一套指令：

~~~text
tech:show -kind=circuit -src=circuit/esp32-led -placement=center -step=0;
tech:step -step=1;
tech:hide;
tech:clear;
~~~

支持的 `kind`：

- `code`
- `terminal`
- `algorithm`
- `plot`
- `diagram`
- `circuit`
- `instrument`
- `protocol`

支持的 `placement`：

- `left`
- `right`
- `center`
- `full`

技术画面状态存入 WebGAL Stage State，所以它与普通舞台状态一起参与存档、回溯和恢复。

## CircuitView

当前作者格式位于 `content/technical/circuit/*.tech.json`，包含：

- `components`：元件 id、显示名、值和布局。
- `wires`：wire id、net 名和折线路径。
- `focusComponents`：本步骤需要强调的元件。
- `focusNets`：本步骤需要强调的网络。

构建后 SVG 会保留：

- `data-component-id`
- `data-net`

因此后续可以继续做测量点、流向动画、鼠标检查和 KiCad netlist 映射，而不必把电路退化成普通图片。

### KiCad 上游

正式复杂电路仍以 KiCad 工程作为推荐源。目标生产线是：

~~~text
.kicad_sch
   ├─ ERC
   ├─ SVG
   └─ netlist
        ↓
CircuitView semantic payload
~~~

当前版本先把 CircuitView 的运行时语义和构建格式固定下来；之后接入真实 `.kicad_sch` 时，不需要改 VN 剧本 API。

## InstrumentView

`instrument` 当前支持：

- `multimeter`
- `oscilloscope`
- `logic-analyzer`

数据全部预写。例如示波器的 channel 只保存采样点，播放器负责画网格与 trace；逻辑分析仪同样只播放预制数字采样序列。

它不是虚构的“万能仪表”，而是为了让剧情能自然表达：

1. 测哪里。
2. 得到什么读数。
3. 为什么换另一种仪器。
4. 新仪器比前一种仪器多暴露了什么信息。

## ProtocolView

每个步骤包含：

- `participants`
- `messages`
- `fields`
- `caption`

适合 I²C、SPI、UART、CAN、USB、BLE、TCP、HTTP 等逐步过程。协议字段与剧情步骤绑定，因此可以先看消息方向，再展开字节、标志位、地址、序号等细节。

## 内容生产

作者源文件放在 `content/technical/`。CI 会：

1. 固定安装 Shiki 4.4.3。
2. 把代码高亮、图表、结构图和电路预编译成轻量 JSON/SVG。
3. 校验 Instrument/Protocol 固定步骤。
4. 输出到 `game/technical/generated/`。
5. 校验每个生成内容至少含一个可播放步骤。
6. 把 Technical Layer 注入固定版本 WebGAL 后再构建 APK。

生成目录不提交 Git。

## 依赖策略

- **xterm.js** 暂不接入：TerminalView 是确定性剧情重放，不需要真实终端模拟器。
- **Mermaid** 暂不作为 APK 运行时依赖：复杂 UML/时序图优先在构建阶段转 SVG。
- **Observable Plot** 暂不作为 APK 运行时依赖：需要复杂统计图时再提升制作端能力。
- **KiCad** 是电路制作端上游，不作为 Android APK 运行时依赖。
