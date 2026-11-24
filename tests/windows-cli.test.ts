import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runOpenSpec } from "../src/source-resolver";

test("Windows OpenSpec uses the npm shim on PATH and passes validated arguments", { skip: process.platform !== "win32" }, async (t) => {
  const workspace = await mkdtemp(path.join(tmpdir(), "openspec-cli-"));
  const bin = path.join(workspace, "npm & %PATH% !");
  const priorPath = process.env.PATH;
  t.after(async () => {
    if (priorPath === undefined) delete process.env.PATH;
    else process.env.PATH = priorPath;
    await rm(workspace, { recursive: true, force: true });
  });
  await mkdir(bin);
  await writeFile(path.join(workspace, "openspec.cmd"), "@echo {\"shadowed\":true}\r\n");
  await writeFile(path.join(bin, "openspec.cmd"),
    '@echo off\r\necho {"args":"%*","telemetry":"%OPENSPEC_TELEMETRY%"}\r\n');
  process.env.PATH = `"${bin}"`;

  assert.deepEqual(await runOpenSpec(["context", "--json", "--store", "team-1.dev_2"], workspace), {
    args: "context --json --store team-1.dev_2",
    telemetry: "0",
  });
  await assert.rejects(runOpenSpec(["context", "--store", "invalid&token"], workspace), /Invalid OpenSpec CLI argument/);
  await assert.rejects(runOpenSpec(["context", "--store", "invalid\n"], workspace), /Invalid OpenSpec CLI argument/);
  process.env.PATH = ".";
  await assert.rejects(runOpenSpec(["store", "list", "--json"], workspace), /install OpenSpec CLI/i);
});
