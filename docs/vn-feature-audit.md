# VN / Galgame Feature Audit

《放学后》使用 WebGAL 作为基础 VN 引擎，但项目本身还需要一层作品级规则。这里区分“引擎已经提供”和“作品尚需设计/扩展”。

## 已有底座，可直接使用

- 普通选择与条件选择
- 存档 / 读档
- 快速存档 / 快速读档
- 回想 / Backlog
- 自动播放 / 快进
- 流程图
- CG 鉴赏
- BGM 鉴赏
- 立绘、背景、动画、视频、BGM、SE、语音
- 文本速度、自动速度、音量等设置

这些功能不需要重新造轮子，重点是确定《放学后》的内容规则与 UI 风格。

## 当前新增：Timed Choice

语法：

~~~text
choose:立刻切断电源:safe|继续观察:wait -timeout=6 -timeoutChoose=1;
~~~

- `timeout`：秒，可以是小数。
- `timeoutChoose`：超时后自动选择的 1-based 原始选项序号。
- 普通 choose 不带参数时行为完全不变。
- 打开设置、存档、读档、流程图、回想、全局对话框或切到后台时倒计时暂停。
- 超时分支必须由作者显式指定，运行时不猜。
- 回溯或读档重新进入该选择时，倒计时重新开始；不会按现实墙钟继续扣时间。

倒计时选项只用于需要压力的剧情：比赛、故障、事故、抢修、限时调试、现场决策。普通剧情选择继续使用无限时选择。

## 还需要补的作品级系统

### 1. Route / Branch Metadata

不仅记录“跳到了哪里”，还要记录：

- 所属主线 / 支线 / 番外
- 是否属于人物线
- 是否是知识支路
- 前置条件
- 解锁条件
- 是否可从章节选择直接重播

这会成为章节树、流程图和结局管理的共同数据源。

### 2. Ending Registry

需要独立记录：

- Normal End
- Bad End / Failure End
- Extra End
- After Story 解锁
- 已达成结局
- 首次达成时间
- 是否解锁特定 CG / BGM / 番外

《放学后》不一定采用传统恋爱路线结局，但工程失败、比赛结果、项目完成方式很适合做多种结局。

### 3. Choice History

建议记录：

- 玩家以前是否选过此项
- 是否已经看过该分支
- 是否允许 UI 显示“已选择”或“已读”

默认不显示后果，只做轻量视觉提示，避免把 VN 变成攻略工具。

### 4. Chapter / Episode Select

流程图和章节选择不是同一件事。

章节选择应面向读者：

- 序章
- 正篇章节
- 幕间
- 支线
- 番外
- 外传
- After Story

流程图用于查看分歧，章节选择用于快速重读。

### 5. Knowledge Notebook

这是《放学后》最重要的非传统 VN 系统之一。

它不是教材目录，而是在剧情中解锁：

- 概念
- 公式
- 电路
- 代码片段
- 实验记录
- 仪器说明
- 参考资料

玩家可以回看，但主线绝不要求从 Notebook 才能理解剧情。

### 6. Scene Replay

对关键场景提供独立重播：

- 比赛现场
- 重大 Debug
- 关键实验
- CG 场景
- 高密度技术演示

重播应与正式存档分离。

### 7. Local Achievements / Milestones

Android 版不应依赖 Steam Achievement。可做本地里程碑：

- 第一次完成电路
- 第一次找到真正根因
- 第一次完成 PCB
- 完成某知识支线
- 解锁所有失败结局

### 8. Chapter Card / Time / Location Overlay

Galgame 常见但我们尚未作品化：

- 日期
- 时间
- 地点
- 章节标题
- 项目阶段
- 比赛倒计时

这些比频繁旁白“第二天到了学校”更有演出感。

### 9. Choice Presentation Variants

除了普通菜单与 Timed Choice，还可以逐步增加：

- 两难二选一的大按钮
- 多项快速判断
- 隐藏 / 条件选项
- 已读分支提示
- 图片 / 热区选择
- 技术现场的“操作选择”

所有选择仍然是作者预写，不做自由输入式 AI 互动。

## 实现优先级

近期：

1. Timed Choice
2. Route / Branch Metadata
3. Ending Registry
4. Chapter / Episode Select
5. Knowledge Notebook

中期：

6. Choice History
7. Scene Replay
8. Local Milestones
9. Chapter Card / Time / Location Overlay

后期：

10. 图片 / 热区选择
11. 少量特殊 QTE
12. 更复杂的收藏与全成就系统
