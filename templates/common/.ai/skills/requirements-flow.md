# 需求定稿流程(draft → final)

触发:用户要求新建/定稿需求,或 /new-requirement、/finalize-requirement。

## 新建(new)

1. 确认目标版本目录 `docs/requirements/vX.Y.Z/`(不存在则创建 draft/ 与 final/)
2. 在 `draft/<需求名>.md` 生成骨架:背景 / 想要什么 / 不确定的点
3. 在 `.ai/memory/project-state.md` 需求进度表登记一行(状态 draft)

## 定稿(finalize)

1. 读 `draft/<需求名>.md`
2. 逐个澄清模糊点:一次只问一个问题,优先选择题
3. 按固定结构成稿:**目标 / 范围(必须含「不做什么」)/ 接口契约(格式见 architecture.md)/ 验收标准 / 开放问题**
4. 强制 critic 门:按 `critic.md` 检查,逐条回应完毕才可写入 `final/<需求名>.md`
5. 联动记忆:project-state 状态改 finalized;`features/<需求名>.md` 建档登记契约要点;MEMORY.md 加索引行
6. 需求文档与记忆变更一起 commit

## 与 superpowers 的衔接

实现阶段由 brainstorming/writing-plans 以 `final/<需求名>.md` 为输入。
本流程只产出需求(what/why),不做实现设计(how)。
