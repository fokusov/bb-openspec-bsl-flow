import { PLUGIN_ID } from "./identity";

export const liveTags = {
  specifications: (environmentId: string) => `${PLUGIN_ID}:specifications:${environmentId}`,
  specification: (environmentId: string, capabilityId: string) => `${PLUGIN_ID}:specification:${environmentId}:${capabilityId}`,
  binding: (threadId: string) => `${PLUGIN_ID}:binding:${threadId}`,
  environment: (environmentId: string) =>
    `${PLUGIN_ID}:environment:${environmentId}`,
  changes: (environmentId: string) => `${PLUGIN_ID}:changes:${environmentId}`,
  detail: (environmentId: string, changeId: string) =>
    `${PLUGIN_ID}:detail:${environmentId}:${changeId}`,
  document: (environmentId: string, file: string) =>
    `${PLUGIN_ID}:document:${environmentId}:${file}`,
  threads: (environmentId: string) => `${PLUGIN_ID}:threads:${environmentId}`,
};
