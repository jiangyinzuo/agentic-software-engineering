import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

type Entry = {
  type: string;
  message?: { role: string; content: unknown };
};

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: "text"; text: string } =>
      block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

function lastTurn(entries: readonly Entry[]): string {
  // 只查当前分支，避免导出树导航之前其他分支的回答。
  let start = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].type === "message" && entries[i].message?.role === "user") {
      start = i;
      break;
    }
  }
  if (start < 0) throw new Error("当前分支没有用户问题，无法导出问答。");
  const question = textOf(entries[start].message!.content);
  const answers = entries.slice(start + 1)
    .filter((entry) => entry.type === "message" && entry.message?.role === "assistant")
    .map((entry) => textOf(entry.message!.content))
    .filter((text) => text.trim().length > 0);
  if (answers.length === 0) throw new Error("最近的用户问题尚无助手正文，未写入文件。");
  return `## User\n\n${question}\n\n## Assistant\n\n${answers.join("\n\n")}\n\n`;
}

export default function exportLastTurn(pi: ExtensionAPI): void {
  pi.registerCommand("export-last-turn", {
    description: "将当前分支最近一轮问答的 Markdown 追加到指定文件",
    handler: async (args, ctx) => {
      const value = args.trim();
      if (!value) {
        ctx.ui.notify("用法：/export-last-turn <文件路径>（路径可包含空格，无需引号）", "warning");
        return;
      }
      try {
        await ctx.waitForIdle();
        const markdown = lastTurn(ctx.sessionManager.getBranch());
        const path = value === "~" || value.startsWith("~/")
          ? resolve(homedir(), value.slice(2))
          : resolve(ctx.cwd, value);
        await mkdir(dirname(path), { recursive: true });
        // 前置空行使追加不依赖旧文件是否以换行结尾，不读取或覆盖原文件。
        await appendFile(path, `\n\n${markdown}`, "utf8");
        ctx.ui.notify(`已追加最近一轮问答：${path}`, "info");
      } catch (error) {
        ctx.ui.notify(`导出失败：${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });
}
