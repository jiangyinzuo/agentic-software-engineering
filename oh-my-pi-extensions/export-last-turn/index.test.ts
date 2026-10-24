import { test, expect } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import extension from "./index";

test("exports only the current last turn and appends without overwriting", async () => {
  const dir = await mkdtemp(join(tmpdir(), "omp-export-"));
  try {
    let handler!: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
    extension({ registerCommand: (_name: string, command: { handler: typeof handler }) => {
      handler = command.handler;
    } } as unknown as ExtensionAPI);
    const notifications: string[] = [];
    const entry = (role: string, content: unknown) => ({ type: "message", message: { role, content } });
    let branch = [
      entry("user", "old question"), entry("assistant", "old answer"),
      entry("user", [{ type: "text", text: "new **question**" }, { type: "image", data: "secret" }]),
      entry("assistant", [{ type: "thinking", thinking: "private" }, { type: "text", text: "Working." }, { type: "toolCall", name: "bash" }]),
      entry("toolResult", "tool secret"),
      entry("assistant", [{ type: "text", text: "```python\nprint(1)\n```" }]),
    ];
    const ctx = {
      cwd: dir,
      waitForIdle: async () => {},
      sessionManager: { getBranch: () => branch },
      ui: { notify: (message: string) => notifications.push(message) },
    } as unknown as ExtensionCommandContext;
    const target = join(dir, "chat file.md");
    await writeFile(target, "existing content");
    await handler("chat file.md", ctx);
    const appended = "\n\n## User\n\nnew **question**\n\n## Assistant\n\nWorking.\n\n```python\nprint(1)\n```\n\n";
    expect(await readFile(target, "utf8")).toBe("existing content" + appended);
    await handler("chat file.md", ctx);
    expect(await readFile(target, "utf8")).toBe("existing content" + appended + appended);
    await handler("nested/new.md", ctx);
    expect(await readFile(join(dir, "nested/new.md"), "utf8")).toBe(appended);
    branch = [entry("user", "unanswered")];
    await handler("chat file.md", ctx);
    expect(await readFile(target, "utf8")).toBe("existing content" + appended + appended);
    expect(notifications.at(-1)).toContain("尚无助手正文");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
