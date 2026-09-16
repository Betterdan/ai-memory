# 当前知识({{projectName}})

本目录记录系统**现在是什么样**,不记录怎么演变到现在。过程记录在 `.ai/memory/`。

## 结构

| 位置 | 内容 |
|---|---|
| `overview.md` | 项目概览:目标、技术栈、当前迭代、已知遗留问题 |
| `entries/` | 对外入口页(主视图),按入口分组,一组一页 |
| `domains/` | 业务领域页(横向视图) |
| `decisions/` | 决策记录,标注生效或已取代 |
| `iterations.md` | 迭代记录:需求集合、需求点状态与顺序 |
| `conventions.md` | 开发约定 |

接口契约与架构基线不在本目录重复:

- 接口形状见项目契约文件,位置约定在 `docs/architecture/interfaces.md`
- 架构基线见 `docs/architecture/`

## 使用

- 写入前先读 `.ai/skills/knowledge-structure.md` 判断归属;每条知识只有一个归属。
- 用不到的部分整段留空,不必为填满模板而编造内容。
- 本目录是 agent 的默认上下文:回答「系统现在怎么工作」先读这里,不要翻 session 日志倒推。
