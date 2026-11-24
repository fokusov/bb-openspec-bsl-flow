import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract, hostSignals } from "./src/host-contract";
import { WatchPool } from "./src/watch-pool";
import { SourceResolver } from "./src/source-resolver";

const pool = new WatchPool();
const resolver = new SourceResolver();
async function resolved(input: {
  workspacePath: string;
  executionPath?: string;
  storeId?: string | null;
}) {
  return resolver.resolve(input.workspacePath, input.storeId);
}
async function indexSource(input: Parameters<typeof resolved>[0]) {
  return {
    workspacePath: (await resolved(input)).rootPath,
    executionPath: input.executionPath ?? input.workspacePath,
  };
}
export default experimental_defineHostEntry({
  contract: hostContract,
  experimental_signals: hostSignals,
  handlers: {
    resolve: resolved,
    catalog: ({ workspacePath }) => resolver.catalog(workspacePath),
    specifications: async (input) => pool.specifications(await indexSource(input)),
    specification: async (input) => pool.specification(await indexSource(input), input.capabilityId, input.changeId),
    snapshot: async (input) => pool.snapshot(await indexSource(input)),
    change: async (input) =>
      pool.change(await indexSource(input), input.changeId),
    watch: async (input, context) => {
      await pool.subscribe(
        { ...input, ...await indexSource(input) },
        context,
      );
      return null;
    },
    unwatch: async ({ subscriptionId }) => {
      await pool.unsubscribe(subscriptionId);
      return null;
    },
    reconcile: async ({ subscriptions }, context) => {
      // Reconnect rechecks registry/config as well as files, without a periodic CLI process.
      for (const input of subscriptions) resolver.clear(input.workspacePath);
      const inputs = await Promise.all(
        subscriptions.map(async (input) => ({
          ...input,
          ...await indexSource(input),
        })),
      );
      await pool.reconcile(inputs, context);
      return null;
    },
    refresh: async (input) => {
      resolver.clear(input.workspacePath);
      await pool.refresh(await indexSource(input));
      return null;
    },
  },
  dispose: async () => {
    resolver.clear();
    await pool.dispose();
  },
});
