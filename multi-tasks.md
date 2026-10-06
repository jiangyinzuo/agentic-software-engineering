# 多Agents协作工作指南

## 注意事项

- 本文件仅人类可编辑。
- 人类可能随时更新本文件，注意及时查看。

### 多Agent协作

主agent负责识别、拆分并行任务，派发子任务给subagent。
- Agent需要将工作中值得记录的内容写到工作日志中：主agent记录到worknote/main.md中，子agent根据自己的任务，记录到task-xxx.md中。
- 子agent之间不进行直接对话，请主agent在启动子agent前，为子agent规划好它能使用的公共资源，例如在哪个worktree下工作、能否启动/如何启动占资源的后台进程、编译时最多使用多少线程。
- 所有agent都可以查看worknote下的所有文件。
- 主agent可以令子agent在过去的task-xxx.md下继续工作、继续写工作日志。

#### worknote/main.md

worknote/main.md需要维护当前任务，更新当前项目进展。

## 机器环境

当前操作系统：Ubuntu 24.04, Nvidia L20单卡GPU。
当前已有的命令行工具：gh、rg、fzf、uv。
你可以尝试自行安装你想要的命令行工具。

## 总目标

- 根据issue，给出设计方案和代码。
    - 设计方案写入worknote/design.md，需要包含以下章节：需求说明（包括GitHub issue及其父issue）、代码设计方案、测试方案
