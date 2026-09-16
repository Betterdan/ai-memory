# 对外入口页(主视图)

每个入口分组一页:`<分组名>.md`。分组粒度对应 `docs/architecture/interfaces.md` 登记的入口形态,例如一组 API、一个页面模块、一类事件、一组 CLI 命令。**不要一个接口一页。**

入口页描述**语义**;接口**形状**(字段、类型、状态码)只放在契约文件里,本页只引用。

frontmatter 供 `ai-memory kb build` 生成索引与领域页横向视图,字段规范见 `.ai/skills/knowledge-structure.md`。

## 页模板

复制以下结构新建 `<分组名>.md`:

```
---
type: entry
group: 订单 API
form: API 分组
summary: 下单、改单与取消
contract: docs/api/orders.yaml
domains: [订单, 支付]
---

# 订单 API

> 最后更新:YYYY-MM-DD

## 这组入口负责什么

## 行为与规则

（只写本组特有的规则;多个入口共用的规则放到 ../domains/ 并在此链接,不复制内容）

| 行为 | 触发条件 | 可观察结果 | 失败表达 |
|---|---|---|---|

## 副作用、幂等与调用顺序

## 相关领域

- [订单](../domains/订单.md)
```
