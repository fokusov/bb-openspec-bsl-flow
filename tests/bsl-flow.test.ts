import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { projectBslFlow } from "../src/bsl-flow";
import { OpenSpecIndex } from "../src/file-index";
import { WatchPool } from "../src/watch-pool";
import type { ExperimentalHostRpcContext } from "@get-bb/plugin-sdk/host";
import type { hostSignals } from "../src/host-contract";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
const spec = (complexity: "S" | "M" | "L", risk: string) =>
  Buffer.from(`# Change\n\n## Classification\n- Complexity: ${complexity}\n- Risk: ${risk}\n`);

function evidence() {
  const draft = spec("M", "medium");
  const original = Buffer.from("Implement the requested behaviour\n");
  const review = encode({
    schema_version: 1,
    verdict: "PASS",
    inputs: {
      spec_sha256: sha(draft),
      design_sha256: null,
      original_task_sha256: sha(original),
    },
  });
  const reconciliation = encode({ schema_version: 1 });
  const final = encode({
    schema_version: 1,
    passed: true,
    inputs: {
      final_spec_sha256: sha(draft),
      final_design_sha256: null,
      original_task_sha256: sha(original),
      review_sha256: sha(review),
      reconciliation_sha256: sha(reconciliation),
    },
  });
  return { spec: draft, original, design: null, review, reconciliation, final };
}

test("review is confirmed only by final validation bound to the current evidence", () => {
  const files = evidence();
  assert.equal(projectBslFlow(files, "optional").review, "passed");
  assert.equal(projectBslFlow({ ...files, final: null }, "optional").review, "awaiting-validation");
  assert.equal(projectBslFlow({ ...files, spec: Buffer.concat([files.spec, Buffer.from("new")]) }, "optional").review, "stale");
  assert.equal(projectBslFlow({ ...files, reconciliation: null }, "optional").review, "stale");
  assert.equal(projectBslFlow({ ...files, final: Buffer.from("{") }, "optional").review, "unknown");

  const final = JSON.parse(files.final.toString());
  final.schema_version = 2;
  final.verdict = "PASS_WITH_LIMITATIONS";
  assert.equal(projectBslFlow({ ...files, final: encode(final) }, "optional").review, "limited");
  final.passed = false;
  final.verdict = "BLOCKED";
  assert.equal(projectBslFlow({ ...files, final: encode(final) }, "optional").review, "blocked");
});

test("review requirements follow classification and the observed S route", () => {
  const files = { ...evidence(), final: null, review: null };
  assert.equal(projectBslFlow(files, "optional").review, "required");
  assert.equal(projectBslFlow({ ...files, spec: spec("S", "low") }, "optional").review, "optional");
  assert.equal(projectBslFlow({ ...files, spec: spec("S", "low") }, "required").review, "required");
  assert.equal(projectBslFlow({ ...files, spec: spec("S", "high") }, "optional").review, "required");
  assert.equal(projectBslFlow({ ...files, spec: null }, "optional").review, "unknown");
});

test("two indexes isolate BSL Flow changes and preserve standard OpenSpec task progress", async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), "bb-openspec-bsl-flow-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const prefix = "openspec/changes/same";
  const worktree = async (name: string) => {
    const root = path.join(base, name);
    await mkdir(path.join(root, prefix), { recursive: true });
    await writeFile(path.join(root, "openspec/config.yaml"), "schema: bsl-flow\n");
    await writeFile(path.join(root, "bsl-flow.yaml"), "review:\n  routing:\n    s_default: optional\n");
    return root;
  };
  const first = await worktree("first");
  const second = await worktree("second");
  await writeFile(path.join(first, prefix, "spec.md"), spec("S", "low"));
  await writeFile(path.join(second, prefix, "spec.md"), spec("M", "medium"));
  await writeFile(path.join(first, prefix, "tasks.md"), "- [x] A checkbox is not BSL Flow status\n");
  await mkdir(path.join(first, "openspec/changes/standard"));
  await writeFile(path.join(first, "openspec/changes/standard/.openspec.yaml"), "schema: spec-driven\n");
  await writeFile(path.join(first, "openspec/changes/standard/tasks.md"), "- [x] Standard task\n");
  const firstIndex = new OpenSpecIndex(first);
  const secondIndex = new OpenSpecIndex(second);
  await Promise.all([firstIndex.initialize(), secondIndex.initialize()]);
  const firstFlow = firstIndex.change("same").change;
  assert.equal(firstFlow.bslFlow?.review, "optional");
  assert.equal(firstFlow.total, 0);
  assert.deepEqual(firstFlow.artifacts.find((item) => item.kind === "specs")?.paths, ["changes/same/spec.md"]);
  assert.equal(secondIndex.change("same").change.bslFlow?.review, "required");
  const normal = firstIndex.change("standard").change;
  assert.equal(normal.bslFlow, undefined);
  assert.equal(normal.done, 1);

  await writeFile(path.join(first, prefix, "spec.md"), spec("L", "high"));
  await firstIndex.update([{ path: "changes/same/spec.md", type: "update" }]);
  assert.equal(firstIndex.change("same").change.bslFlow?.complexity, "L");
  assert.equal(secondIndex.change("same").change.bslFlow?.complexity, "M");
});

test("a shared planning store uses and watches each worktree's own review policy", async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), "bb-openspec-policy-"));
  const pool = new WatchPool();
  t.after(async () => {
    await pool.dispose();
    await rm(base, { recursive: true, force: true });
  });
  const workspacePath = path.join(base, "store");
  const changeDir = path.join(workspacePath, "openspec", "changes", "small");
  await mkdir(changeDir, { recursive: true });
  await writeFile(path.join(workspacePath, "openspec", "config.yaml"), "schema: bsl-flow\n");
  await writeFile(path.join(workspacePath, "bsl-flow.yaml"), "review: { routing: { s_default: required } }\n");
  await writeFile(path.join(changeDir, "spec.md"), spec("S", "low"));
  await writeFile(path.join(changeDir, "verification.md"), "# Verification\n");
  await writeFile(path.join(changeDir, "review-waiver.md"), "# Waiver\n");

  const first = { workspacePath, executionPath: path.join(base, "first") };
  const second = { workspacePath, executionPath: path.join(base, "second") };
  await Promise.all([first, second].map(({ executionPath }) => mkdir(executionPath)));
  await writeFile(path.join(first.executionPath, "bsl-flow.yaml"), "review: { routing: { s_default: optional } }\n");
  await writeFile(path.join(second.executionPath, "bsl-flow.yaml"), "review: { routing: { s_default: required } }\n");
  const context = {
    experimental_watch: async () => ({ dispose: async () => {} }),
    experimental_emitSignal: async () => {},
  } as unknown as ExperimentalHostRpcContext<typeof hostSignals>;
  await pool.subscribe({ ...first, environmentId: "first", subscriptionId: "first" }, context);
  await pool.subscribe({ ...second, environmentId: "second", subscriptionId: "second" }, context);
  assert.equal((await pool.snapshot(first)).changes[0].bslFlow?.review, "optional");
  const change = (await pool.change(second, "small")).change;
  assert.equal(change.bslFlow?.review, "required");
  assert.deepEqual(change.artifacts.filter((item) => item.kind === "verification" || item.kind === "review-waiver"), [
    { kind: "review-waiver", paths: ["changes/small/review-waiver.md"] },
    { kind: "verification", paths: ["changes/small/verification.md"] },
  ]);

  const replacement = path.join(second.executionPath, "bsl-flow.yaml.tmp");
  await writeFile(replacement, "review: { routing: { s_default: optional } }\n");
  await rename(replacement, path.join(second.executionPath, "bsl-flow.yaml"));
  for (let attempt = 0; attempt < 150; attempt++) {
    if ((await pool.change(second, "small")).change.bslFlow?.review === "optional") break;
    await delay(20);
  }
  assert.equal((await pool.change(second, "small")).change.bslFlow?.review, "optional");
  assert.equal((await pool.change(first, "small")).change.bslFlow?.review, "optional");
});
