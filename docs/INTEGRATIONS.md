# Integration assessment · 2026-10-24

## Decision

**Viable through versioned data adapters. Not automatically compatible through a common architecture.** Yunima implements an independent scene graph and animation engine, an Isdkai project/descriptor importer, a same-document API, and an opt-in SubaSites storage client. Cross-product accounts and live asset synchronization require additional contracts.

The assessment uses the actual sibling sources available in the workspace. They were read as references; this change does not modify or redeploy those applications.

## Evidence

| Product                                   | Inspected source                                                                                                                              | Observed contract                                                                                                                                      | Consequence                                                                                                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DarePass, repository `relled`             | `src/features/studio-canvas/{model.ts,README.md,sync.ts}`, `server/api`, `wrangler.toml`                                                      | React scene editor, validated scene data, local draft and `/api/v1/me/templates` account API; cookie sessions; Cloudflare Pages/D1                     | Its scene/editor approach is reusable conceptually. Authenticated templates are not public assets and have no demonstrated cross-origin OAuth/scope contract for Yunima.      |
| Desktop Isdkai                            | `README.md`, `docs/sprites.md`, `src/core/{GameAPI.js,DataRegistry.js,AdminBridge.js}`                                                        | `sprites.list/get/register/replace`; versioned JSON descriptors; local opt-in Node HTTP/WS/SSE admin bridge                                            | Import descriptors safely. Do not expose the development admin bridge or tokens to the public app.                                                                            |
| Current web iSDKai (`wisdkai`)            | `src/project/{model.js,demo.json}`, `src/studio/{runtime.js,fileio.js}`, `src/engine/game/{SpriteAlignment.js,JamesSprite.js}`, `README.md`   | `.wisdkai` / `wisdkai.project.v1`; `data.sprites`; same-origin parent/player JSON-RPC; local IndexedDB                                                 | File-based interoperability is immediately feasible. The player RPC is an internal same-origin bridge, not an authenticated cross-product asset service.                      |
| SubaSites / Masific (`SBSites/firstlook`) | `docs/{PROJECT_WINDOWS.md,PLUGIN_INSTALLATION_AND_APPLICATION_HOSTS.md,FANKAR_WEB.md}`, `plugins/mobile-shell/1.0.0/client/storage-bridge.js` | External website catalog/windows; separate installable web-application packages; `subasites.storage.v1` scoped to an installed app and browser visitor | Catalog presence is not an API integration. External website windows explicitly do not receive the installed-application storage bridge. The bridge is not SSO or cloud sync. |

## Implemented interchange

`src/integrations.ts` accepts:

1. A complete `wisdkai.project.v1` with `data.sprites` keyed by sprite ID.
2. A standalone descriptor with `image`, `frames`, `sections`, `activeSectionID`, `frameRate`, `animationEnabled`, `idleFrame`, `origin`, and `logicalSize`.

Source rectangles and non-destructive absolute `erasedRuns` are preserved. Disabled frames are skipped without changing the relative order of the enabled sequence. Alignment offsets are applied in source pixels. Anchor coordinates and a scale based on the idle/reference cell preserve alignment when frame dimensions differ. Sprites use the project clock and their own playback speed. Each placed sprite can also receive Yunima transform keyframes like any other layer.

Relative paths resolve against an explicit source origin, defaulting to the current Isdkai deployment. Remote sources require CORS for Canvas export. The user can replace the spritesheet with the original local PNG without losing its sequence metadata. No remote scripts are imported; unknown fields and executable/plugin fields are not retained. The source Isdkai project is not mutated.

## Yunima API v1

Available only in the Yunima document as `window.yunimaAPI`; no wildcard postMessage receiver, credentials, HTTP proxy or unauthenticated network endpoint is exposed.

```js
await window.yunimaAPI.call("api.describe");
const project = await window.yunimaAPI.call("project.get"); // defensive clone
await window.yunimaAPI.call("project.replace", project); // validated, undoable
await window.yunimaAPI.call("sprites.import", isdkaiProject); // populates library
```

Importing from the API populates the library; the user chooses which sprite to place. `project.replace` validates dimensions, duration, IDs, types, asset protocols, numeric bounds, keys, parent references and cycles before committing. Incompatible changes require a new format/API version.

## SubaSites compatibility and remaining installation work

The adapter uses the existing `subasites.storage.v1` envelope (`id`, `operation`, `key`, `value`) and accepts replies only from the exact parent window and expected origin. It has a three-second timeout and explicit error handling. The UI verifies the bridge before enabling host save/load. It enforces the observed 65,536-character value quota. Project validation is repeated on host restore.

**The deployed standalone Yunima site is not installed into Masific.** Merely embedding its URL does not grant this bridge. Publishing Yunima in the project catalog also requires Masific's `frame-src` allowlist and a catalog record. Yunima's `frame-ancestors` already permits `https://masific.com` and `https://www.masific.com` without opening arbitrary framing.

For an installed SubaSites package, prepare a separate relative-path build and `web-application` manifest, bundle required assets, and adapt default persistence to the opaque iframe's host SDK. The current package sandbox blocks arbitrary remote image URLs and direct IndexedDB, so shipping the standalone build as a package without these changes would be incorrect. Installation uses the existing authenticated Publisher API and existing R2/D1 quotas; no credentials belong in Yunima. This package installation has not been performed or advertised as available.

## Next live-connection contract

A shared read-only asset protocol can be added without merging the applications:

1. An asset reference carries `schemaVersion`, immutable `assetId`, `revision`, media URL, content hash and sprite/animation metadata.
2. The provider exposes explicit capability discovery and grants `assets:read` through a reviewed user-consent flow. Yunima never receives a Publisher/admin token.
3. Authorized cross-origin messages pin origin, source, request ID, supported method and payload limits. A host mediates only declared capabilities; it is not a general fetch proxy.
4. Imports are snapshots by default. Updating an imported revision is an explicit operation, so upstream edits cannot silently change an exported animation.
5. DarePass can consume a rendered animation or a future portable animation player. Importing its existing static scenes needs a separate adapter; its private account API is not reused without authorization.

This preserves independent deployment, versions and storage. No account service, billing product or infrastructure change is required for the implemented file-based path.
