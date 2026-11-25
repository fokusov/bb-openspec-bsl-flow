import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createFakePluginHost,
  makeThreadResponse,
  experimental_scanPublicSdkOnly,
} from "@get-bb/plugin-sdk/testing";
import { artifactsFor, changeForPath } from "../src/change-paths.ts";
import plugin from "../server.ts";
import { rpcContract } from "../src/contract.ts";
import { ACTION, parseTasks, progress, changeTitle } from "../src/model.ts";

function setup() {
  const documents: Record<string, string> = {
    "changes/example/.openspec.yaml": "schema: spec-driven",
    "changes/example/proposal.md": "## Why\nExample",
    "changes/example/tasks.md":
      "## 1. Work\n- [x] 1.1 Read\n- [ ] 1.2 Implement",
    "changes/example/specs/feature/spec.md": "## Purpose\nFeature",
    "changes/draft/proposal.md": "Draft",
    "changes/archive/2026-10-01-old/tasks.md": "- [x] Done",
  };
  const state = {
    missing: false,
    failure: "",
    managedStatusError: "",
    managedStatusRequests: [] as { workspacePath: string; taskId: string }[],
    storeRoot: "/stores/team",
  };
  const { bb, harness } = createFakePluginHost({
    pluginId: "openspec-bsl-flow",
    experimental_callHostRpc: async ({ method, input }) => {
      if (state.failure) throw new Error(state.failure);
      if (method === "resolve") {
        const selection = input as {
          workspacePath: string;
          storeId?: string | null;
        };
        return {
          storeId: selection.storeId ?? null,
          rootPath: selection.storeId
            ? state.storeRoot
            : selection.workspacePath,
        };
      }
      if (method === "catalog")
        return { stores: [{ id: "team" }], warning: null };
      if (method === "managedTaskStatus") {
        const request = input as { workspacePath: string; taskId: string };
        state.managedStatusRequests.push(request);
        if (state.managedStatusError) throw new Error(state.managedStatusError);
        return {
          schema_version: 1,
          task_id: request.taskId,
          revision: 4,
          status: "running",
          stage: "verify",
          next_stage: "acceptance",
          next_action: "complete_verification",
          blockers: [],
          evidence_refs: [],
        };
      }
      if (method === "snapshot" || method === "change") {
        const selection = input as { workspacePath: string; executionPath: string };
        assert.ok(["/project", "/project-wt"].includes(selection.executionPath));
        assert.ok(["/project", "/project-wt", state.storeRoot].includes(selection.workspacePath));
      }
      const paths = Object.keys(documents);
      const ids = [
        ...new Set(
          paths.map(changeForPath).filter((id): id is string => id !== null),
        ),
      ];
      const changes = ids.map((id) => ({
        id,
        title: changeTitle(id),
        archived: id.startsWith("archive/"),
        artifacts: artifactsFor(paths, id),
        ...progress(parseTasks(documents[`changes/${id}/tasks.md`] ?? "")),
        error: null,
        updatedAt: 0,
      }));
      if (method === "snapshot")
        return {
          changes: state.missing ? [] : changes,
          missing: state.missing,
          watchError: null,
        };
      if (method === "change") {
        const id = (input as { changeId: string }).changeId;
        const change = changes.find((c) => c.id === id);
        if (!change) throw new Error("Изменение не найдено");
        return {
          change,
          groups: parseTasks(documents[`changes/${id}/tasks.md`] ?? ""),
        };
      }
      return null;
    },
  });
  harness.sdk.stub("subscribe", () => () => {});
  const environment = {
    id: "env-1",
    projectId: "project-1",
    path: "/project",
    hostId: "host-1",
    status: "ready",
    lifecycle: { phase: "active" },
    name: null,
    branchName: null,
  };
  harness.sdk.stub("environments.get", async () => environment);
  harness.sdk.stub("hosts.pathsExist", async () => ({
    existence: { "/project/openspec": true },
  }));
  harness.sdk.stub("files.listPaths", async () => ({
    paths: Object.keys(documents).map((file) => ({ path: file, kind: "file" })),
    truncated: false,
  }));
  harness.sdk.stub(
    "files.read",
    async (input: { path: string; hostId: string; rootPath: string }) => {
      assert.equal(input.hostId, "host-1");
      const logicalPath = (value: string) =>
        value.replaceAll("\\", "/").replace(/\/+/g, "/").replace(/\/$/, "");
      const root = logicalPath(input.rootPath);
      const file = logicalPath(input.path);
      assert.ok(
        ["/project/openspec", `${state.storeRoot}/openspec`].includes(root),
        `${root} is not a test OpenSpec root`,
      );
      assert.ok(file.startsWith(`${root}/`), `${file} is outside ${root}`);
      const relative = file.slice(root.length + 1);
      if (!(relative in documents)) throw new Error("ENOENT");
      return {
        content: documents[relative],
        contentEncoding: "utf8",
        sizeBytes: Buffer.byteLength(documents[relative]),
      };
    },
  );
  harness.sdk.stub("threads.list", async () => []);
  harness.sdk.stub("threads.spawn", async () =>
    makeThreadResponse({
      id: "new-thread",
      environmentId: "env-1",
      projectId: "project-1",
    }),
  );
  plugin(bb);
  return { bb, harness, documents, environment, state };
}

const target = { environmentId: "env-1", changeId: "example" };

test("reads active/archive progress and refreshes after agent changes", async () => {
  const { harness, documents } = setup();
  try {
    const read = async () =>
      rpcContract.changes.output.parse(
        await harness.behavior.callRpc("changes", { environmentId: "env-1" }),
      );
    const first = await read();
    assert.equal(first.changes.length, 3);
    assert.equal(
      first.changes.find((change) => change.id === "example")?.done,
      1,
    );
    assert.equal(first.changes.filter((change) => change.archived).length, 1);
    documents["changes/example/tasks.md"] =
      "- [x] 1.1 Read\n- [x] 1.2 Implement";
    assert.equal(
      (await read()).changes.find((change) => change.id === "example")?.done,
      2,
    );
    assert.equal(harness.inspection.sdk.callsTo("files.write").length, 0);
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("document reads reject traversal and files belonging to another change", async () => {
  const { harness } = setup();
  try {
    await assert.rejects(
      harness.behavior.callRpc("document", {
        ...target,
        path: "changes/draft/proposal.md",
      }),
      /artifact was not found/,
    );
    await assert.rejects(
      harness.behavior.callRpc("document", {
        ...target,
        changeId: "../private",
        path: "secret",
      }),
      /Invalid/,
    );
    assert.equal(harness.inspection.sdk.callsTo("files.read").length, 0);
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("launch reuses the selected environment, settings and edited prompt", async () => {
  const { harness } = setup();
  const execution = {
    providerId: "codex",
    model: "chosen",
    reasoningLevel: "high",
    permissionMode: "accept-edits",
    serviceTier: "default",
  };
  try {
    assert.deepEqual(
      await harness.behavior.callRpc("launch", {
        ...target,
        action: ACTION.APPLY,
        prompt: "Edited brief",
        execution,
      }),
      { threadId: "new-thread" },
    );
    const [spawn] = harness.inspection.sdk.callsTo("threads.spawn")[0] as [
      Record<string, unknown>,
    ];
    assert.deepEqual(spawn.environment, {
      type: "reuse",
      environmentId: "env-1",
    });
    assert.equal(spawn.projectId, "project-1");
    assert.equal(spawn.model, execution.model);
    assert.equal(spawn.permissionMode, execution.permissionMode);
    assert.match(String(spawn.prompt), /Edited brief/);
    assert.ok(
      String(spawn.prompt)
        .replaceAll("\\", "/")
        .replace(/\/+/g, "/")
        .includes("changes/example"),
    );
    assert.deepEqual(spawn.pluginMetadata, { ...target, storeId: null });
    assert.equal(spawn.visibility, "visible");
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("launch refuses draft implementation and archived changes without spawning", async () => {
  const { harness } = setup();
  try {
    await assert.rejects(
      harness.behavior.callRpc("launch", {
        ...target,
        changeId: "draft",
        action: ACTION.APPLY,
        prompt: "Do it",
        execution: null,
      }),
      /tasks.md/,
    );
    await assert.rejects(
      harness.behavior.callRpc("launch", {
        ...target,
        changeId: "archive/2026-10-01-old",
        action: ACTION.EXPLORE,
        prompt: "Do it",
        execution: null,
      }),
      /Archived/,
    );
    assert.equal(harness.inspection.sdk.callsTo("threads.spawn").length, 0);
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("attachment only writes metadata and rejects another environment", async () => {
  const { harness } = setup();
  try {
    harness.sdk.stub("threads.get", async () =>
      makeThreadResponse({ environmentId: "other" }),
    );
    await assert.rejects(
      harness.behavior.callRpc("attach", { ...target, threadId: "thread" }),
      /same environment/,
    );
    harness.sdk.stub("threads.get", async () =>
      makeThreadResponse({ environmentId: "env-1" }),
    );
    harness.sdk.stub("threads.updatePluginMetadata", async () => target);
    assert.deepEqual(
      await harness.behavior.callRpc("attach", {
        ...target,
        threadId: "thread",
      }),
      { ok: true },
    );
    const [metadataUpdate] = harness.inspection.sdk.callsTo(
      "threads.updatePluginMetadata",
    )[0] as [{ remove?: string[] }];
    assert.deepEqual(metadataUpdate.remove, ["managedTask"]);
    assert.equal(harness.inspection.sdk.callsTo("threads.send").length, 0);
    assert.equal(harness.inspection.sdk.callsTo("threads.spawn").length, 0);
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("managed task links bind the exact UUID to its change, source, and worktree", async () => {
  const { harness } = setup();
  const first = makeThreadResponse({ id: "thread-1", environmentId: "env-1" });
  const second = makeThreadResponse({ id: "thread-2", environmentId: "env-2" });
  const firstTask = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const secondTask = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const metadata = new Map<string, Record<string, unknown>>();
  let selectedThread = first;
  const targetFor = (environmentId: string, changeId: string, storeId: string | null) => ({
    environmentId,
    changeId,
    storeId,
  });
  harness.sdk.stub("environments.get", async ({ environmentId }: { environmentId: string }) => ({
    id: environmentId,
    projectId: "project-1",
    path: environmentId === "env-1" ? "/project" : "/project-wt",
    hostId: "host-1",
    status: "ready",
    lifecycle: { phase: "active" },
    name: environmentId,
    branchName: null,
  }));
  harness.sdk.stub("threads.get", async () => selectedThread);
  harness.sdk.stub("threads.list", async ({ environmentId }: { environmentId: string }) =>
    environmentId === "env-1" ? [first] : [second],
  );
  harness.sdk.stub("threads.experimental_listPluginMetadata", async ({ threadIds }: { threadIds: string[] }) => ({
    threads: threadIds.map((threadId) => ({ threadId, metadata: metadata.get(threadId) ?? {} })),
  }));
  harness.sdk.stub("threads.updatePluginMetadata", async ({ threadId, set }: { threadId: string; set: Record<string, unknown> }) => {
    metadata.set(threadId, set);
    return set;
  });
  try {
    selectedThread = first;
    await harness.behavior.callRpc("attach", {
      ...targetFor("env-1", "example", null),
      threadId: first.id,
      managedTaskId: firstTask,
    });
    selectedThread = second;
    await harness.behavior.callRpc("attach", {
      ...targetFor("env-2", "example", "team"),
      threadId: second.id,
      managedTaskId: secondTask,
    });
    assert.deepEqual(metadata.get(first.id), {
      environmentId: "env-1",
      changeId: "example",
      storeId: null,
      managedTask: {
        taskId: firstTask,
        environmentId: "env-1",
        changeId: "example",
        storeId: null,
      },
    });
    assert.deepEqual(metadata.get(second.id), {
      environmentId: "env-2",
      changeId: "example",
      storeId: "team",
      managedTask: {
        taskId: secondTask,
        environmentId: "env-2",
        changeId: "example",
        storeId: "team",
      },
    });
    const firstChoices = rpcContract.threadChoices.output.parse(
      await harness.behavior.callRpc("threadChoices", { environmentId: "env-1" }),
    );
    const secondChoices = rpcContract.threadChoices.output.parse(
      await harness.behavior.callRpc("threadChoices", { environmentId: "env-2" }),
    );
    assert.equal(firstChoices[0]?.managedTaskId, firstTask);
    assert.equal(firstChoices[0]?.changeId, "example");
    assert.equal(firstChoices[0]?.storeId, null);
    assert.equal(secondChoices[0]?.managedTaskId, secondTask);
    assert.equal(secondChoices[0]?.changeId, "example");
    assert.equal(secondChoices[0]?.storeId, "team");
    metadata.set(first.id, {
      ...metadata.get(first.id),
      managedTask: {
        taskId: firstTask,
        environmentId: "env-2",
        changeId: "example",
        storeId: null,
      },
    });
    const mismatched = rpcContract.threadChoices.output.parse(
      await harness.behavior.callRpc("threadChoices", { environmentId: "env-1" }),
    );
    assert.equal(mismatched[0]?.managedTaskId, null);
    assert.equal(mismatched[0]?.changeId, "example");
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("detail reads Status for the linked UUID on the selected code worktree and isolates controller errors", async () => {
  const { harness, state } = setup();
  const taskId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const thread = makeThreadResponse({
    id: "managed-thread",
    environmentId: "env-1",
    projectId: "project-1",
  });
  harness.sdk.stub("threads.list", async () => [thread]);
  harness.sdk.stub("threads.experimental_listPluginMetadata", async () => ({
    threads: [{
      threadId: thread.id,
      metadata: {
        environmentId: "env-1",
        changeId: "example",
        storeId: "team",
        managedTask: {
          taskId,
          environmentId: "env-1",
          changeId: "example",
          storeId: "team",
        },
      },
    }],
  }));
  try {
    const result = rpcContract.detail.output.parse(
      await harness.behavior.callRpc("detail", {
        ...target,
        storeId: "team",
      }),
    );
    assert.deepEqual(state.managedStatusRequests, [
      { workspacePath: "/project", taskId },
    ]);
    assert.equal(result.threads[0]?.managedTaskStatus?.task_id, taskId);
    assert.equal(result.threads[0]?.managedTaskStatus?.status, "running");
    assert.equal(result.threads[0]?.managedTaskStatus?.next_action, "complete_verification");

    state.managedStatusError = "BSL Flow controller is unavailable.";
    const unavailable = rpcContract.detail.output.parse(
      await harness.behavior.callRpc("detail", {
        ...target,
        storeId: "team",
      }),
    );
    assert.equal(unavailable.groups.length, result.groups.length);
    assert.equal(unavailable.threads[0]?.managedTaskStatus, null);
    assert.match(unavailable.threads[0]?.managedTaskError ?? "", /unavailable/);
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("package only uses the public SDK", async () => {
  const scan = await experimental_scanPublicSdkOnly(process.cwd(), {
    allow: [
      /^react(?:-dom)?$/,
      /^@radix-ui\/react-(?:slot|dialog|tooltip)$/,
      /^@\/components\/ui\/(?:button|input|icon|dialog|tooltip)$/,
      /^(?:class-variance-authority|clsx|tailwind-merge)$/,
      /^yaml$/,
    ],
  });
  assert.deepEqual(scan.violations, []);
  assert.deepEqual(scan.privateDependencies, []);
});

test("missing OpenSpec is distinct from an unavailable host", async () => {
  const { harness, state } = setup();
  try {
    state.missing = true;
    assert.deepEqual(
      await harness.behavior.callRpc("changes", { environmentId: "env-1" }),
      {
        changes: [],
        missing: true,
        watchError: null,
        source: { storeId: null, rootPath: "/project" },
      },
    );
    state.failure = "Machine offline";
    await assert.rejects(
      harness.behavior.callRpc("changes", { environmentId: "env-1" }),
      /Machine offline/,
    );
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("root-level notes are not changes and oversized documents fail explicitly", async () => {
  const { harness, documents } = setup();
  try {
    documents["changes/README.md"] = "Notes";
    const result = rpcContract.changes.output.parse(
      await harness.behavior.callRpc("changes", { environmentId: "env-1" }),
    );
    assert.equal(result.changes.length, 3);
    documents["changes/example/proposal.md"] = "x".repeat(512 * 1024 + 1);
    await assert.rejects(
      harness.behavior.callRpc("document", {
        ...target,
        path: "changes/example/proposal.md",
      }),
      /512/,
    );
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("reattachment persists across reads and invalidates both cards and thread context", async () => {
  const { bb, harness } = setup();
  const invalidations: string[][] = [];
  bb.rpc.experimental_invalidate = (tags) => {
    invalidations.push([...tags]);
  };
  let metadata = { environmentId: "env-1", changeId: "draft" };
  const thread = makeThreadResponse({
    id: "thread",
    environmentId: "env-1",
    projectId: "project-1",
  });
  harness.sdk.stub("threads.get", async () => thread);
  harness.sdk.stub("threads.list", async () => [thread]);
  harness.sdk.stub("projects.list", async () => []);
  harness.sdk.stub("environments.list", async () => []);
  harness.sdk.stub(
    "threads.updatePluginMetadata",
    async (input: { set: typeof metadata }) => {
      metadata = input.set;
      return metadata;
    },
  );
  harness.sdk.stub("threads.getPluginMetadata", async () => metadata);
  harness.sdk.stub("threads.experimental_listPluginMetadata", async () => ({
    threads: [{ threadId: "thread", metadata }],
  }));
  try {
    await harness.behavior.callRpc("attach", { ...target, threadId: "thread" });
    for (const changeId of ["draft", "example", "draft", "example"]) {
      const detail = rpcContract.detail.output.parse(
        await harness.behavior.callRpc("detail", { ...target, changeId }),
      );
      assert.equal(detail.threads.length, changeId === "example" ? 1 : 0);
    }
    const sources = rpcContract.sources.output.parse(
      await harness.behavior.callRpc("sources", { threadId: "thread" }),
    );
    assert.equal(sources.preferredChangeId, "example");
    const cards = rpcContract.changes.output.parse(
      await harness.behavior.callRpc("changes", { environmentId: "env-1" }),
    );
    assert.equal(
      cards.changes.find((c) => c.id === "example")?.threads[0]?.id,
      "thread",
    );
    assert.equal(
      cards.changes.find((c) => c.id === "draft")?.threads.length,
      0,
    );
    assert.deepEqual(invalidations.at(-1), [
      "openspec-bsl-flow:threads:env-1",
      "openspec-bsl-flow:changes:env-1",
      "openspec-bsl-flow:binding:thread",
    ]);
    invalidations.length = 0;
    await harness.behavior.emitThreadEvent("thread.active", { thread });
    assert.deepEqual(invalidations.at(-1), [
      "openspec-bsl-flow:threads:env-1",
      "openspec-bsl-flow:changes:env-1",
    ]);
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("store bindings are isolated from an identical local change and launches keep the code environment", async () => {
  const { harness, state } = setup();
  const local = makeThreadResponse({
    id: "local-thread",
    environmentId: "env-1",
    projectId: "project-1",
  });
  const stored = makeThreadResponse({
    id: "store-thread",
    environmentId: "env-1",
    projectId: "project-1",
  });
  let metadata: {
    environmentId: string;
    changeId: string;
    storeId?: string | null;
  } = { ...target, storeId: "team" };
  harness.sdk.stub("threads.list", async () => [local, stored]);
  harness.sdk.stub("threads.get", async () => stored);
  harness.sdk.stub("projects.list", async () => []);
  harness.sdk.stub("environments.list", async () => []);
  harness.sdk.stub("threads.getPluginMetadata", async () => metadata);
  harness.sdk.stub("threads.experimental_listPluginMetadata", async () => ({
    threads: [
      { threadId: "local-thread", metadata: target },
      { threadId: "store-thread", metadata },
    ],
  }));
  harness.sdk.stub(
    "threads.updatePluginMetadata",
    async (input: { set: typeof metadata }) => {
      metadata = input.set;
      return metadata;
    },
  );
  try {
    const read = async (storeId: string | null) =>
      rpcContract.changes.output.parse(
        await harness.behavior.callRpc("changes", {
          environmentId: "env-1",
          storeId,
        }),
      );
    assert.deepEqual(
      (await read(null)).changes
        .find((c) => c.id === "example")
        ?.threads.map((t) => t.id),
      ["local-thread"],
    );
    assert.deepEqual(
      (await read("team")).changes
        .find((c) => c.id === "example")
        ?.threads.map((t) => t.id),
      ["store-thread"],
    );
    const sources = rpcContract.sources.output.parse(
      await harness.behavior.callRpc("sources", { threadId: "store-thread" }),
    );
    assert.equal(sources.preferredStoreId, "team");
    const doc = rpcContract.document.output.parse(
      await harness.behavior.callRpc("document", {
        ...target,
        storeId: "team",
        path: "changes/example/proposal.md",
      }),
    );
    assert.equal(
      doc.absolutePath.replaceAll("\\", "/").replace(/\/+/g, "/"),
      `${state.storeRoot}/openspec/changes/example/proposal.md`,
    );
    await harness.behavior.callRpc("launch", {
      ...target,
      storeId: "team",
      action: ACTION.APPLY,
      prompt: "Implement shared change",
      execution: null,
    });
    const [spawn] = harness.inspection.sdk.callsTo("threads.spawn")[0] as [
      Record<string, unknown>,
    ];
    assert.deepEqual(spawn.environment, {
      type: "reuse",
      environmentId: "env-1",
    });
    assert.deepEqual(spawn.pluginMetadata, { ...target, storeId: "team" });
    assert.match(String(spawn.prompt), /--store "team"/);
    assert.ok(
      String(spawn.prompt)
        .replaceAll("\\", "/")
        .replace(/\/+/g, "/")
        .includes(`${state.storeRoot}/openspec/changes/example`),
    );
    await harness.behavior.callRpc("attach", {
      ...target,
      storeId: null,
      threadId: "store-thread",
    });
    assert.equal(metadata.storeId, null);
    assert.equal(
      (await read("team")).changes.find((c) => c.id === "example")?.threads
        .length,
      0,
    );
  } finally {
    await harness.lifecycle.dispose();
  }
});
