import { evaluate, spriteIndex, type Project } from "./model";
import { matrix } from "./geometry";
export interface LoadedImage {
  image: HTMLImageElement;
  error: boolean;
}
export const images = new Map<string, LoadedImage>();
const subscribers = new Set<() => void>();
export function onImages(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
export function loadImage(src: string): LoadedImage {
  const existing = images.get(src);
  if (existing) return existing;
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.referrerPolicy = "no-referrer";
  const record = { image, error: false };
  images.set(src, record);
  image.onload = () => subscribers.forEach((fn) => fn());
  image.onerror = () => {
    record.error = true;
    subscribers.forEach((fn) => fn());
  };
  image.src = src;
  return record;
}
export async function preload(p: Project): Promise<void> {
  await Promise.all(
    p.layers
      .filter((l) => l.kind === "image" || l.kind === "sprite")
      .map(
        (l) =>
          new Promise<void>((resolve, reject) => {
            const src = l.sprite?.image ?? l.src,
              r = loadImage(src);
            const fail = () =>
              reject(
                new Error(
                  `No se puede cargar «${l.name}». Usa una imagen local o un servidor que permita CORS.`,
                ),
              );
            if (r.error) return fail();
            if (r.image.complete && r.image.naturalWidth) return resolve();
            r.image.addEventListener("load", () => resolve(), { once: true });
            r.image.addEventListener("error", fail, { once: true });
          }),
      ),
  );
}
const masks = new WeakMap<object, HTMLCanvasElement>();
export function render(
  ctx: CanvasRenderingContext2D,
  p: Project,
  frame: number,
  solid = false,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, p.width, p.height);
  if (!p.transparent || solid) {
    ctx.fillStyle = p.background;
    ctx.fillRect(0, 0, p.width, p.height);
  }
  function draw(parentId: string | null) {
    for (const l of p.layers.filter((l) => l.parentId === parentId)) {
      if (l.hidden || frame < l.start || frame >= l.end) continue;
      const v = evaluate(l, frame);
      ctx.save();
      ctx.transform(...matrix(v));
      ctx.globalAlpha *= v.opacity;
      ctx.fillStyle = l.color;
      if (l.kind === "rectangle") {
        ctx.beginPath();
        ctx.roundRect(0, 0, v.width, v.height, l.radius);
        ctx.fill();
      }
      if (l.kind === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(
          v.width / 2,
          v.height / 2,
          v.width / 2,
          v.height / 2,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      if (l.kind === "text") {
        ctx.font = `${l.fontWeight} ${l.fontSize}px "${l.fontFamily}"`;
        ctx.textBaseline = "top";
        ctx.textAlign = l.align;
        const x =
          l.align === "left" ? 0 : l.align === "center" ? v.width / 2 : v.width;
        l.text
          .split("\n")
          .forEach((line, i) => ctx.fillText(line, x, i * l.fontSize * 1.12));
      }
      if (l.kind === "image" || l.kind === "sprite") {
        const r = loadImage(l.sprite?.image ?? l.src);
        if (r.image.complete && r.image.naturalWidth && !r.error) {
          if (l.sprite) {
            const index = spriteIndex(l.sprite, frame - l.start, p.fps),
              f = l.sprite.frames[index];
            if (f) {
              let source: CanvasImageSource = r.image;
              let sx = f.x,
                sy = f.y;
              if (f.erasedRuns.length) {
                let canvas = masks.get(f);
                if (!canvas) {
                  canvas = document.createElement("canvas");
                  canvas.width = f.width;
                  canvas.height = f.height;
                  const c = canvas.getContext("2d")!;
                  c.drawImage(
                    r.image,
                    f.x,
                    f.y,
                    f.width,
                    f.height,
                    0,
                    0,
                    f.width,
                    f.height,
                  );
                  for (const run of f.erasedRuns)
                    c.clearRect(run.x - f.x, run.y - f.y, run.length, 1);
                  masks.set(f, canvas);
                }
                source = canvas;
                sx = 0;
                sy = 0;
              }
              ctx.imageSmoothingEnabled = false;
              const reference = l.sprite.frames[l.sprite.idleFrame],
                scaleX = v.width / reference.width,
                scaleY = v.height / reference.height,
                origin = l.sprite.origin;
              ctx.drawImage(
                source,
                sx,
                sy,
                f.width,
                f.height,
                ((reference.width - f.width) * origin.x + f.offsetX) * scaleX,
                ((reference.height - f.height) * origin.y + f.offsetY) * scaleY,
                f.width * scaleX,
                f.height * scaleY,
              );
            }
          } else {
            const ratio = Math.min(
                v.width / r.image.naturalWidth,
                v.height / r.image.naturalHeight,
              ),
              w = r.image.naturalWidth * ratio,
              h = r.image.naturalHeight * ratio;
            ctx.drawImage(r.image, (v.width - w) / 2, (v.height - h) / 2, w, h);
          }
        } else {
          ctx.fillStyle = "#c9bed9";
          ctx.fillRect(0, 0, v.width, v.height);
          ctx.fillStyle = "#4d3a64";
          ctx.font = "24px Arial";
          ctx.fillText(
            r.error ? "Imagen no disponible" : "Cargando imagen…",
            15,
            35,
          );
        }
      }
      draw(l.id);
      ctx.restore();
    }
  }
  draw(null);
}
