import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CURRENT_SCHEMA_VERSION, detectInstallation, writeFrameworkMetadata } from './framework.js';
import { migrationsBetween } from './migrations.js';
import { assertNoSymlinkPath, resolveSafeDestination } from './path-safety.js';

export async function planMigration({ targetDir }) {
  const installation = await detectInstallation(targetDir);
  if (installation.kind === 'none') throw new Error('当前目录不是 ai-memory 项目,请先运行 init');
  if (installation.kind === 'legacy') {
    throw new Error('检测到无元数据的 legacy 项目;请先运行 ai-memory update --yes 建立框架元数据');
  }

  const metadata = installation.metadata;
  const fromSchema = metadata.schemaVersion;
  const pending = migrationsBetween(fromSchema, CURRENT_SCHEMA_VERSION).filter(item => item.kind === 'assets');
  const migrations = [];

  for (const migration of pending) {
    for (const required of migration.requires ?? []) {
      const requiredPath = resolveSafeDestination(targetDir, required);
      if ((await readOptional(requiredPath)) === undefined) {
        throw new Error(`缺少迁移目标 ${required};请先运行 ai-memory update --yes`);
      }
    }
    const { changes, notices } = await migration.plan({ targetDir, metadata });
    migrations.push({ id: migration.id, from: migration.from, to: migration.to, changes, notices });
  }

  return { fromSchema, toSchema: CURRENT_SCHEMA_VERSION, metadata, migrations };
}

export async function applyMigration({ targetDir, templatesRoot, plan }) {
  const summary = { written: [], archived: [], skipped: [], notices: [] };
  const operations = [];

  for (const migration of plan.migrations) {
    summary.notices.push(...migration.notices);
    for (const change of migration.changes) {
      if (change.kind === 'skip' || change.kind === 'noop') {
        summary.skipped.push(`${change.dest} — ${change.reason}`);
        continue;
      }
      const destPath = resolveSafeDestination(targetDir, change.dest);
      await assertNoSymlinkPath(targetDir, destPath);
      if (change.kind === 'archive') {
        const toPath = resolveSafeDestination(targetDir, change.to);
        await assertNoSymlinkPath(targetDir, toPath);
        operations.push({ ...change, destPath, toPath });
      } else {
        operations.push({ ...change, destPath });
      }
    }
  }

  for (const item of operations) {
    try {
      if (item.kind === 'archive') {
        await mkdir(path.dirname(item.toPath), { recursive: true });
        await rename(item.destPath, item.toPath);
        summary.archived.push(`${item.dest} → ${item.to}`);
      } else {
        await mkdir(path.dirname(item.destPath), { recursive: true });
        await writeFile(item.destPath, item.content);
        summary.written.push(item.dest);
      }
    } catch (err) {
      throw new Error(
        `迁移在 ${item.dest} 失败,schemaVersion 未提升,修复后可重跑: ${err.message}`,
        { cause: err },
      );
    }
  }

  await writeFrameworkMetadata({
    targetDir,
    templatesRoot,
    frameworkVersion: plan.metadata.frameworkVersion,
    tools: plan.metadata.tools,
    projectName: plan.metadata.templateVars.projectName,
    techStack: plan.metadata.templateVars.techStack,
    date: plan.metadata.templateVars.date,
    previousMetadata: plan.metadata,
    schemaVersion: plan.toSchema,
  });
  return summary;
}

async function readOptional(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return undefined;
    throw err;
  }
}
