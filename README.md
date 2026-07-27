# 逐光英语

面向个人长期掌握的英语学习系统。新版以“考核 → 掌握率 → 错题 → 间隔复习”为核心，而不是以点击完成或累计 XP 代替学习效果。

## 第一阶段目标

- 邀请码注册、账号登录、个人资料、修改密码和登录设备管理
- 电脑与 iPhone 跨设备同步
- 听力 30%、精读 20%、跟读 20%、听写 30% 的四维考核
- 最近三次正式考核按 50% / 30% / 20% 加权
- `0–39 / 40–59 / 60–79 / 80–89 / 90–100` 五档通过度
- 当天、1、3、7、14、30 天动态复习
- 前三课完整验证后再扩展全部 40 课

## 本地开发

需要 Node.js 24 和 pnpm。

```bash
cp .env.example .env
pnpm install
pnpm db:bootstrap
pnpm dev
```

- Web：`http://localhost:5173`
- API：`http://localhost:8787`

真实课程内容不会进入公开仓库。请把服务器上的私有课程包挂载到 `content-private/`，格式见 `docs/content-contract.md`。

## 部署

Docker Compose 的目录、密钥、8787 内网测试、HTTPS 正式入口和回滚步骤见
[部署与回滚手册](docs/deployment-runbook.md)。iPhone 录音必须通过浏览器信任的 HTTPS
入口验收，普通 HTTP 只适合验证不涉及麦克风的功能。

## 仓库安全边界

这是公开仓库。不得提交真实课程全文、PDF、音频、词典库、账号数据库、录音、备份、服务器地址清单或任何密钥。详细原因和规则见 [仓库文件限制](docs/repository-rules.md)、[远程协作说明](CONTRIBUTING.md)、[安全说明](SECURITY.md) 和 [GitHub 权限设置](docs/github-settings.md)。
