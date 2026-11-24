import { pluginError } from "./plugin-error";
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { z } from "zod";
import { exists } from "./file-index";
import { errorMessage } from "./reader-error";
import {
  storeIdSchema,
  type PlanningSource,
  type PlanningCatalog,
} from "./planning-source";

const exec = promisify(execFile);
export type RunOpenSpec = (args: string[], cwd: string) => Promise<unknown>;
const rootSchema = z.object({
  root: z.object({
    path: z.string().refine(path.isAbsolute),
    store_id: storeIdSchema.optional(),
  }),
});
const storesSchema = z.object({
  stores: z.array(z.object({ id: storeIdSchema })),
});

async function windowsOpenSpec() {
  for (const entry of (process.env.PATH ?? "").split(path.delimiter)) {
    const directory = entry.replace(/^"(.*)"$/, "$1");
    if (!path.isAbsolute(directory)) continue;
    for (const name of ["openspec.exe", "openspec.cmd"]) {
      const candidate = path.join(directory, name);
      try {
        if ((await stat(candidate)).isFile()) return candidate;
      } catch (cause) {
        if (!["ENOENT", "ENOTDIR"].includes((cause as NodeJS.ErrnoException).code ?? ""))
          throw cause;
      }
    }
  }
}

async function executeOpenSpec(args: string[], cwd: string) {
  const options = {
    cwd,
    timeout: 15_000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, OPENSPEC_TELEMETRY: "0", DO_NOT_TRACK: "1" },
  };
  if (process.platform !== "win32") return exec("openspec", args, options);
  const command = await windowsOpenSpec();
  if (!command) throw Object.assign(new Error("openspec was not found on PATH"), { code: "ENOENT" });
  if (command.endsWith(".exe")) return exec(command, args, options);

  // npm installs a .cmd shim on Windows. Only allow plain CLI tokens in cmd.exe.
  if (args.some((argument) => !argument || /[^a-zA-Z0-9._-]/.test(argument)))
    throw new Error("Invalid OpenSpec CLI argument");
  return exec(
    path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "cmd.exe"),
    ["/d", "/v:off", "/s", "/c", `""%BB_OPENSPEC_CLI%" ${args.join(" ")}"`],
    {
      ...options,
      env: { ...options.env, BB_OPENSPEC_CLI: command },
      windowsVerbatimArguments: true,
    },
  );
}

export const runOpenSpec: RunOpenSpec = async (args, cwd) => {
  try {
    const result = await executeOpenSpec(args, cwd);
    return JSON.parse(result.stdout);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT")
      throw pluginError("error.cliRequired", {}, { cause });
    const output = (cause as { stdout?: string }).stdout;
    if (output) {
      let diagnostic:
        { status?: { message?: string; fix?: string }[] } | undefined;
      try {
        diagnostic = JSON.parse(output);
      } catch {
        /* Non-JSON CLI errors retain the process error below. */
      }
      const message = diagnostic?.status
        ?.map((item) => [item.message, item.fix].filter(Boolean).join(" "))
        .join("\n");
      if (message) throw new Error(message, { cause });
    }
    throw new Error(`OpenSpec: ${errorMessage(cause)}`, { cause });
  }
};

/** CLI resolves beta configuration once; native reads and watches use the resulting root. */
export class SourceResolver {
  private roots = new Map<string, Promise<PlanningSource>>();
  private catalogs = new Map<string, Promise<PlanningCatalog>>();
  constructor(private readonly run: RunOpenSpec = runOpenSpec) {}

  resolve(
    workspacePath: string,
    storeId?: string | null,
  ): Promise<PlanningSource> {
    if (!path.isAbsolute(workspacePath))
      throw pluginError("error.absolutePathRequired");
    if (storeId === null)
      return Promise.resolve({ storeId: null, rootPath: workspacePath });
    if (storeId !== undefined) storeIdSchema.parse(storeId);
    const key = `${workspacePath}\0${JSON.stringify(storeId)}`;
    let pending = this.roots.get(key);
    if (!pending) {
      pending = this.resolveRoot(workspacePath, storeId).catch((cause) => {
        this.roots.delete(key);
        throw cause;
      });
      this.roots.set(key, pending);
    }
    return pending;
  }

  private async resolveRoot(
    workspacePath: string,
    storeId?: string,
  ): Promise<PlanningSource> {
    // Local planning directories win over store pointers in OpenSpec; keep this path CLI-free.
    if (
      storeId === undefined &&
      ((await exists(path.join(workspacePath, "openspec/changes"))) ||
        (await exists(path.join(workspacePath, "openspec/specs"))))
    )
      return { storeId: null, rootPath: workspacePath };
    const args = [
      "context",
      "--json",
      ...(storeId ? ["--store", storeId] : []),
    ];
    const { root } = rootSchema.parse(await this.run(args, workspacePath));
    return { storeId: storeId ?? root.store_id ?? null, rootPath: root.path };
  }

  catalog(workspacePath: string): Promise<PlanningCatalog> {
    let pending = this.catalogs.get(workspacePath);
    if (!pending) {
      pending = this.run(["store", "list", "--json"], workspacePath)
        .then((result) => ({
          stores: storesSchema.parse(result).stores,
          warning: null,
        }))
        .catch((cause) => ({ stores: [], warning: errorMessage(cause) }));
      this.catalogs.set(workspacePath, pending);
    }
    return pending;
  }

  clear(workspacePath?: string) {
    if (!workspacePath) {
      this.roots.clear();
      this.catalogs.clear();
      return;
    }
    for (const key of this.roots.keys())
      if (key.startsWith(`${workspacePath}\0`)) this.roots.delete(key);
    this.catalogs.delete(workspacePath);
  }
}
