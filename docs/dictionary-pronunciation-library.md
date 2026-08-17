# 词典与音标库

## 目标

单词记忆、章节学习、生词本和引导训练统一显示美式、英式 IPA。正式考核答题期间不显示音标，提交和纠错阶段再显示，避免音标泄露答案。

音标属于全局词典数据，不重复存进每个用户的生词记录。用户生词只保存学习内容与状态，通过规范化词条关联音标库。

## 数据结构

- `dictionary_sources`：词典名称、版本、格式、许可、优先级与启停状态。
- `dictionary_entries`：全局规范词条及 `verified / pending / ambiguous` 状态。
- `dictionary_entry_sources`：词条在不同词典中的释义、词性和原始音标记录。
- `pronunciations`：美音、英音、主要读音、其他读音、音标体系与核对状态。
- `dictionary_resources`：从 MDD 提取的音频、图片、字体索引和 SHA-256。
- `dictionary_import_jobs`：导入批次和报告。
- `dictionary_conflicts`：音标、释义或资源冲突。

数据库迁移只新增表，不修改原有账号、生词、考核和复习记录。应用启动时会登记现有 40 课和已有个人生词；没有可靠音标的词条保持“待补全”，不会猜测读音。

## 页面规则

- 单个单词默认显示一个主要美式 IPA 和一个主要英式 IPA。
- 其他可靠读音放在“其他读音”中，并尽量保留词性。
- 短语没有可靠整条音标时，显示组成单词的美、英音标。
- 有对应单词级音频时显示播放按钮；缺少音频时按钮不可用，但音标仍可显示。
- 正式听力、拼写和默写考核进行中隐藏音标。

## MDX/MDD 导入

解析器固定使用 `js-mdict 6.0.6`。该版本为 MIT 许可；7.x 已改为 AGPL-3.0，未经单独许可证审查不得升级。

真实词典放在服务器私有目录，例如：

```text
/data/share/apps-data/english-study-v2/dictionary-imports/
  my-dictionary.mdx
  my-dictionary.mdd
  my-dictionary.css
  my-dictionary.js
```

先扫描到暂存区：

```bash
pnpm dictionary:scan -- \
  --input=/data/share/apps-data/english-study-v2/dictionary-imports/my-dictionary.mdx \
  --source-id=my-dictionary \
  --name=我的词典 \
  --version=1 \
  --license=personal-use \
  --profile=scripts/dictionary/profile.example.json \
  --terms-from-lessons=/data/share/apps-data/english-study-v2/content-private \
  --output=/data/share/apps-data/english-study-v2/dictionaries/staging
```

扫描结果包含 `package.json`、`report.json` 和允许的 MDD 资源。不同 MDX 的 HTML 类名不统一，因此应复制示例 profile，为词典配置美音、英音和词性提取规则。

只需要先覆盖课程词汇时，可以使用 `--terms-from-lessons`；不传该参数时才扫描词典全部词条。

报告确认后发布：

```bash
pnpm dictionary:publish -- \
  --package=/data/share/apps-data/english-study-v2/dictionaries/staging/my-dictionary@1/package.json \
  --content=/data/share/apps-data/english-study-v2/content
```

发布使用“同版本不可覆盖”规则。应用重启后只增量同步新词典版本；停用或回退词典不会删除用户学习记录。

同步过程按资源、词条来源和发音记录分别检查数量，可从中断处继续；完成判断按数据库唯一键去重，词典自身含重复记录时不会导致每次启动都重新导入。如果先导入了词条、后补齐 MDD 音频，重启时会重新绑定音频资源，不需要删除数据库或重新创建用户记录。多个启用词典同时提供音频时，使用优先级较高（数值较小）的来源。

## CSS、JavaScript 与 HTML 安全规则

- MDX/MDD 配套 JavaScript 永不执行，也不下发到浏览器。
- 原始 CSS 不加载到学习页面，防止覆盖全站布局或隐藏内容。
- HTML 中的脚本、样式、外链样式表、表单、嵌入对象、事件属性和危险协议会被移除。
- 正式页面使用本项目统一组件和样式。
- MDD 只提取被词条引用的允许类型：音频、图片和字体。
- 资源拒绝 `..` 路径、外部 URL、未知扩展名和超过 20 MB 的单文件。
- 原始 MDX/MDD/CSS/JS 留在私有归档区，不进入 Web 静态目录。

## 在线候选音标

`pnpm phonetics:import` 可以从 Free Dictionary API 生成候选音标暂存包，但执行时会把课程词条发送给第三方服务。因此必须在数据外发得到明确授权后才能运行。

自动结果一律标记为 `pending`，只接受 URL 中能明确识别为 US 或 UK 的音频对应音标，不根据猜测补口音。自动结果不能覆盖人工核对或主词典音标。

## 仓库限制

公开 GitHub 只保存解析程序、数据库结构、格式合同、文档和不含版权内容的测试数据。以下内容不得提交：

- `*.mdx`、`*.mdd`。
- `content-private/` 和 `dictionary-imports/`。
- 解析后的真实释义、商业词典音频、图片和字体。
- 用户数据库、学习记录和备份。

这些限制用于避免版权内容、个人学习数据和可执行词典脚本进入公开仓库。

## 验收

1. 40 课所有词条已登记，单个单词的美英 IPA 缺失会进入报告。
2. 个人生词新增后立即关联已有音标或显示“音标待补全”。
3. 词典状态接口 `/api/dictionaries/status` 返回来源、版本、覆盖率和冲突数。
4. 电脑与 iPhone 均检查长 IPA 换行、播放按钮和短语逐词展开。
5. 正式考核过程中不出现音标，提交后的结果和纠错页面才可显示。
6. 导入失败或停用词典不影响原有课程、生词和学习记录。
