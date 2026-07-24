# GitHub 仓库设置

代码内的限制只能减少误提交，不能代替 GitHub 权限控制。仓库所有者应在 GitHub 中启用以下规则。

## `main` 分支

- 禁止直接推送，所有修改必须经 Pull Request。
- 合并前必须通过 `secrets` 与 `check` 两个 CI 检查。
- 至少需要 1 次审批，代码更新后撤销旧审批。
- 禁止强制推送和删除分支。
- 仓库管理员也遵守规则，紧急修复仍通过 PR 留痕。

这样做是为了让计分规则、数据库迁移和隐私边界都有可复查记录，避免远程协助时一次误操作直接进入生产基线。

## 协作者权限

- 日常远程协作授予 `Write` 即可，不授予 `Admin`。
- 生产服务器、DNS、证书和 Secrets 不通过仓库协作者权限共享。
- GitHub Actions 使用最小权限；工作流默认只有 `contents: read`。

## 仓库安全

- 开启 Secret scanning 与 Push protection。
- 开启 Dependabot alerts；依赖升级仍需通过测试再合并。
- 不把生产部署密钥添加到普通仓库变量。若以后使用 GitHub Actions 部署，应单独建立受保护的 `production` Environment，并要求人工审批。

## 当前发布边界

首次推送完成后再按本文配置规则。未启用分支保护之前，不邀请远程协作者写入仓库。
