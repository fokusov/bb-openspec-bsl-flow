import assert from "node:assert/strict";
import { symlink } from "node:fs/promises";
import { platform } from "node:os";
import type { TestContext } from "node:test";

/** File symlinks need Developer Mode or elevation on Windows; skip only that unavailable OS capability. */
export async function createFileSymlinkOrSkip(
  t: TestContext,
  target: string,
  link: string,
): Promise<boolean> {
  try {
    await symlink(target, link, "file");
    return true;
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (platform() === "win32" && ["EPERM", "EACCES", "ENOTSUP"].includes(code ?? "")) {
      t.skip(`Windows file symlink capability unavailable (${code}); traversal assertion not run`);
      return false;
    }
    assert.fail(cause instanceof Error ? cause.message : String(cause));
  }
}
