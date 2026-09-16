# 业务领域页(横向视图)

每个业务领域一页:`<领域名>.md`。领域页承载**多个入口共用的规则**、无对外入口的后端行为,以及实体、数据归属和状态流转。

**提升规则**:规则首次出现时写在入口页;第二个入口也用到时提升到领域页,入口页原处改为链接。

页尾的横向视图由 `ai-memory kb build` 根据各入口页的 frontmatter 生成,请勿手工编辑。

## 页模板

复制以下结构新建 `<领域名>.md`:

```
---
type: domain
name: 订单
summary: 订单生命周期与状态流转
---

# 订单

> 最后更新:YYYY-MM-DD

## 领域职责

## 实体与数据归属

| 实体 | 业务含义 | 归属 | 状态流转 |
|---|---|---|---|

## 共用业务规则

（被多个入口引用的规则写在这里,入口页只链接不复制）

## 无对外入口的后端行为

---

以下由 ai-memory kb build 生成,请勿手工编辑:

## 关联入口

<!-- ai-memory:generated:related-entries:start -->
<!-- ai-memory:generated:related-entries:end -->

## 相关接口

<!-- ai-memory:generated:related-contracts:start -->
<!-- ai-memory:generated:related-contracts:end -->
```

「需求点历史」暂不生成:它需要每个需求点登记影响了哪些领域,等于给每次开发加一道手工登记,与「知识体量随系统规模增长而非开发次数增长」冲突。待有实际使用反馈后再评估。
