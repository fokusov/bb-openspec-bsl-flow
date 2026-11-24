import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { BslFlow } from "./bsl-flow-model";
import { LIMITS } from "./limits";
import { pluginError } from "./plugin-error";

const hash = z.string().regex(/^[a-f\d]{64}$/i);
const verdict = z.enum(["PASS", "PASS_WITH_LIMITATIONS", "REVISE", "BLOCK", "BLOCKED"]);
const reviewSchema = z.object({
  schema_version: z.union([z.literal(1), z.literal(2)]),
  verdict,
  inputs: z.object({
    spec_sha256: hash,
    design_sha256: hash.nullable(),
    original_task_sha256: hash,
  }),
});
const finalSchema = z.object({
  schema_version: z.union([z.literal(1), z.literal(2)]),
  passed: z.boolean(),
  verdict: verdict.optional().nullable(),
  inputs: z.object({
    final_spec_sha256: hash,
    final_design_sha256: hash.nullable(),
    original_task_sha256: hash,
    review_sha256: hash.nullable(),
    reconciliation_sha256: hash.nullable(),
  }),
});
const configSchema = z.object({ schema: z.string().optional() });
const sRouteSchema = z.object({
  review: z.object({
    routing: z.object({ s_default: z.enum(["optional", "required"]).optional() }).optional(),
  }).optional(),
});

export async function readScopedFile(root: string, relative: string) {
  const [actualRoot, actualFile] = await Promise.all([
    realpath(root),
    realpath(path.join(root, relative)),
  ]);
  const inside = path.relative(actualRoot, actualFile);
  if (inside === ".." || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside))
    throw pluginError("error.outsideWorkspace");
  const info = await stat(actualFile);
  if (!info.isFile() || info.size > LIMITS.fileBytes)
    throw pluginError("error.documentTooLarge");
  const bytes = await readFile(actualFile);
  if (bytes.length > LIMITS.fileBytes) throw pluginError("error.documentTooLarge");
  return bytes;
}

function yaml(bytes: Buffer): unknown {
  return parse(bytes.toString("utf8"), { maxAliasCount: 0 });
}

export async function readWorkflowSchema(root: string, file: string) {
  try {
    const parsed = configSchema.safeParse(yaml(await readScopedFile(root, file)) ?? {});
    return parsed.success ? parsed.data.schema : null;
  } catch {
    return null;
  }
}

export async function readSmallTaskRoute(workspacePath: string) {
  try {
    const config = sRouteSchema.safeParse(yaml(await readScopedFile(workspacePath, "bsl-flow.yaml")) ?? {});
    return config.success ? config.data.review?.routing?.s_default ?? "optional" : null;
  } catch {
    return null;
  }
}

function json(bytes: Buffer | null): unknown {
  if (!bytes) return null;
  try {
    return JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function digest(bytes: Buffer | null) {
  return bytes ? createHash("sha256").update(bytes).digest("hex") : null;
}

type Evidence = {
  spec: Buffer | null;
  design: Buffer | null;
  original: Buffer | null;
  review: Buffer | null;
  reconciliation: Buffer | null;
  final: Buffer | null;
};

export function projectBslFlow(files: Evidence, sRoute: "optional" | "required" | null): BslFlow {
  const specText = files.spec?.toString("utf8") ?? "";
  const complexityRows = [...specText.matchAll(/^\s*-\s*(?:Сложность|Complexity):[ \t]*(S|M|L)[ \t]*$/gim)];
  const riskRows = [...specText.matchAll(/^\s*-\s*(?:Риск|Risk):[ \t]*(low|medium|high)[ \t]*$/gim)];
  const complexity = complexityRows.length === 1
    ? z.enum(["S", "M", "L"]).parse(complexityRows[0][1]?.toUpperCase())
    : null;
  const risk = riskRows.length === 1 ? riskRows[0][1]?.toLowerCase() : null;
  const base = { complexity, spec: files.spec !== null };
  const specHash = digest(files.spec);
  const designHash = digest(files.design);
  const originalHash = digest(files.original);

  if (files.final) {
    const receipt = finalSchema.safeParse(json(files.final));
    if (!receipt.success) return { ...base, review: "unknown" };
    const { inputs, passed, verdict: result } = receipt.data;
    if (inputs.final_spec_sha256 !== specHash ||
        inputs.final_design_sha256 !== designHash ||
        inputs.original_task_sha256 !== originalHash ||
        inputs.review_sha256 !== digest(files.review) ||
        inputs.reconciliation_sha256 !== digest(files.reconciliation))
      return { ...base, review: "stale" };
    if (!passed) return { ...base, review: "blocked" };
    if (result === "PASS_WITH_LIMITATIONS")
      return { ...base, review: "limited" };
    if (files.review && (result === "PASS" || (receipt.data.schema_version === 1 && result === undefined)))
      return { ...base, review: "passed" };
    return { ...base, review: "unknown" };
  }

  if (files.review) {
    const review = reviewSchema.safeParse(json(files.review));
    if (!review.success) return { ...base, review: "unknown" };
    const { inputs, verdict: result } = review.data;
    if (inputs.spec_sha256 !== specHash ||
        inputs.design_sha256 !== designHash ||
        inputs.original_task_sha256 !== originalHash)
      return { ...base, review: "stale" };
    return {
      ...base,
      review: result === "PASS" || result === "PASS_WITH_LIMITATIONS" ? "awaiting-validation" : "blocked",
    };
  }

  if (complexity === "M" || complexity === "L" || risk === "high" ||
      (complexity === "S" && sRoute === "required"))
    return { ...base, review: "required" };
  if (complexity === "S" && (risk === "low" || risk === "medium") && sRoute === "optional")
    return { ...base, review: "optional" };
  return { ...base, review: "unknown" };
}

export async function readBslFlow(
  root: string,
  prefix: string,
  files: ReadonlySet<string>,
  sRoute: "optional" | "required" | null,
): Promise<BslFlow> {
  const read = (name: string) => {
    const relative = `${prefix}/${name}`;
    return files.has(relative) ? readScopedFile(root, relative) : Promise.resolve(null);
  };
  try {
    const [spec, design, original, review, reconciliation, final] = await Promise.all([
      read("spec.md"),
      read("design.md"),
      read("original-task.md"),
      read("review.json"),
      read("review-reconciliation.json"),
      read("final-validation.json"),
    ]);
    return projectBslFlow({ spec, design, original, review, reconciliation, final }, sRoute);
  } catch {
    return { complexity: null, spec: files.has(`${prefix}/spec.md`), review: "unknown" };
  }
}
