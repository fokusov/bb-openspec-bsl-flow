import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  isPathWithin,
  managedTaskStatusArgs,
} from "../src/managed-task.ts";
import {
  parseManagedTaskEnvelope,
} from "../src/managed-task-contract.ts";

const taskId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

test("parses the public read-only Status envelope, including missing-task blockers", () => {
  const envelope = parseManagedTaskEnvelope(
    JSON.stringify({
      schema_version: 1,
      task_id: taskId,
      revision: null,
      status: "blocked",
      stage: null,
      next_action: "inspect_blocker",
      blockers: ["BF_INVALID: task does not exist."],
      evidence_refs: [],
    }),
    taskId,
  );
  assert.equal(envelope.status, "blocked");
  assert.deepEqual(envelope.blockers, ["BF_INVALID: task does not exist."]);
  assert.equal(envelope.next_stage, undefined);
  assert.equal(
    parseManagedTaskEnvelope(
      JSON.stringify({
        schema_version: 1,
        task_id: taskId,
        revision: 1,
        status: "ready",
        stage: "inspect",
        next_action: "review_request",
        blockers: [],
        evidence_refs: [],
      }),
      taskId.toUpperCase(),
    ).task_id,
    taskId,
  );
});

test("Status invocation binds only the selected absolute worktree and exact UUID", () => {
  const projectPath = path.join(tmpdir(), "worktree with spaces");
  const controllerScript = path.join(
    tmpdir(),
    "installed-skills",
    "1c-task",
    "scripts",
    "Invoke-BSLFlowTask.ps1",
  );
  assert.deepEqual(
    managedTaskStatusArgs(projectPath, taskId, controllerScript),
    [
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
    ],
  );
  assert.throws(
    () => managedTaskStatusArgs(projectPath, "not-a-uuid", controllerScript),
  );
  assert.throws(
    () => managedTaskStatusArgs("relative-project", taskId, controllerScript),
    /absolute project path/,
  );
});

test("controller path boundary accepts installed Core and rejects checkout paths", () => {
  const project = path.join(tmpdir(), "worktree");
  assert.equal(isPathWithin(project, path.join(project, ".git", "hooks")), true);
  assert.equal(isPathWithin(project, path.join(tmpdir(), "skills", "controller.ps1")), false);
  assert.equal(isPathWithin(project, `${project}-other${path.sep}controller.ps1`), false);
});

test("rejects an envelope for a different UUID", () => {
  assert.throws(
    () =>
      parseManagedTaskEnvelope(
        JSON.stringify({
          schema_version: 1,
          task_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          revision: 2,
          status: "running",
          stage: "verify",
          next_stage: "acceptance",
          next_action: "complete_verification",
          blockers: [],
          evidence_refs: [],
        }),
        taskId,
      ),
    /different task ID/,
  );
});
