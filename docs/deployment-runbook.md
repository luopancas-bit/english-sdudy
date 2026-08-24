# 部署与回滚手册

## 目标

学习系统容器内部监听 `8787`。测试部署不替换旧系统，不删除旧数据库、录音或课程内容。

建议服务器目录：

```text
/opt/server/apps/english-study-v2/              # Git 工作副本
/opt/server/configs/secrets/english-study-v2.env
/data/share/apps-data/english-study-v2/
  data/
  content/
  recordings/
  reading/                 # 原始书籍与解析结果，仅容器 UID 10001 可写
```

真实密钥仅保存在服务器的 root-only 环境文件中，不提交 Git。

## 两种访问模式

### 内网 HTTP 测试

仅用于可信局域网的功能联调：

```dotenv
NODE_ENV=production
SESSION_COOKIE_SECURE=false
```

Compose 参数：

```bash
export BIND_IP=0.0.0.0
export HOST_PORT=8787
```

访问 `http://<server-lan-ip>:8787`。这种模式可以验证账号、课程、考核和同步，但 iPhone/Safari
通常不会在非安全来源开放麦克风，因此不能作为完整验收结果，也不应直接暴露公网。

### HTTPS 正式访问

正式环境保持：

```dotenv
NODE_ENV=production
SESSION_COOKIE_SECURE=true
```

由 Caddy 提供受信任的 HTTPS 域名入口，再反向代理到
`office-english-study-v2:8787`。运营商关闭 `443` 时，可以让路由器转发一个可用的公网
TLS 端口（例如 `8443`）到 Caddy；证书签发仍需可用的 ACME HTTP 或 DNS 验证。

只有浏览器显示受信任的 HTTPS 连接后，iPhone 录音才进入正式验收。

## 首次部署

1. 创建上述目录；正式备份按项目策略写入 `/backup`。
2. 将课程私有内容复制到 `content/`，录音与 `reading/` 目录保持 UID 10001 可写。
3. 从 `.env.example` 创建服务器环境文件，生成不少于 32 字符的随机
   `SESSION_SECRET`，设置一次性管理员密码。
4. 确认外部 Docker 网络存在：`docker network inspect office_net`。
5. 在代码目录执行：

```bash
SECRETS_DIR=/opt/server/configs/secrets \
DATA_ROOT=/data/share/apps-data/english-study-v2 \
BIND_IP=0.0.0.0 \
HOST_PORT=8787 \
docker compose -f docker-compose.example.yml up -d --build
```

6. 运行：

```bash
scripts/verify-deployment.sh http://127.0.0.1:8787
```

7. 阅读模块另外运行 `office-english-study-reader-worker`。它只处理队列中的书籍，使用
   Calibre 与 Poppler 解析 EPUB/MOBI/AZW/AZW3/FB2/DOCX/RTF/PDF；遇到 DRM 或密码保护只记录
   `protected` 状态，不绕过加密。确认两个容器都健康/运行：

```bash
docker compose -f docker-compose.example.yml ps
docker logs --tail 80 office-english-study-reader-worker
```

阅读环境开关与额度：

```dotenv
READING_DIR=/app/reading-data
READING_ENABLED=true
READING_UPLOAD_ENABLED=true
READING_MAX_BOOK_BYTES=314572800
READING_MAX_USER_BYTES=5368709120
READING_MAX_USER_BOOKS=100
READING_TRANSLATION_DAILY_LIMIT=100
```

整句翻译是可选的 OpenAI-compatible `chat/completions` 服务。未配置时阅读、查词和生词本仍可用：

```dotenv
TRANSLATION_BASE_URL=https://provider.example/v1
TRANSLATION_API_KEY=replace-with-server-secret
TRANSLATION_MODEL=translation-model
```

## 更新

更新前记录当前提交：

```bash
git rev-parse HEAD
```

拉取新版本并通过 `pnpm check` 后，重新执行 Compose 构建。数据库和录音使用宿主机持久化目录，
容器重建不会删除这些数据。更新前同时备份 `data/` 与 `reading/`，并记录主服务和 worker 的
两个镜像标签；迁移仅新增阅读表，不删除或改写原有学习记录。

## 回滚

1. `git checkout` 到部署前记录的提交或切回已验证发布分支。
2. 使用相同环境变量重新执行 `docker compose ... up -d --build`。
3. 执行 `scripts/verify-deployment.sh`。如果只需紧急关闭新功能，可先在环境文件设置
   `READING_ENABLED=false` 并重建主服务；旧阅读数据卷会保留。

数据库结构发生变更时，回滚代码前必须先备份 SQLite 文件；不得用空数据库覆盖原库。
