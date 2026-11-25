import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { access, realpath, stat } from "node:fs/promises";
import {
  managedTaskIdSchema,
  parseManagedTaskEnvelope,
} from "./managed-task-contract";

const MAX_PROCESS_OUTPUT_BYTES = 1024 * 1024;
const POWERSHELL_ENV_KEYS = [
  "SystemRoot",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "PATH",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PROGRAMDATA",
  "OS",
  "PROCESSOR_ARCHITECTURE",
  "PSModulePath",
  "BSL_FLOW_HOST_PATH",
] as const;

function powershellEnvironment() {
  const env: NodeJS.ProcessEnv = {};
  for (const key of POWERSHELL_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

export function isPathWithin(root: string, target: string) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

export function managedTaskStatusArgs(
  projectPath: string,
  taskId: string,
  controllerScript: string,
) {
  if (!path.isAbsolute(projectPath))
    throw new Error("BSL Flow Status requires an absolute project path.");
  managedTaskIdSchema.parse(taskId);
  return [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    controllerScript,
    "-Action",
    "Status",
    "-ProjectPath",
    projectPath,
    "-TaskId",
    taskId,
    "-Format",
    "Json",
  ];
}

async function installedController(projectPath: string) {
  const skillsRoot = path.join(homedir(), ".agents", "skills");
  const candidate = path.join(
    skillsRoot,
    "1c-task",
    "scripts",
    "Invoke-BSLFlowTask.ps1",
  );
  let controller: string;
  try {
    const [verifiedSkillsRoot, verifiedController] = await Promise.all([
      realpath(skillsRoot),
      realpath(candidate),
    ]);
    controller = verifiedController;
    if (!(await stat(controller)).isFile()) throw new Error("not a file");
    const relative = path.relative(verifiedSkillsRoot, controller);
    if (
      relative === "" ||
      !isPathWithin(verifiedSkillsRoot, controller) ||
      path.normalize(relative).toLowerCase() !==
        path.join("1c-task", "scripts", "Invoke-BSLFlowTask.ps1").toLowerCase()
    )
      throw new Error("controller resolves outside installed skills");
  } catch (cause) {
    throw new Error(
      "Installed BSL Flow Managed controller is unavailable. A Core-only installation does not include this add-on; install it under ~/.agents/skills/1c-task/scripts.",
      { cause },
    );
  }
  if (isPathWithin(projectPath, controller))
    throw new Error("Installed BSL Flow controller resolves inside the selected project checkout.");
  return controller;
}

async function runPowerShell(args: string[], cwd: string) {
  const shell = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
  try {
    await access(shell);
  } catch (cause) {
    throw new Error("PowerShell 7 is unavailable for BSL Flow Status.", { cause });
  }
  return await new Promise<{ stdout: string; exitCode: number }>(
    (resolve, reject) => {
      const child = spawn(shell, args, {
        cwd,
        env: powershellEnvironment(),
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout: string[] = [];
      let outputBytes = 0;
      let settled = false;
      const fail = (cause: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        child.kill();
        reject(cause);
      };
      let timeout: ReturnType<typeof setTimeout>;
      timeout = setTimeout(() => {
        fail(new Error("BSL Flow Status timed out."));
      }, 30_000);
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        outputBytes += Buffer.byteLength(chunk);
        if (outputBytes > MAX_PROCESS_OUTPUT_BYTES)
          return fail(new Error("BSL Flow Status output exceeded the size limit."));
        stdout.push(chunk);
      });
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        outputBytes += Buffer.byteLength(chunk);
        if (outputBytes > MAX_PROCESS_OUTPUT_BYTES)
          fail(new Error("BSL Flow Status output exceeded the size limit."));
      });
      child.once("error", (cause) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(cause);
      });
      child.once("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ stdout: stdout.join(""), exitCode: code ?? 1 });
      });
    },
  );
}

export async function readManagedTaskStatus(projectPath: string, taskId: string) {
  if (process.platform !== "win32")
    throw new Error("BSL Flow Status requires the supported Windows PowerShell 7 runtime.");
  if (!path.isAbsolute(projectPath))
    throw new Error("BSL Flow Status requires an absolute project path.");
  managedTaskIdSchema.parse(taskId);
  const verifiedProjectPath = await realpath(projectPath);
  if (!(await stat(verifiedProjectPath)).isDirectory())
    throw new Error("BSL Flow Status project path is not a directory.");
  const controller = await installedController(verifiedProjectPath);
  const result = await runPowerShell(
    managedTaskStatusArgs(verifiedProjectPath, taskId, controller),
    verifiedProjectPath,
  );
  if (!result.stdout.trim())
    throw new Error(`BSL Flow Status returned no envelope (exit ${result.exitCode}).`);
  return parseManagedTaskEnvelope(result.stdout.trim(), taskId);
}
