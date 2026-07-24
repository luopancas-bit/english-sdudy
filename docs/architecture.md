# 第一阶段架构

## 深模块

### `@zhuguang/domain`

小接口承载全部学习规则：

- `scoreAssessment`
- `calculateMastery`
- `scheduleReview`

调用方只传答题结果和历史正式考核，不需要理解权重、阈值或复习退阶逻辑。该模块不依赖数据库与 Web 框架，接口同时作为测试面。

### `@zhuguang/database`

负责 schema、连接、迁移和事务。Fastify 路由不直接拼 SQL。

### `@zhuguang/api`

负责认证、授权、输入校验、会话 Cookie、课程内容读取和将领域结果持久化。

### `@zhuguang/web`

负责今日学习、课程地图、考核、复习和报告界面。它显示服务端给出的掌握状态，不重新计算业务规则。

## 数据流

```text
React Web
    ↓ typed JSON
Fastify API
    ↓
Domain module ← scored answers / attempt history
    ↓
Database repository
    ↓
SQLite + private recordings/content mounts
```

## 核心约束

- 只有正式考核和计划复习能改变掌握率。
- 同一天重复正式考试仍保存完整记录，便于个人复盘，但当天只有第一次正式成绩进入掌握率加权。
- 任何通过度都允许学习下一课。
- 低于 80% 自动进入复习队列。
- 私有课程资产不进入公开 GitHub 仓库。
