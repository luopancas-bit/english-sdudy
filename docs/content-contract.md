# 私有课程内容契约

公开代码通过 `CONTENT_DIR` 读取私有课程包。默认目录为 `content-private/`，该目录不会被 Git 跟踪。

```text
content-private/
├── lessons.json
├── assessments/
│   ├── lesson-01.json
│   ├── ...
│   └── lesson-40.json
├── timings.json
├── phonics.json
└── audio/
    ├── us/
    └── uk/
```

`lessons.json` 保存课程元数据与正文；`assessments/` 保存经过校验的固定题库。题目必须能指出答案所依据的课文句子。

批量扩展题库时必须保留已人工核对的文件，生成器默认拒绝覆盖。前三课确认后，可单独生成后续课程：

```bash
node scripts/generate-private-assessments.mjs --lessons=4-40
node scripts/import-vocabulary-audio.mjs content-private --lessons=4-40 --dry-run --offline
node scripts/import-vocabulary-audio.mjs content-private --lessons=4-40 --missing-only --offline
```

`--offline` 只调用本机系统发音生成缺失音频，不会把课程词条发送到外部服务。只有明确复核现有题库后才允许使用 `--force`。

生产环境默认要求 `COURSE_LESSON_COUNT=40`。健康检查会验证配置范围内每课的四维题库、单词考核题量和美音词条音频；任何一课不完整都会返回未就绪，避免课程地图开放后出现空题或无声题。

学习页只读取正文、逐句文本、词汇和音频。打开页面、阅读、播放音频或把词加入生词本都不改变掌握度；只有正式考核和计划复习的服务器评分可以改变掌握状态。

`timings.json` 中的句子起止时间用于听力、听写题的单句播放。题目接口只返回音频地址和时间范围，不返回听力原文或答案。正式内容目录必须包含 `audio/us/lesson-NN.mp3`；缺少发音版本时前端应明确提示，不能用合成空白音频代替。

口语题向前端返回可朗读的 `speechText`，但不返回标准答案字段。正式考核和计划复习必须先上传录音，录音文件保存在 `RECORDINGS_DIR`，数据库只保存所属用户、课程、题目、文件相对路径、类型、大小和时间。录音属于个人隐私，不进入公开仓库。

生产部署使用只读挂载：

```yaml
volumes:
  - /data/share/apps-data/english-study/content:/app/content-private:ro
```

课程内容缺失时，健康检查应返回 `content: false`，前端显示明确的维护状态，不能用空白页面或静默失败代替。
