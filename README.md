# Yunima · YouTube Animations

A browser animation studio for YouTube creators. Spanish UI. Built with React, TypeScript and Canvas; deployed as static files on Cloudflare Pages. Editing, persistence and export run on the device.

## Use

- Add text, rectangles, ellipses, images, containers or imported sprites.
- Select layers in the canvas, layer list or timeline. Only the selected layer's keyframes are displayed.
- Move the playhead, mark a key (`K`), move to another frame and edit a property. Once a layer has a key, changes to position, dimensions, rotation, scale and opacity create/update a key at the current frame.
- Right-click a layer to create a fade, upward entry, slide, scale entry or fade-out. Choose outgoing interpolation at a key: linear, accelerate, decelerate, smooth or step.
- Drag to move. Drag inside the bottom-right corner to resize. Hold Alt to bypass grid snapping. Use the inspector for precise dimensions and transforms.
- Set a parent container in Properties → Hierarchy. Coordinates are relative to the parent; transformations, opacity, visibility and active time cascade through containers. Reparenting deliberately retains local coordinates.
- Reorder, hide, lock, duplicate and remove layers. Duplicate/remove operates on the complete subtree. Undo/redo retains 50 changes.
- Drag timeline diamonds to move keys; moving onto an existing key replaces that key. Layer ranges can be trimmed with start/end frame fields.
- Use landscape YouTube, portrait Shorts or square canvases. Configure duration and frame rate after selecting Canvas settings.

IndexedDB saves the current project in this browser. It does not sync devices or accounts. Download `.yunima` backups; reopening a file validates its complete scene graph. New/open operations are undoable. Local images are included in project files as data URLs; no upload occurs.

## Isdkai import

Resources → Import sprites accepts a complete `.wisdkai` project (`wisdkai.project.v1`) or an individual sprite descriptor JSON from desktop/web Isdkai. Choose a sprite in the imported library to place it in the scene, and choose its animation section in Properties.

The adapter preserves source rectangles, section order, disabled frames, playback rate, idle frame, anchor, logical size, alignment offsets and absolute pixel-mask runs. Per-frame crops of different sizes share an anchor and a consistent reference scale. No game engine, scripts or Isdkai plugins execute inside Yunima.

Relative resource URLs resolve against `https://isdkai.pages.dev/` by default. Change the origin before importing desktop/custom-hosted resources. Remote images must still exist and permit CORS. Choose the original local spritesheet in Properties when necessary. The referenced production `james.png` returned HTTP 200 with `Access-Control-Allow-Origin: *` when checked on 2026-10-24. The test fixture contains its descriptor only, not the artwork.

## Export

| Output    | Behavior                                                                                                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebM      | Canvas + MediaRecorder, solid project background, no audio; records in real time at the project frame rate. Keep the tab visible. Chromium recommended. Requires a browser supporting WebM capture. |
| PNG       | Current frame at the project resolution; preserves transparency when enabled.                                                                                                                       |
| `.yunima` | Editable data-only project, with layers, hierarchy, media references and animation.                                                                                                                 |

WebM alpha and MP4 export are not implemented. GIF input is a static image; import an Isdkai sequence for frame-controlled animation. Text supports explicit line breaks and system fonts; font size/color/content are static, while transform properties are animated. Containers don't clip their children. One scene is supported per project.

## Integration boundaries

See [the architecture assessment](docs/INTEGRATIONS.md). Shared hosting or appearing in Masific's catalog does not create a shared API, identity or asset library. Isdkai file interoperability is implemented. A validated same-document `window.yunimaAPI.call(...)` interface is available for trusted callers. A SubaSites storage SDK adapter is prepared and requires a verified installation host; external project windows do not receive that bridge. No DarePass account/template connection or Masific production installation is claimed.

## Develop and deploy

Node 22.12+:

```sh
npm ci
npm run dev
npm run check
```

Production build: `npm run build`, output `dist/`. To publish to the existing Pages project after authenticating:

```sh
npm run deploy
```

No backend, Functions, databases, object storage, scheduled polling or CI workflows are provisioned. GitHub stores source; Cloudflare serves the static build. Project and media data stay in the visitor's browser, apart from ordinary requests to image URLs they import.
