# 需求目录

- 每个迭代版本一个目录:`vX.Y.Z/`
- `draft/<集合名>.md` — 人工粗稿,一份文档是一个**需求集合**,自由格式,想到哪写到哪
- `final/<集合名>-<点名>.md` — AI 协作定稿,一份文档是一个**需求点**:单一目标、可独立验收、可独立提交
- 需求点固定结构:目标 / 范围 / 外部行为契约 / 验收标准 / 开放问题 / 实现交接
- 一个集合可拆成多个需求点;同集合的点靠命名前缀归组,一次只完整定稿一个点,其余在 `.ai/knowledge/iterations.md` 以 `planned` 登记
- 拆分判断、定稿流程与就绪标准见 `.ai/skills/requirements-flow.md`(/new-requirement、/finalize-requirement)
- how 阶段技术接口与数据/质量属性增量见 `.ai/skills/feature-design.md` 和 `docs/design/`
