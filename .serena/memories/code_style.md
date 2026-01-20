# 代码风格与约定

- JavaScript：ESM (`"type": "module"`)，函数式模块拆分（`notify.js` 主入口 + `notifiers/*`）。注释为英文 JSDoc 风格。
- Python：函数式脚本风格，模块级函数与少量内联注释，偏 PEP8 命名（snake_case）。
- 配置：`config.json` 为 JSON；不开启复杂约定或验证。
- 依赖：仅用标准库（Node 18+ fetch，Python 标准库）。
