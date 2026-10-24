# Yunima

An independent browser animation generator; not a video editor. UI language: Spanish.

- React + TypeScript, pure animation/scene model in `src/model.ts`, geometry in `src/geometry.ts`, shared Canvas renderer for preview and export in `src/render.ts`.
- Static Cloudflare Pages only. No new paid infrastructure, account backend, cloud storage, CI or remote execution without an explicit need and authorization. Keep all editing and media generation in the browser.
- Project files are data. Validate storage, file and API input with `parseProject`. Do not execute project scripts, Isdkai plugins or arbitrary HTML/SVG.
- Keep per-element keyframe maps and nested relative transforms. Timeline selection must not leak another layer's keys.
- Preserve Isdkai sequence order, disabled frames, speed, offsets and non-destructive masks. Test changes against the fixture and real source contracts.
- Existing sibling projects are references, not dependencies. Do not mutate them during Yunima work without authorization. Do not infer common auth or a shared asset API from shared hosting or a SubaSites catalog entry.
- `npm run check` must pass before publication. Run browser checks for changed interaction paths. Keep README and integration analysis honest about actual functionality and limits.
- Do not commit secrets, local credentials, exported user projects, node_modules or build output.
