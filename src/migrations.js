export const MIGRATIONS = [
  {
    id: 'bootstrap-schema-v1',
    from: 0,
    to: 1,
    automatic: true,
    description: '为无元数据的 legacy 项目建立所有权与生成基线;既有文件保持保守审查',
  },
];

export function migrationsBetween(from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0) {
    throw new Error(`无效 Schema 版本: ${from} → ${to}`);
  }
  if (from > to) throw new Error(`项目 Schema ${from} 高于当前 CLI Schema ${to},请使用更新版本的 CLI`);

  const result = [];
  let current = from;
  while (current < to) {
    const migration = MIGRATIONS.find(item => item.from === current);
    if (!migration || migration.to <= current || migration.to > to) {
      throw new Error(`缺少 Schema 迁移路径: ${current} → ${to}`);
    }
    result.push(migration);
    current = migration.to;
  }
  return result;
}
