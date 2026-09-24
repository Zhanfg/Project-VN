# 数学公式编写规范

《放学后》的公式属于固定剧本内容，运行时不生成公式。作者在 WebGAL 场景脚本里写 TeX，构建阶段校验，APK 内使用本地 KaTeX 离线渲染。

## 行内公式

~~~text
旁白:电压、电流与电阻满足 <math>V=IR</math>。;
~~~

## 独立公式

~~~text
旁白:<math display>\tau = F r \sin\theta</math>;
~~~

公式标签内部的竖线不会被 WebGAL 当作换行分隔符，因此绝对值等写法可以直接使用：

~~~text
旁白:<math>|x|</math>;
~~~

## 约束

- 使用单个反斜杠书写标准 TeX，不需要为 WebGAL 再额外转义。
- 行内公式使用 `<math>...</math>`。
- 大公式、推导关键式使用 `<math display>...</math>`。
- 构建时会扫描全部 `game/scene/**/*.txt` 并调用固定版本 KaTeX 校验。
- 运行时 KaTeX、CSS 和字体全部随 APK 打包，不访问 CDN。
- 公式只负责数学排版；电路图、机械图、函数图等可视内容使用独立的图示系统。
