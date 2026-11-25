import { specificationInputSchema, specificationCatalogSchema, specificationDocumentSchema } from "./specification-model";
import {
  defineRpcContract,
  type ExperimentalHostSignals,
} from "@get-bb/plugin-sdk";
import { z } from "zod";
import { changeSchema, groupSchema } from "./model";
import {
  managedTaskEnvelopeSchema,
  managedTaskIdSchema,
} from "./managed-task-contract";
import {
  sourceSelectionSchema,
  planningSourceSchema,
  planningCatalogSchema,
} from "./planning-source";

const sourceSchema = sourceSelectionSchema.extend({
  workspacePath: z.string().min(1),
});
const indexSourceSchema = sourceSchema.extend({ executionPath: z.string().min(1).optional() });
export const snapshotSchema = z.object({
  changes: z.array(changeSchema),
  missing: z.boolean(),
  watchError: z.string().nullable(),
});
export const hostContract = defineRpcContract({
  resolve: { input: sourceSchema, output: planningSourceSchema },
  catalog: { input: sourceSchema, output: planningCatalogSchema },
  specifications: { input: indexSourceSchema, output: specificationCatalogSchema },
  specification: { input: indexSourceSchema.extend(specificationInputSchema.shape), output: specificationDocumentSchema },
  snapshot: { input: indexSourceSchema, output: snapshotSchema },
  change: {
    input: indexSourceSchema.extend({ changeId: z.string() }),
    output: z.object({ change: changeSchema, groups: z.array(groupSchema) }),
  },
  managedTaskStatus: {
    input: z.object({
      workspacePath: z.string().min(1),
      taskId: managedTaskIdSchema,
    }),
    output: managedTaskEnvelopeSchema,
  },
  watch: {
    input: sourceSchema.extend({
      environmentId: z.string(),
      subscriptionId: z.string(),
    }),
    output: z.null(),
  },
  unwatch: {
    input: z.object({ subscriptionId: z.string() }),
    output: z.null(),
  },
  refresh: { input: sourceSchema, output: z.null() },
  reconcile: {
    input: z.object({
      subscriptions: z.array(
        sourceSchema.extend({
          environmentId: z.string(),
          subscriptionId: z.string(),
        }),
      ),
    }),
    output: z.null(),
  },
});
export const hostSignals = {
  changed: {
    payload: z.object({
      environmentId: z.string(),
      paths: z.array(z.string()),
      structural: z.boolean(),
      rescan: z.boolean(),
      error: z.string().nullable(),
    }),
  },
} satisfies ExperimentalHostSignals;
