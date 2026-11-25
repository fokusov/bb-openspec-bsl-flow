import { z } from "zod";

export const managedTaskIdSchema = z.string().uuid();
export const managedTaskEnvelopeSchema = z.object({
  schema_version: z.literal(1),
  task_id: managedTaskIdSchema,
  revision: z.number().int().nonnegative().nullable(),
  status: z.enum([
    "ready",
    "running",
    "needs_input",
    "blocked",
    "failed",
    "completed",
    "cancelled",
  ]),
  stage: z.string().nullable(),
  next_stage: z.string().nullable().optional(),
  next_action: z.string(),
  blockers: z.array(z.string()),
  evidence_refs: z.array(z.string()),
  worker_path: z.string().optional(),
  acceptance: z.unknown().nullable().optional(),
  unresolved_effect: z.unknown().nullable().optional(),
});
export type ManagedTaskEnvelope = z.infer<typeof managedTaskEnvelopeSchema>;

export function parseManagedTaskEnvelope(stdout: string, taskId: string) {
  managedTaskIdSchema.parse(taskId);
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch (cause) {
    throw new Error("BSL Flow Status returned invalid JSON.", { cause });
  }
  const envelope = managedTaskEnvelopeSchema.parse(json);
  if (envelope.task_id.toLowerCase() !== taskId.toLowerCase())
    throw new Error("BSL Flow Status returned a different task ID.");
  return envelope;
}
