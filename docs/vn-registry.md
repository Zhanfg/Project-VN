# Open VN Registry

这一层只负责“作品结构”，不负责替我们决定剧情。

当前正式注册表：

`content/vn/registry.json`

初始状态允许四个数组全部为空：

~~~json
{
  "version": 1,
  "routes": [],
  "branches": [],
  "endings": [],
  "chapters": []
}
~~~

## 为什么保持开放

现在人物线、主线结构、项目线、番外和最终结局都还没有锁定，因此：

- `kind` 是普通字符串，不做枚举限制。
- 大部分字段都是可选的。
- 路线/章节可以先登记，稍后再补 target。
- 暂时缺少 route 引用只产生 CI warning，不会阻止构建。
- 注册表可以为空，运行时章节选择器会正常显示“尚未登记章节”。

只有会让数据本身无法稳定识别的问题才会阻断 CI，例如重复 ID、非法 ID、字段类型错误。

## 通用进度标记

使用统一命令：

~~~text
vn:mark -kind=chapter -id=prologue;
vn:mark -kind=ending -id=normal-01;
vn:mark -kind=branch -id=debug-route-a;
vn:mark -kind=route -id=main;
vn:mark -kind=knowledge -id=ohms-law;
~~~

`kind` 可以是以后新增的任意类别，不需要改引擎。

标记写入全局用户进度，不跟随某一个存档回退；第一次标记还会记录本地首次达成时间。

## Route

最低只需要 ID：

~~~json
{
  "id": "main"
}
~~~

之后可以逐步补：

~~~json
{
  "id": "main",
  "title": "主线",
  "kind": "main",
  "tags": ["school", "club"],
  "meta": {
    "note": "剧情尚未确定时可以自由放项目级元数据"
  }
}
~~~

## Branch

~~~json
{
  "id": "branch-example",
  "title": "临时支路",
  "kind": "side",
  "routeId": "main",
  "tags": ["optional"]
}
~~~

`routeId` 暂时不存在时只 warning。

## Ending

~~~json
{
  "id": "ending-example",
  "title": "暂定结局",
  "kind": "custom",
  "routeId": "main",
  "meta": {
    "final": false
  }
}
~~~

系统不限定 Normal / Bad / True / Extra。需要什么类型，后面由剧情自己定义。

## Chapter

最小章节：

~~~json
{
  "id": "chapter-01",
  "title": "暂定章节"
}
~~~

此时章节选择器会显示该项目，但因为没有 target，会标为 `PLANNED`，不能跳转。

接上剧情后：

~~~json
{
  "id": "chapter-01",
  "title": "第一章",
  "subtitle": "副标题可选",
  "kind": "main",
  "group": "正篇",
  "order": 10,
  "routeId": "main",
  "target": {
    "scene": "chapter01.txt"
  }
}
~~~

也可以指向当前场景 label：

~~~json
{
  "target": {
    "label": "chapter01"
  }
}
~~~

## 解锁

默认情况下章节是开放的，方便当前开发期直接测试。

需要锁定时显式写：

~~~json
{
  "id": "extra-01",
  "title": "番外",
  "lockedByDefault": true,
  "unlock": {
    "kind": "ending",
    "id": "ending-example"
  }
}
~~~

然后剧情达成结局时：

~~~text
vn:mark -kind=ending -id=ending-example;
~~~

章节就会解锁。

还可以使用表达式：

~~~json
{
  "lockedByDefault": true,
  "unlockWhen": "someGlobalFlag==true"
}
~~~

可用的开放字段：

- `visibleWhen`：是否显示
- `unlockWhen`：是否解锁
- `enabledWhen`：已显示且已解锁后，是否允许进入
- `hiddenUntilUnlocked`：锁定时彻底隐藏
- `tags`
- `meta`
- 其他自定义字段：构建器会原样保留

## Chapter Select

剧情里打开：

~~~text
vn:chapterSelect;
~~~

只看某个 group：

~~~text
vn:chapterSelect -group=番外;
~~~

现在还没有正式剧情时，注册表保持空即可。等故事结构开始稳定，再逐个把正式章节、路线和结局加进去。
