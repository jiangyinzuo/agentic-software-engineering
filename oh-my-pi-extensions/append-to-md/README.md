# append-to-md

让每个 OMP 会话绑定一个 Markdown 文件，并把该会话中完成的用户消息和助手消息持续追加到文件。

当前会话绑定的文件会显示在 OMP 状态栏中，例如 `md: /home/me/notes/chat.md`。会话切换、恢复、分支或树导航后，插件从该会话的持久化状态重新恢复文件变量。

## 命令

```text
/append-to-md                 # 查看当前绑定文件
/append-to-md path/to/chat.md
/append-to-md ~/notes/chat.md
```

路径会在设置命令执行时解析为绝对路径；相对路径相对于当前会话工作目录。父目录不存在时会自动创建。

## 本地安装

本插件是一个单文件 OMP Extension。用 `--extension` 显式加载：

```bash
omp --extension "$HOME/agentic-software-engineering/oh-my-pi-extensions/append-to-md/index.ts"
```

如果希望每次启动自动加载，把下面内容加入 `~/.omp/agent/config.yml`：

```yaml
extensions:
  - ~/agentic-software-engineering/oh-my-pi-extensions/append-to-md/index.ts
```

然后重新启动 OMP。也可以直接配置插件目录：

```yaml
extensions:
  - ~/agentic-software-engineering/oh-my-pi-extensions/append-to-md
```

首次使用时执行 `/append-to-md ~/notes/chat.md`。文件绑定状态写入当前会话的持久化记录，因此使用 `/resume` 恢复该会话后会自动恢复。

## 注意事项

- Markdown 文件是可读副本；OMP 原生 JSONL 会话仍是恢复会话的权威存储。
- 消息按完成顺序追加；流式中间片段不会重复写入。
- 该扩展在 OMP 进程内运行，不是安全沙箱。请只加载自己信任的插件代码。

## 修复记录

- 修复缺少 `mkdir` 和 `appendFile` 导入导致消息追加中止的问题。
