# export-last-turn

将当前 OMP 会话分支最近一轮问答的原始 Markdown 追加到指定文件。

```text
/export-last-turn notes/chat.md
/export-last-turn ~/notes/chat.md
/export-last-turn notes/chat file.md
```

路径包含空格时不加引号。相对路径以当前会话工作目录为基准，支持 `~/`，自动创建父目录。文件存在时追加，绝不覆盖；重复执行会重复追加。

导出内容以 `## User` 和 `## Assistant` 分隔，包括最近一个用户问题及其后的所有助手正文（包括工具调用之间的文字）。保留代码块和 Markdown 格式，不包含思考、工具调用、工具结果及图片数据。最近的问题尚无助手正文时不写入文件。命令会等待当前生成结束再读取会话。

## 加载

```bash
omp --extension "$HOME/agentic-software-engineering/oh-my-pi-extensions/export-last-turn/index.ts"
```

若希望每次启动自动加载，在 `~/.omp/agent/config.yml` 现有 `extensions` 列表中添加：

```yaml
extensions:
  - ~/agentic-software-engineering/oh-my-pi-extensions/export-last-turn/index.ts
```

重启 OMP 后使用命令。插件在 OMP 进程内运行，只应加载可信代码。
