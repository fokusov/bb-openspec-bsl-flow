# Move to OpenSpec BSL Flow

Version 0.6.2 registers as `openspec-bsl-flow`. BB stores plugin settings and thread metadata by plugin ID. Each plugin has its own language and thread links.

1. Check the old plugin with `bb plugin source openspec --json`. Record its language with `bb plugin config openspec --json`. For each active thread link to carry forward, record its environment, planning store, change, thread and optional Managed task UUID.
2. Install the fork from its checkout with `bb plugin install .`. For distribution, use the fork's verified Git release once it is published.
3. Restore the language with `bb plugin config openspec-bsl-flow set language <auto|en|ru>`.
4. Open **OpenSpec BSL Flow · Changes**. Select the recorded environment and planning source, then use **Link thread** on the corresponding change. Enter the recorded Managed task UUID if present. Verify the links before retiring the old installation. Reopen any saved side-panel tabs under the new plugin.

The old links stay in the `openspec` namespace. Archived changes are read-only. Keep a profile backup if you need to retain historical plugin state. Project and store artifacts remain in their existing directories.

To keep the original plugin alongside the fork, retain the upstream installation under `openspec`. If that ID is currently occupied by an earlier version of the fork, save its active links and settings before replacing it with the upstream source.
