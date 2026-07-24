# 私有课程内容契约

公开代码通过 `CONTENT_DIR` 读取私有课程包。默认目录为 `content-private/`，该目录不会被 Git 跟踪。

```text
content-private/
├── lessons.json
├── assessments/
│   ├── lesson-01.json
│   ├── lesson-02.json
│   └── lesson-03.json
├── timings.json
├── phonics.json
└── audio/
    ├── us/
    └── uk/
```

`lessons.json` 保存课程元数据与正文；`assessments/` 保存经过校验的固定题库。题目必须能指出答案所依据的课文句子。

生产部署使用只读挂载：

```yaml
volumes:
  - /data/share/apps-data/english-study/content:/app/content-private:ro
```

课程内容缺失时，健康检查应返回 `content: false`，前端显示明确的维护状态，不能用空白页面或静默失败代替。
