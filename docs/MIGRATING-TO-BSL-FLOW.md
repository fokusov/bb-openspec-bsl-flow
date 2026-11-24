# Move an installed OpenSpec plugin to the BSL Flow fork

The original plugin and the fork use the same `openspec` ID. BB 0.50.1 refuses to install a different source while that ID is installed. A separate profile is the simplest way to evaluate both releases.

## Prepare an in-place migration

1. Record the upstream source and language with `bb plugin source openspec --json` and `bb plugin config openspec --json`.
2. In OpenSpec · Changes, record the active threads listed for each change that you need to carry forward. Include the project, environment, planning source, change ID and thread. Check each planning source separately.
3. Keep an independent backup of the BB profile if it contains historical or archived link metadata that you must retain. Standard OpenSpec artifacts are stored in the project or its planning store.

Confirm that the record includes the environments and planning sources you intend to migrate before removing the original installation.

## Switch the source

```sh
bb plugin remove openspec
bb plugin install 'git:https://github.com/fokusov/bb-openspec-bsl-flow.git@v0.6.0'
```

Restore the recorded language with `bb plugin config openspec set language <auto|en|ru>`. Open the recorded changes and compare the active links. For a missing link, select the recorded environment and planning source in OpenSpec · Changes. Open the recorded change, choose **Link thread**, then select the existing thread from that environment. Linking replaces any other binding for that thread. Archived changes are read-only in the plugin.

## Roll back

Save the current active bindings and language using the same procedure. Remove the fork, install the original recorded source and restore the language and any missing active bindings. A profile backup is required to restore historical data that falls outside the public attachment workflow.
