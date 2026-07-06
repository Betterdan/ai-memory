export function render(content, vars) {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in vars)) throw new Error(`未定义的模板变量: ${key}`);
    return vars[key];
  });
}
