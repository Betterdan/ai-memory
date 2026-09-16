# R5c 技术设计:Schema 迁移执行器与存量知识搬迁

> 输入:R5c 需求定稿(本仓库无 docs/requirements,定稿见对话与本文件第 1 节摘要)
> 风险等级:L
> 状态:待确认

## 1. 目标与约束引用

给框架补上执行迁移的能力,把存量项目的 `project-state.md` 搬进 R5a 的知识结构,`schemaVersion` 1→2。

硬约束:

- `update` 的语义不变:只动框架文件,用户资产一律 `preserve`。迁移由独立命令承担。
- 保持 `update --dry-run` / `--yes` 的既有安全行为。
- `src/model-routing.js` 的阶段名不改。
- 现有测试全部通过。

## 2. 风险等级与理由

L。改变框架元数据 schema、改写用户资产、单向不可回退。

## 3. 现状及影响范围

| 现状 | 问题 |
|---|---|
| `migrations.js` 只有 `{id,from,to,automatic,description}`,`migrationsBetween` 仅返回列表 | 没有执行体,迁移只能规划 |
| `writeFrameworkMetadata` 无条件写 `schemaVersion: CURRENT_SCHEMA_VERSION` | 一旦 CURRENT 提到 2,`update --yes` 会在未迁移时把项目标成 2 |
| `applyFrameworkUpdate` 遇到非 automatic 迁移直接抛错 | 迁移移出 update 后,这条判断失去意义 |
| `planFrameworkUpdate` 返回的 `schemaVersion` 是 CURRENT | 调用方会误以为 update 会提升 schema |

影响文件:`src/migrations.js`、`src/framework.js`、新增 `src/migrate.js`、`bin/cli.js`。

## 4. 模块、职责与依赖

```
bin/cli.js
  ├── update    → framework.js       只动框架文件,报告待执行迁移
  └── migrate   → migrate.js         只动用户资产,提升 schemaVersion
                     └── migrations.js  迁移注册表(含执行体)
```

`migrate.js` 依赖 `migrations.js` 与 `path-safety.js`;不依赖 `framework.js` 的更新逻辑,避免两条路径耦合。

## 5. 技术接口契约

### 5.1 迁移条目

```js
{
  id: 'knowledge-layer-v2',
  from: 1,
  to: 2,
  automatic: true,
  description: '...',
  // 只计算不写盘;返回完整变更集
  plan: async ({ targetDir, metadata }) => ({
    changes: [
      { kind: 'write',   dest, content, reason },
      { kind: 'archive', dest, to, reason },
      { kind: 'skip',    dest, reason },
    ],
    notices: ['...'],
  }),
}
```

`kind` 语义:`write` 写入或替换;`archive` 移动到 `.ai/memory/archive/`;`skip` 目标已被用户改造,跳过并报告。执行器只认这三种,迁移本身不碰文件系统。

### 5.2 migrate.js

```js
planMigration({ targetDir })
  → { fromSchema, toSchema, migrations: [{ id, changes, notices }] }
applyMigration({ targetDir, plan })
  → { written: [], archived: [], skipped: [], notices: [] }
```

### 5.3 CLI

```
ai-memory migrate --dry-run   只输出计划,不写任何文件
ai-memory migrate --yes       执行;必须且只能二选一(与 update 一致)
```

前置检查:项目已初始化;`schemaVersion` < `CURRENT_SCHEMA_VERSION`;迁移目标依赖的框架模板已存在(否则提示先运行 `update --yes`)。

## 6. 数据模型增量

- `CURRENT_SCHEMA_VERSION`:1 → 2。
- `writeFrameworkMetadata` 增加 `schemaVersion` 入参:fresh init 用 CURRENT,update 沿用 `previousMetadata.schemaVersion`,migrate 写目标 schema。
- `planFrameworkUpdate` 返回的 `schemaVersion` 改为项目当前值,并新增 `pendingMigrations`。

## 7. 核心流程与状态转换

```
update --yes          schema 不变,新模板写入(knowledge/ 被 add)
      ↓               输出:存在 1 个待执行迁移 → 运行 ai-memory migrate --dry-run
migrate --dry-run     读 project-state.md,计算 changes,打印,不写盘
      ↓
migrate --yes         三段式:全部 plan → 校验 → 写入 → 最后提升 schemaVersion
```

`schemaVersion` 在**所有变更成功写入后**才提升;中途失败则保持旧值,重跑即可(幂等)。

## 8. 错误、并发、幂等与兼容

| 场景 | 行为 |
|---|---|
| `schemaVersion` 已是 2 | 报告「无待执行迁移」并退出 0,不重复执行 |
| 目标文件已被用户改造(内容 ≠ 模板基线) | `skip` + 报告,不覆盖 |
| `project-state.md` 格式不合模板 | 不猜;整块原样搬进 `overview.md` 的「待整理」区并 notice |
| `features/*.md` 存在 | 原地保留,输出待归类清单,并在 `overview.md` 遗留问题表加一行 |
| 写入中途失败 | fail-closed,报告已写入/未写入,不回滚;schemaVersion 保持旧值 |
| 旧 CLI 遇 schema 2 | 既有保护:`migrationsBetween` 抛「项目 Schema 2 高于当前 CLI Schema 1」 |
| 路径穿越、符号链接 | 复用 `path-safety.js`,与 scaffold 同等约束 |

## 9. 质量属性增量

不引入网络与并发。迁移是一次性本地文件操作,规模为个位数文件。

## 10. 部署、迁移与回滚

单向不可回退。用户项目在 git 中,回滚方式是 `git checkout`;框架不提供降级路径(定稿 Q4 已确认不做)。README 升级说明须写明单向性与执行顺序(先 update 后 migrate)。

## 11. 测试与验证

- 单元:`migrationsBetween(0,2)`/`(1,2)` 连续;迁移 plan 的三种 kind;`writeFrameworkMetadata` 的 schemaVersion 来源。
- 端到端:schema 1 项目 → update(schema 不变) → migrate --dry-run(目录树逐字节不变) → migrate --yes(内容正确落位) → 再次 migrate(幂等)。
- 负例:目标被改造 → skip;表格格式异常 → 待整理区;写入失败 → 报告。
- legacy v0.1(schema 0)连续迁移到 2。

## 12. 假设和开放问题

- 假设:用户会先 `update` 再 `migrate`;若顺序颠倒,前置检查会明确提示。
- 假设:`project-state.md` 的需求进度表列数可能与模板不同,按「解析失败即整块搬运」处理。
- 开放:`archive/` 是否需要在多次迁移后区分批次。当前只有一次迁移,暂不设计。

## 13. 交付验证

结论:**ready**

| 检查面 | 证据 |
|---|---|
| 契约与测试 | 92 条测试通过(新增 8 条 migrate 用例);`npm run verify` 通过 |
| update 语义不变 | 测试断言 update 后 schemaVersion 保持 1,且报告 pendingMigrations |
| dry-run 无副作用 | 全目录哈希快照在 planMigration 前后逐字节相等 |
| 数据不丢 | 基本信息、进度表行、遗留问题、归档摘要各有断言;原文件逐字节归档 |
| 幂等 | schema 为 2 时无待执行迁移;部分失败后重跑判 noop 并完成 |
| 失败可恢复 | 注入 rename 失败,断言 schemaVersion 仍为 1 且重跑成功 |
| 不覆盖用户改造 | 改写 overview 后判 skip,且不归档原文件 |
| 路径安全 | 复用 path-safety 的 resolveSafeDestination 与 assertNoSymlinkPath |

实现期发现并修复的设计缺口:merge 原本不幂等,部分失败后重跑会被「目标已被用户修改」挡住。已改为先算内容判 noop、再判用户改造,并给 appendRows/appendPending 加去重。
