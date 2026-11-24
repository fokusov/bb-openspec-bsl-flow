import { z } from "zod";

export const bslFlowSchema = z.object({
  complexity: z.enum(["S", "M", "L"]).nullable(),
  spec: z.boolean(),
  review: z.enum([
    "unknown",
    "optional",
    "required",
    "awaiting-validation",
    "blocked",
    "stale",
    "passed",
    "limited",
  ]),
});

export type BslFlow = z.infer<typeof bslFlowSchema>;
