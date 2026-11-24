# Move an installed OpenSpec plugin to the BSL Flow fork

The original plugin and the fork use the same `openspec` ID. BB 0.50.1 refuses to install a different source while that ID is installed. A separate profile is the simplest way to evaluate both releases.

## Prepare an in-place migration

1. Record the upstream source and language with `bb plugin source openspec --json` and `bb plugin config openspec --json`.
2. Record active thread links for each environment that uses OpenSpec. Save an input JSON file containing the environment ID and query `threadChoices` from the current plugin.
3. Keep an independent backup of the BB profile if it contains historical or archived link metadata that you must retain. Standard OpenSpec artifacts are stored in the project or its planning store.

Input for reading links:

```json
{"environmentId":"env_example"}
```

```sh
bb plugin rpc call openspec threadChoices --input-file environment.json --json
```

Save the thread `id`, `changeId` and `storeId` for rows that are linked. Confirm that the backup includes the environments you intend to migrate before removing the original installation.

## Switch the source

```sh
bb plugin remove openspec
bb plugin install 'git:https://github.com/fokusov/bb-openspec-bsl-flow.git@v0.6.0'
```

Restore the recorded language with `bb plugin config openspec set language <auto|en|ru>`. Run `threadChoices` again to compare the actual links. If an active link is absent or differs, restore it for the same environment using the recorded fields.

Example input for restoring an active link:

```json
{"environmentId":"env_example","threadId":"thr_example","changeId":"example","storeId":null}
```

```sh
bb plugin rpc call openspec attach --input-file binding.json --json
```

For a store-backed link, supply its recorded `storeId`. The attach operation updates the current binding of an existing thread. Check the selected change and planning source before using it. Archived changes are read-only in the plugin.

## Roll back

Save the current active bindings and language using the same procedure. Remove the fork, install the original recorded source and restore the language and any missing active bindings. A profile backup is required to restore historical data that falls outside the public attachment workflow.
