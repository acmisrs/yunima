import { createLayer, parseSprite, uid, type Layer } from "./model";
export interface ImportedSprite {
  id: string;
  name: string;
  sprite: ReturnType<typeof parseSprite>;
}
export function importIsdkai(
  value: unknown,
  base = "https://isdkai.pages.dev/",
): ImportedSprite[] {
  if (!value || typeof value !== "object")
    throw new Error("Archivo de Isdkai no válido.");
  const v = value as Record<string, any>;
  const entries =
    v.format === "wisdkai.project.v1"
      ? Object.entries(v.data?.sprites ?? {})
      : [[v.id ?? "sprite", v]];
  if (!entries.length || entries.length > 200)
    throw new Error("El archivo debe contener entre 1 y 200 sprites.");
  return entries.map(([id, definition]) => {
    const d = definition as Record<string, unknown>;
    return {
      id: String(id),
      name: String(d.name ?? id).slice(0, 200),
      sprite: parseSprite(d, base),
    };
  });
}
export function spriteLayer(item: ImportedSprite, duration: number): Layer {
  const f = item.sprite.frames[item.sprite.idleFrame],
    height = Math.min(600, item.sprite.logicalSize);
  return {
    ...createLayer("sprite", duration),
    id: uid(),
    name: item.name,
    width: (height * f.width) / f.height,
    height,
    sprite: structuredClone(item.sprite),
  };
}

// Existing SubaSites protocol: visitor-local, per-application storage, NOT SSO.
export function hostStorage(parentOrigin: string) {
  const origin = new URL(parentOrigin).origin;
  return (operation: "get" | "set" | "remove", key: string, value?: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      const id = uid();
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("SubaSites no ha respondido."));
      }, 3000);
      const listener = (event: MessageEvent) => {
        if (
          event.source !== window.parent ||
          event.origin !== origin ||
          event.data?.protocol !== "subasites.storage.v1" ||
          event.data.id !== id
        )
          return;
        cleanup();
        event.data.error
          ? reject(new Error(event.data.error))
          : resolve(event.data.result);
      };
      function cleanup() {
        clearTimeout(timer);
        window.removeEventListener("message", listener);
      }
      window.addEventListener("message", listener);
      window.parent.postMessage(
        { protocol: "subasites.storage.v1", id, operation, key, value },
        origin,
      );
    });
}
