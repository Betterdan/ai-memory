---
description: 对指定文档做对抗性检查
argument-hint: <文档路径>
---

派发 critic subagent 检查 $ARGUMENTS:只给文档路径与 `.ai/skills/critic.md`,不携带对话历史。返回后逐条回应「接受并修改」或「有理由反驳」,不允许沉默跳过。
