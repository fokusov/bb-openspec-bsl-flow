# Changelog

These versions record local development; they do not imply public releases.

## 0.6.2

- Register the fork as `openspec-bsl-flow` under the name OpenSpec BSL Flow. The original `openspec` can be installed alongside it.
- Show the read-only status of a BSL Flow Managed task linked to a change and thread.

## 0.6.1

- Resolve OpenSpec on Windows, including the npm command shim, for store discovery and selection.
- Read and watch BSL Flow review policy in the selected code worktree, even when multiple worktrees share an OpenSpec store.
- Open change-scoped verification reports and review waivers from the Changes panel. Document presence is displayed independently of the review and verification verdicts.

## 0.6.0 — BSL Flow edition

- Added a read-only BSL Flow stage view in Changes and in the linked thread panel.
- Show review status, next action and available evidence. A review receipt stops confirming the gate after its inputs change.
- Open the project test report as unbound context and retain the upstream task checklist and specification browser for standard OpenSpec.

## 0.5.0 — 2026-10-28

- Environment-scoped deep links establish shared navigation context, preserving the project when switching between Specs and Changes.

- Separate OpenSpec · Specs panel with a searchable recursive tree of current and active-change specifications.
- Read-only Current / Proposed / Compare, explicit change source, Git-style status and diagnostics for unresolved operations.
- Consistent Changes/Specs names, distinct icons and shared navigation planning context.
- Unified watcher pipeline with bounded pending event coalescing, shared caches and targeted specification invalidation.
- Specification namespaces reorganized into core, change-management and capability-management.
- English/Russian messages, narrow tree/document navigation, documentation and CLI projection conformance checks.

## 0.4.0 — 2026-10-28

- English, Russian and automatic browser-language selection through plugin settings.
- Live UI language changes preserve the selected change and edited launch prompt; typed catalogs, translated plugin errors and Intl counters.
- English launch templates and agent context, independent of UI locale.
- Git distribution preparation: MIT license, English and Russian documentation, CI and a clean production-dependency build check.
- SDK runtime helpers available during production-only Git builds.

## 0.3.0 — 2026-10-28

- OpenSpec stores beta: automatic discovery, explicit local source and registered stores on the environment machine.
- Independent planning roots and code environments; documents, watchers and thread bindings respect the selected source.
- Store context and `--store` in agent launch prompts; existing local bindings retained.
- Working agents first, followed by recently modified artifacts.
- Isolated integration checks using the OpenSpec CLI: `npm run test:stores`.

## 0.2.0 — 2026-10-28

- Shared native watchers and an incremental host index replace periodic file rereading.
- Reconnect recovery, plugin reload reconciliation and resource cleanup.
- Proportional task progress and explicit completion status on cards.
- Linked thread status and a slow animated working indicator.
- Binding updates reflected across views and thread context.
- Compact cards, collapsible context selection and icon tooltips.
- Direct file reading and OpenSpec CLI benchmarks on praxis and lore.

## 0.1.0 — 2026-10-28

- Active and archived OpenSpec change browser with read-only artifacts and checklists.
- Launch and attach agent threads in a selected environment.
- Navigation and thread panels.
