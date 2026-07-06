import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../src/render.js';

test('替换单个变量', () => {
  assert.equal(render('hi {{name}}', { name: 'dan' }), 'hi dan');
});

test('替换同一变量多次与多个变量', () => {
  assert.equal(
    render('{{a}}-{{b}}-{{a}}', { a: 'x', b: 'y' }),
    'x-y-x'
  );
});

test('未定义变量抛错', () => {
  assert.throws(() => render('{{missing}}', {}), /未定义的模板变量: missing/);
});

test('无变量文本原样返回', () => {
  assert.equal(render('plain { text }', {}), 'plain { text }');
});
