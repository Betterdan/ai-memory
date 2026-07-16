import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasValidManagedBlock, MANAGED_BLOCK_END, MANAGED_BLOCK_START, replaceManagedBlock,
} from '../src/managed-blocks.js';

test('replaceManagedBlock 只替换受管区块并保留用户内容', () => {
  const current = `# demo\n${MANAGED_BLOCK_START}\nOLD\n${MANAGED_BLOCK_END}\nUSER_CUSTOM\n`;
  const desired = `# demo\n${MANAGED_BLOCK_START}\nNEW\n${MANAGED_BLOCK_END}\nDEFAULT_USER\n`;
  const merged = replaceManagedBlock(current, desired);
  assert.ok(merged.includes('\nNEW\n'));
  assert.ok(merged.includes('USER_CUSTOM'));
  assert.ok(!merged.includes('DEFAULT_USER'));
  assert.ok(!merged.includes('\nOLD\n'));
});

test('replaceManagedBlock 保持当前文件换行风格', () => {
  const current = `# demo\r\n${MANAGED_BLOCK_START}\r\nOLD\r\n${MANAGED_BLOCK_END}\r\nUSER\r\n`;
  const desired = `${MANAGED_BLOCK_START}\nNEW\n${MANAGED_BLOCK_END}\n`;
  const merged = replaceManagedBlock(current, desired);
  assert.ok(merged.includes(`${MANAGED_BLOCK_START}\r\nNEW\r\n${MANAGED_BLOCK_END}`));
  assert.ok(!/(?<!\r)\n/.test(merged));
});

test('受管区块缺失、重复或顺序错误时拒绝自动合并', () => {
  const valid = `${MANAGED_BLOCK_START}\nOK\n${MANAGED_BLOCK_END}`;
  assert.equal(hasValidManagedBlock(valid), true);
  for (const invalid of [
    'NO_MARKERS',
    `${MANAGED_BLOCK_START}\n${MANAGED_BLOCK_START}\n${MANAGED_BLOCK_END}`,
    `${MANAGED_BLOCK_END}\n${MANAGED_BLOCK_START}`,
  ]) {
    assert.equal(hasValidManagedBlock(invalid), false);
    assert.throws(() => replaceManagedBlock(invalid, valid), /managed 标记/);
  }
});
