export const FORMAT = "yunima.project.v1";
export type Kind =
  | "text"
  | "rectangle"
  | "ellipse"
  | "image"
  | "container"
  | "sprite";
export type Ease = "linear" | "ease-in" | "ease-out" | "ease-in-out" | "step";
export const PROPS = [
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "scale",
  "opacity",
] as const;
export type Pose = Record<(typeof PROPS)[number], number>;
export interface Keyframe {
  frame: number;
  value: Pose;
  easing: Ease;
}
export interface SpriteFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  enabled: boolean;
  erasedRuns: { x: number; y: number; length: number }[];
}
export interface Sprite {
  image: string;
  frames: SpriteFrame[];
  sections: { id: string; name: string; frameOrder: number[] }[];
  activeSectionID: string;
  frameRate: number;
  animationEnabled: boolean;
  idleFrame: number;
  origin: { x: number; y: number };
  logicalSize: number;
}
export interface Layer extends Pose {
  id: string;
  parentId: string | null;
  kind: Kind;
  name: string;
  hidden: boolean;
  locked: boolean;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  align: "left" | "center" | "right";
  color: string;
  radius: number;
  src: string;
  start: number;
  end: number;
  keyframes: Keyframe[];
  sprite?: Sprite;
}
export interface Project {
  format: typeof FORMAT;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  background: string;
  transparent: boolean;
  layers: Layer[];
}
export const uid = () => crypto.randomUUID();
export const clone = <T>(v: T): T => structuredClone(v);
export const pose = (layer: Pose): Pose =>
  Object.fromEntries(PROPS.map((k) => [k, layer[k]])) as Pose;
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export const eases: Ease[] = [
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step",
];
export function ease(t: number, mode: Ease) {
  if (mode === "step") return t < 1 ? 0 : 1;
  if (mode === "ease-in") return t * t * t;
  if (mode === "ease-out") return 1 - (1 - t) ** 3;
  if (mode === "ease-in-out")
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  return t;
}
export function evaluate(layer: Layer, frame: number): Pose {
  const keys = layer.keyframes;
  if (!keys.length) return pose(layer);
  if (frame <= keys[0].frame) return { ...keys[0].value };
  if (frame >= keys[keys.length - 1].frame)
    return { ...keys[keys.length - 1].value };
  const i = keys.findIndex((k) => k.frame > frame);
  const a = keys[i - 1],
    b = keys[i],
    t = ease((frame - a.frame) / (b.frame - a.frame), a.easing);
  return Object.fromEntries(
    PROPS.map((k) => [k, a.value[k] + (b.value[k] - a.value[k]) * t]),
  ) as Pose;
}
export function setKey(
  layer: Layer,
  frame: number,
  value = evaluate(layer, frame),
  easing: Ease = "ease-out",
): Layer {
  const previous = layer.keyframes.find((k) => k.frame === frame);
  return {
    ...layer,
    keyframes: [
      ...layer.keyframes.filter((k) => k.frame !== frame),
      { frame, value: { ...value }, easing: previous?.easing ?? easing },
    ].sort((a, b) => a.frame - b.frame),
  };
}
export function editPose(
  layer: Layer,
  frame: number,
  patch: Partial<Pose>,
): Layer {
  return layer.keyframes.length
    ? setKey(layer, frame, { ...evaluate(layer, frame), ...patch })
    : { ...layer, ...patch };
}
export function createLayer(kind: Kind, duration = 180): Layer {
  const names = {
    text: "Nuevo texto",
    rectangle: "Rectángulo",
    ellipse: "Elipse",
    image: "Imagen",
    container: "Contenedor",
    sprite: "Sprite",
  };
  return {
    id: uid(),
    parentId: null,
    kind,
    name: names[kind],
    x: 420,
    y: 320,
    width: kind === "text" ? 1000 : 360,
    height: kind === "text" ? 160 : 360,
    rotation: 0,
    scale: 1,
    opacity: 1,
    hidden: false,
    locked: false,
    text: "Tu próxima idea",
    fontSize: 96,
    fontFamily: "Arial",
    fontWeight: 700,
    align: "left",
    color: kind === "text" ? "#24212c" : "#bba4ff",
    radius: 24,
    src: "",
    start: 0,
    end: duration,
    keyframes: [],
  };
}
export function blankProject(): Project {
  return {
    format: FORMAT,
    name: "Mi animación",
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 180,
    background: "#f5f2eb",
    transparent: false,
    layers: [],
  };
}
export function demoProject(): Project {
  const p = blankProject();
  p.name = "Una idea en movimiento";
  const tag = {
    ...createLayer("rectangle"),
    name: "Etiqueta · fondo",
    x: 152,
    y: 158,
    width: 340,
    height: 62,
    radius: 31,
    color: "#dfd4fc",
  };
  const tagText = {
    ...createLayer("text"),
    name: "Etiqueta",
    x: 176,
    y: 174,
    width: 300,
    height: 38,
    fontSize: 27,
    fontWeight: 500,
    text: "HECHO PARA CREAR",
    color: "#574075",
  };
  let title = {
    ...createLayer("text"),
    name: "Título principal",
    x: 144,
    y: 288,
    width: 1560,
    height: 355,
    fontSize: 154,
    text: "Dale vida\na tus ideas.",
    fontWeight: 700,
  };
  title = setKey(
    setKey(
      setKey(title, 0, { ...pose(title), y: 360, opacity: 0 }),
      30,
      pose(title),
    ),
    150,
    pose(title),
  );
  const subtitle = {
    ...createLayer("text"),
    name: "Texto de apoyo",
    x: 154,
    y: 746,
    width: 1260,
    height: 90,
    fontSize: 34,
    fontWeight: 400,
    text: "Una historia. Infinitas formas de contarla.",
    color: "#76717d",
  };
  const circle = {
    ...createLayer("ellipse"),
    name: "Órbita violeta",
    x: 1490,
    y: 184,
    width: 200,
    height: 200,
    color: "#bba4ff",
  };
  const bar = {
    ...createLayer("rectangle"),
    name: "Acento",
    x: 153,
    y: 694,
    width: 105,
    height: 10,
    radius: 5,
    color: "#9a7bdc",
  };
  p.layers = [tag, tagText, title, subtitle, circle, bar];
  return p;
}
export function descendants(layers: Layer[], id: string): Set<string> {
  const found = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const l of layers)
      if (l.parentId && found.has(l.parentId) && !found.has(l.id)) {
        found.add(l.id);
        changed = true;
      }
  }
  return found;
}
export function removeLayer(p: Project, id: string): Project {
  const ids = descendants(p.layers, id);
  return { ...p, layers: p.layers.filter((l) => !ids.has(l.id)) };
}
export function duplicateLayer(
  p: Project,
  id: string,
): { project: Project; id: string } {
  const ids = descendants(p.layers, id),
    map = new Map([...ids].map((i) => [i, uid()]));
  const copies = p.layers
    .filter((l) => ids.has(l.id))
    .map((l) => {
      const next = {
        ...clone(l),
        id: map.get(l.id)!,
        parentId: map.get(l.parentId ?? "") ?? l.parentId,
        name: l.name + " · copia",
      };
      if (l.id === id) {
        next.x += 40;
        next.y += 40;
        next.keyframes = next.keyframes.map((k) => ({
          ...k,
          value: { ...k.value, x: k.value.x + 40, y: k.value.y + 40 },
        }));
      }
      return next;
    });
  return {
    project: { ...p, layers: [...p.layers, ...copies] },
    id: map.get(id)!,
  };
}
export function preset(
  layer: Layer,
  kind: "fade" | "rise" | "slide" | "pop" | "out",
  frame: number,
  duration: number,
  fps: number,
): Layer {
  const end = Math.min(duration - 1, frame + Math.round(fps * 0.8));
  if (end <= frame)
    throw new Error(
      "Mueve el cabezal antes del final para crear la animación.",
    );
  const base = evaluate(layer, frame),
    from = { ...base },
    to = { ...base };
  if (kind === "out") to.opacity = 0;
  else {
    from.opacity = 0;
    if (kind === "rise") from.y += 100;
    if (kind === "slide") from.x -= 180;
    if (kind === "pop") from.scale *= 0.65;
  }
  return setKey(setKey(layer, frame, from), end, to);
}
export function spriteIndex(
  sprite: Sprite,
  frame: number,
  fps: number,
): number {
  const section = sprite.sections.find((s) => s.id === sprite.activeSectionID);
  const order = (section?.frameOrder ?? sprite.frames.map((_, i) => i)).filter(
    (i) => sprite.frames[i]?.enabled,
  );
  if (!order.length) return -1;
  return sprite.animationEnabled
    ? order[
        Math.floor((Math.max(0, frame) / fps) * sprite.frameRate) % order.length
      ]
    : sprite.frames[sprite.idleFrame]?.enabled
      ? sprite.idleFrame
      : order[0];
}

// Strict boundary for files, storage and API callers. Rebuild only known fields.
const obj = (v: unknown): Record<string, any> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Se esperaba un objeto.");
  return v as Record<string, any>;
};
const num = (v: unknown, min: number, max: number, integer = false): number => {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    v < min ||
    v > max ||
    (integer && !Number.isInteger(v))
  )
    throw new Error("Valor numérico fuera de rango.");
  return v;
};
const str = (v: unknown, max = 200): string => {
  if (typeof v !== "string" || v.length > max)
    throw new Error("Texto no válido o demasiado largo.");
  return v;
};
const color = (v: unknown) => {
  const s = str(v, 7);
  if (!/^#[\da-f]{6}$/i.test(s)) throw new Error("Color no válido.");
  return s;
};
export function safeAsset(v: unknown, base?: string): string {
  const s = str(v, 12_000_000);
  if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z\d+/=\r\n]+$/.test(s))
    return s;
  let u: URL;
  try {
    u = new URL(s, base);
  } catch {
    throw new Error(
      "El recurso necesita una dirección HTTPS o un archivo de imagen.",
    );
  }
  if (
    u.protocol !== "https:" &&
    !(u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))
  )
    throw new Error("La dirección de imagen debe usar HTTPS.");
  if (u.username || u.password)
    throw new Error("No se admiten credenciales en las direcciones.");
  return u.href;
}
function parsePose(v: unknown): Pose {
  const o = obj(v);
  return {
    x: num(o.x, -100000, 100000),
    y: num(o.y, -100000, 100000),
    width: num(o.width, 1, 16384),
    height: num(o.height, 1, 16384),
    rotation: num(o.rotation, -36000, 36000),
    scale: num(o.scale, 0.01, 100),
    opacity: num(o.opacity, 0, 1),
  };
}
export function parseSprite(value: unknown, base?: string): Sprite {
  const s = obj(value);
  if (!Array.isArray(s.frames) || !s.frames.length || s.frames.length > 10000)
    throw new Error("El sprite no contiene fotogramas válidos.");
  const frames: SpriteFrame[] = s.frames.map((v: unknown) => {
    const f = obj(v);
    if (f.erasedRuns !== undefined && !Array.isArray(f.erasedRuns))
      throw new Error("Máscara no válida.");
    if ((f.erasedRuns?.length ?? 0) > 200000)
      throw new Error("Máscara demasiado grande.");
    return {
      x: num(f.x, 0, 65536, true),
      y: num(f.y, 0, 65536, true),
      width: num(f.width, 1, 16384, true),
      height: num(f.height, 1, 16384, true),
      offsetX: num(f.offsetX ?? 0, -16384, 16384),
      offsetY: num(f.offsetY ?? 0, -16384, 16384),
      enabled: f.enabled !== false,
      erasedRuns: (f.erasedRuns ?? []).map((r: unknown) => {
        const m = obj(r);
        return {
          x: num(m.x, 0, 65536, true),
          y: num(m.y, 0, 65536, true),
          length: num(m.length, 1, 65536, true),
        };
      }),
    };
  });
  if (!frames.some((f) => f.enabled))
    throw new Error("El sprite tiene todos sus fotogramas desactivados.");
  if (s.sections !== undefined && !Array.isArray(s.sections))
    throw new Error("Secuencias no válidas.");
  const sections = (s.sections ?? []).map((v: unknown) => {
    const o = obj(v);
    if (!Array.isArray(o.frameOrder) || o.frameOrder.length > 10000)
      throw new Error("Orden de animación no válido.");
    return {
      id: str(o.id),
      name: str(o.name),
      frameOrder: o.frameOrder.map((i: unknown) =>
        num(i, 0, frames.length - 1, true),
      ),
    };
  });
  if (
    new Set(sections.map((s: { id: string }) => s.id)).size !== sections.length
  )
    throw new Error("Secuencias duplicadas.");
  const activeSectionID = str(s.activeSectionID ?? sections[0]?.id ?? "");
  if (
    sections.length &&
    !sections.some((s: { id: string }) => s.id === activeSectionID)
  )
    throw new Error("No existe la secuencia activa.");
  return {
    image: safeAsset(s.image, base),
    frames,
    sections,
    activeSectionID,
    frameRate: num(s.frameRate ?? 8, 1, 60, true),
    animationEnabled: s.animationEnabled !== false,
    idleFrame: num(s.idleFrame ?? 0, 0, frames.length - 1, true),
    origin: {
      x: num(s.origin?.x ?? 0.5, 0, 1),
      y: num(s.origin?.y ?? 1, 0, 1),
    },
    logicalSize: num(s.logicalSize ?? 128, 1, 16384),
  };
}
export function parseProject(value: unknown): Project {
  const p = obj(value);
  if (p.format !== FORMAT)
    throw new Error("Este archivo no es un proyecto Yunima compatible.");
  const fps = num(p.fps, 1, 60, true),
    duration = num(p.duration, 2, Math.min(18000, fps * 300), true);
  if (!Array.isArray(p.layers) || p.layers.length > 200)
    throw new Error("El proyecto admite hasta 200 elementos.");
  const kinds: Kind[] = [
    "text",
    "rectangle",
    "ellipse",
    "container",
    "image",
    "sprite",
  ];
  const layers: Layer[] = p.layers.map((v: unknown) => {
    const l = obj(v);
    if (!kinds.includes(l.kind))
      throw new Error("Tipo de elemento no compatible.");
    if (!Array.isArray(l.keyframes) || l.keyframes.length > 2000)
      throw new Error("Demasiados fotogramas clave.");
    const keyframes: Keyframe[] = l.keyframes
      .map((v: unknown) => {
        const k = obj(v);
        if (!eases.includes(k.easing))
          throw new Error("Interpolación no válida.");
        return {
          frame: num(k.frame, 0, duration - 1, true),
          value: parsePose(k.value),
          easing: k.easing,
        };
      })
      .sort((a: Keyframe, b: Keyframe) => a.frame - b.frame);
    if (new Set(keyframes.map((k) => k.frame)).size !== keyframes.length)
      throw new Error("Fotogramas clave duplicados.");
    if (!["left", "center", "right"].includes(l.align))
      throw new Error("Alineación no válida.");
    const start = num(l.start, 0, duration - 1, true),
      end = num(l.end, start + 1, duration, true);
    const sprite = l.kind === "sprite" ? parseSprite(l.sprite) : undefined;
    return {
      ...parsePose(l),
      id: str(l.id),
      parentId: l.parentId === null ? null : str(l.parentId),
      kind: l.kind,
      name: str(l.name),
      hidden: l.hidden === true,
      locked: l.locked === true,
      text: str(l.text, 10000),
      fontSize: num(l.fontSize, 6, 512),
      fontFamily: ["Arial", "Georgia", "Verdana", "Courier New"].includes(
        l.fontFamily,
      )
        ? l.fontFamily
        : "Arial",
      fontWeight: num(l.fontWeight, 100, 900, true),
      align: l.align,
      color: color(l.color),
      radius: num(l.radius, 0, 8192),
      src: l.kind === "image" ? safeAsset(l.src) : "",
      start,
      end,
      keyframes,
      ...(sprite ? { sprite } : {}),
    };
  });
  const ids = new Map(layers.map((l) => [l.id, l]));
  if (ids.size !== layers.length)
    throw new Error("Identificadores de capa duplicados.");
  for (const l of layers) {
    const seen = new Set([l.id]);
    let parent = l.parentId;
    while (parent) {
      if (seen.has(parent))
        throw new Error("Los contenedores forman un ciclo.");
      seen.add(parent);
      const node = ids.get(parent);
      if (!node || node.kind !== "container")
        throw new Error("Contenedor inexistente.");
      parent = node.parentId;
    }
  }
  return {
    format: FORMAT,
    name: str(p.name),
    width: num(p.width, 64, 4096, true),
    height: num(p.height, 64, 4096, true),
    fps,
    duration,
    background: color(p.background),
    transparent: p.transparent === true,
    layers,
  };
}
