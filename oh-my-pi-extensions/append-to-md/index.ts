import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
} from "@oh-my-pi/pi-coding-agent";
import { readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import os from "node:os";

type State = {
  path: string;
};
const STATE_TYPE = "com.omp.append-to-md.state";
const STATUS_KEY = "append-to-md";


function expandPath(value: string, cwd: string): string {
  const expanded = value === "~" || value.startsWith("~/")
    ? resolve(os.homedir(), value.slice(2))
    : value;
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}
async function completePath(argumentPrefix: string): Promise<Array<{ value: string; label: string; description?: string; iconName?: string }> | null> {
  const expanded = argumentPrefix === "~" || argumentPrefix.startsWith("~/")
    ? resolve(os.homedir(), argumentPrefix.slice(2))
    : argumentPrefix;
  const base = expanded.endsWith(sep) ? expanded : dirname(expanded);
  const prefix = expanded.endsWith(sep) ? "" : expanded.slice(base.length + 1);
  const displayBase = argumentPrefix.startsWith("~/")
    ? `~${relative(os.homedir(), base) ? `/${relative(os.homedir(), base)}` : ""}`
    : base;
  try {
    const entries = await readdir(base, { withFileTypes: true });
    return entries
      .filter((entry) => entry.name.startsWith(prefix))
      .map((entry) => ({
        value: `${displayBase}/${entry.name}${entry.isDirectory() ? sep : ""}`,
        label: entry.name,
        description: entry.isDirectory() ? "目录" : "文件",
        iconName: entry.isDirectory() ? "folder" : "file",
      }));
  } catch {
    return null;
  }
}

function textOfMessage(message: { content?: unknown }): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: "text"; text: string } => {
      if (!block || typeof block !== "object") return false;
      if (!("type" in block) || block.type !== "text") return false;
      return "text" in block && typeof block.text === "string";
    })
    .map((block) => block.text)
    .join("");
}

function formatMessage(message: { role?: string; content?: unknown }): string {
  const text = textOfMessage(message).trimEnd();
  if (!text) return "";
  const role = message.role === "user" ? "User" : "Assistant";
  return `### ${role}\n\n${text}\n`;
}

function restoreState(ctx: ExtensionContext): State | undefined {
  const branch = ctx.sessionManager.getBranch();
  for (let i = branch.length - 1; i >= 0; i -= 1) {
    const entry = branch[i];
    if (entry.type !== "custom" || entry.customType !== STATE_TYPE) continue;
    if (!entry.data || typeof entry.data !== "object" || !("path" in entry.data)) continue;
    const path = entry.data.path;
    if (typeof path === "string" && path.length > 0) return { path };
  }
  return undefined;
}

function updateStatus(ctx: ExtensionContext, state: State | undefined): void {
  ctx.ui.setStatus(STATUS_KEY, state ? `md: ${state.path}` : "md: 未设置");
}

async function saveState(pi: ExtensionAPI, ctx: ExtensionContext, path: string): Promise<State> {
  const state = { path };
  await pi.appendEntry(STATE_TYPE, state);
  updateStatus(ctx, state);
  return state;
}

export default function appendToMd(pi: ExtensionAPI): void {
  let state: State | undefined;

  const sync = (_event: unknown, ctx: ExtensionContext) => {
    state = restoreState(ctx);
    updateStatus(ctx, state);
  };

  pi.on("session_start", sync);
  pi.on("session_switch", sync);
  pi.on("session_branch", sync);
  pi.on("session_tree", sync);

  pi.registerCommand("append-to-md", {
    description: "设置或查看当前会话绑定的 Markdown 文件",
    getArgumentCompletions: completePath,
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const value = args.trim();
      if (!value) {
        updateStatus(ctx, state);
        ctx.ui.notify(state ? `当前 Markdown 文件：${state.path}` : "当前会话尚未设置 Markdown 文件", "info");
        return;
      }

      const path = expandPath(value, ctx.cwd);
      state = await saveState(pi, ctx, path);
      ctx.ui.notify(`已绑定 Markdown 文件：${state.path}`, "info");
    },
  });

  pi.on("message_end", async (event: { message: { role?: string; content?: unknown } }, ctx) => {
    if (!state || event.message.role !== "user" && event.message.role !== "assistant") return;
    const rendered = formatMessage(event.message);
    if (!rendered) return;
    await mkdir(dirname(state.path), { recursive: true });
    await appendFile(state.path, `${rendered}\n`, "utf8");
  });

  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}
