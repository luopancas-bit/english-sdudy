# 单词音频库

听力考核使用独立的单词或短语音频，不再从整课音频中截取。这样可以避免播放器显示整课时长、拖动到其他句子，也方便后续在单词记忆和生词本中复用。

## 私有资源结构

```text
content-private/
└── audio/
    └── vocabulary/
        ├── index.json
        ├── us/
        └── uk/
```

`index.json` 以标准化后的词项为键，记录音频路径、媒体类型和来源。这个目录属于私有课程数据，已由 `.gitignore` 排除，不上传 GitHub。
导入器会将目录设为 `755`、索引与音频文件设为 `644`，保证宿主机与容器用户编号不同时仍可以只读访问。

## 导入

```bash
pnpm audio:import
pnpm audio:import -- --uk
pnpm audio:import -- --lessons=1,2,3
pnpm audio:import -- --uk --lessons=1,2,3
pnpm audio:import -- --missing-only --lessons=1,2,3
```

导入器会同时扫描课程考核听力答案和单词记忆中实际进入正式考核、间隔复习的词条。可用 `--lessons=` 只补指定课程，配合 `--missing-only` 保留已有音频、只填缺口。单词优先从 Free Dictionary API 取得可用发音；词典没有音频、网络不可用或目标是短语时，会生成一份固定音频入库。正式考核只读取已入库文件，不依赖外网。

## 接口保护

页面只能通过课程号和不透明的题目编号请求音频。服务端在登录校验后再查找题目答案和音频索引；答案不会出现在 URL 中。路径也会被限制在 `audio/vocabulary` 目录内。
