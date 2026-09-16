# 决策记录

一条决策一个文件:`YYYY-MM-DD-<短标题>.md`。只记录会约束后续实现的决策,不记录日常选择。

被推翻的决策**标记为已取代并保留**,不要删除——删掉之后同一个方案会被重新提出来。

## 记录模板

```
---
type: decision
status: active
date: YYYY-MM-DD
---

# <决策标题>

## 决策

## 背景与约束

## 被否决的方案与否决理由

## 影响范围

（涉及的入口页与领域页链接）
```

被取代时把 frontmatter 改为:

```
status: superseded
superseded_by: YYYY-MM-DD-新决策.md
```
