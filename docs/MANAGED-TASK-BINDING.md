# Explicit Managed task links

OpenSpec can store an operator-entered BSL Flow task UUID alongside its existing thread binding. In the **Link thread** dialog, enter the exact UUID for the selected change. The plugin records the task UUID together with the project environment, OpenSpec change ID, and planning source ID (local or store).

The field does not discover tasks and does not read controller state. The plugin does not infer a link from a thread, folder name, task title, or matching UUID. A task link is returned only when its recorded environment, change, and planning source still match the containing thread binding. A mismatched or malformed task link is ignored while the ordinary thread binding remains usable.

Relinking a thread to another change or planning source clears the task UUID unless the operator enters it again. Bindings in the same plugin namespace remain compatible. To carry a binding from the legacy `openspec` ID to `openspec-bsl-flow`, follow the [migration guide](MIGRATING-TO-BSL-FLOW.md).

The detail card makes one read-only `Status` call for each explicitly linked task. It passes only the selected code worktree and the exact UUID to the installed BSL Flow PowerShell 7 controller, with `-Format Json`; it never calls `Run`, `Next -Format Prompt`, initialization, models, or tests. The controller is loaded only from the installed global `~/.agents/skills/1c-task/scripts` path, never from project source, and its resolved path must remain inside that installed skill directory and outside the selected checkout. BSL Flow Core's `1c-task` skill alone does not include the Managed controller; the separate Managed add-on must be installed there. A missing task is shown from the controller's `blocked` envelope. Missing add-on, timeout, invalid output, or other invocation errors appear as an unavailable status without hiding the rest of the change card. Process output is limited to 1 MiB and raw stderr is not displayed.

The card shows the controller's status, registered stage, next action, and blockers. History remains out of scope until BSL Flow exposes a supported read-only history envelope suitable for this view.
