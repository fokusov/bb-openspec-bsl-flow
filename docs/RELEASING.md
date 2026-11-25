# Release preparation

Package `bb-plugin-openspec-bsl-flow` registers as `openspec-bsl-flow`. Its source is [fokusov/bb-openspec-bsl-flow](https://github.com/fokusov/bb-openspec-bsl-flow). The upstream implementation is credited in the package and retains its MIT copyright notice. Release `0.6.2` carries the new identity. The earlier tag `v0.6.1` registers as `openspec`.

## Local checks

Run these from the plugin checkout with BB on the command path:

```sh
npm ci --include=dev --ignore-scripts
npm run check
npm run verify:git-build
npm run test:stores
openspec validate --specs --strict --no-interactive
```

The production build fixture uses BB's Git-install dependency flags and verifies the identity in the server, app and host build metadata. `test:stores` requires the OpenSpec CLI. Install the original and the fork in a disposable BB profile to check distinct settings, navigation and thread metadata.

## Git release and marketplace

1. Review the exact release commit, MIT notice and package contents. Update listing screenshots if they no longer match the current interface.
2. Publish an authorized, immutable tag matching the package version. Verify the tag from a separate profile and confirm that BB installs it as `openspec-bsl-flow`. Existing tags retain their original identity.
3. Set the draft entry's source to a verified public ref with the new ID. Copy the entry, overview and screenshots from [marketplace](../marketplace/README.md) into the registry checkout.
4. Run the current [marketplace validation](https://github.com/get-bb/marketplace) before submission. Check release availability and source identity before switching the BB 1C bundle to this entry.

See [migration](MIGRATING-TO-BSL-FLOW.md) for the new settings and thread metadata namespace.
