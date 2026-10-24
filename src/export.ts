import { render, preload } from "./render";
import type { Project } from "./model";
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const filename = (p: Project) =>
  p.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "yunima";
export function exportProject(p: Project) {
  download(
    new Blob([JSON.stringify(p, null, 2)], { type: "application/json" }),
    filename(p) + ".yunima",
  );
}
function canvas(p: Project) {
  const c = document.createElement("canvas");
  c.width = p.width;
  c.height = p.height;
  return c;
}
export async function exportPNG(p: Project, frame: number) {
  await preload(p);
  const c = canvas(p);
  render(c.getContext("2d")!, p, frame);
  const blob = await new Promise<Blob>((resolve, reject) =>
    c.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("No se ha podido generar el PNG.")),
      "image/png",
    ),
  );
  download(blob, filename(p) + ".png");
}
export async function exportVideo(
  p: Project,
  onProgress: (value: number) => void,
  signal: AbortSignal,
) {
  if (
    typeof MediaRecorder === "undefined" ||
    !HTMLCanvasElement.prototype.captureStream
  )
    throw new Error(
      "Este navegador no permite exportar vídeo. Prueba con Chrome o Edge.",
    );
  const mime = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ].find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime)
    throw new Error(
      "Este navegador no puede generar WebM. Prueba con Chrome o Edge.",
    );
  await preload(p);
  if (signal.aborted) return;
  const c = canvas(p),
    ctx = c.getContext("2d")!;
  render(ctx, p, 0, true);
  const stream = c.captureStream(p.fps),
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 12_000_000,
    });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        if (recorder.state !== "inactive") recorder.stop();
      };
      signal.addEventListener("abort", abort, { once: true });
      recorder.onstop = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      recorder.onerror = () => {
        signal.removeEventListener("abort", abort);
        reject(new Error("Ha fallado la grabación."));
      };
      recorder.start();
      const start = performance.now();
      const tick = () => {
        if (signal.aborted) return abort();
        const elapsed = performance.now() - start,
          index = Math.floor((elapsed * p.fps) / 1000);
        if (index >= p.duration) {
          recorder.stop();
          return;
        }
        render(ctx, p, index, true);
        onProgress(index / p.duration);
        timer = setTimeout(
          tick,
          Math.max(1, ((index + 1) * 1000) / p.fps - elapsed),
        );
      };
      tick();
    });
    if (!signal.aborted) {
      download(new Blob(chunks, { type: "video/webm" }), filename(p) + ".webm");
      onProgress(1);
    }
  } finally {
    clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
  }
}
