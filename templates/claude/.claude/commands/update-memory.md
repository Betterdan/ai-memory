---
description: 主动总结当前进展并按路由写入 .ai/memory/
---

按 `.ai/skills/memory-update.md` 执行:
1. 读 `.ai/memory/MEMORY.md` 和本次内容可能写入的目标文件
2. 先区分用户级、项目级、功能级或一次性信息，再按写入路由更新
3. 只有满足工程节点触发条件时才追加 session-log；不要每次调用都制造流水
4. 用户画像只记录明确确认的长期信息，协作规范只记录可复用的明确反馈
