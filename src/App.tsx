import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as RPointer,
} from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  Diamond,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  Folder,
  FolderOpen,
  Grid2X2,
  ImagePlus,
  Layers,
  Link2,
  LockKeyhole,
  Maximize,
  Minus,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Settings2,
  Shapes,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  UnlockKeyhole,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  blankProject,
  clamp,
  clone,
  createLayer,
  demoProject,
  descendants,
  duplicateLayer,
  editPose,
  evaluate,
  parseProject,
  preset,
  removeLayer,
  safeAsset,
  setKey,
  type Ease,
  type Kind,
  type Layer,
  type Pose,
  type Project,
} from "./model";
import {
  hitTest,
  identity,
  inverse,
  parentMatrix,
  transform,
  visible,
  world,
} from "./geometry";
import { loadImage, onImages, render } from "./render";
import { restore, save } from "./storage";
import { exportPNG, exportProject, exportVideo } from "./export";
import {
  hostStorage,
  importIsdkai,
  spriteLayer,
  type ImportedSprite,
} from "./integrations";

const labels: Record<Kind, string> = {
  text: "Texto",
  rectangle: "Rectángulo",
  ellipse: "Elipse",
  image: "Imagen",
  container: "Contenedor",
  sprite: "Sprite de Isdkai",
};
const easingLabels: Record<Ease, string> = {
  linear: "Lineal",
  "ease-in": "Acelerar",
  "ease-out": "Desacelerar",
  "ease-in-out": "Suavizar",
  step: "Por pasos",
};
const icons: Record<Kind, typeof Type> = {
  text: Type,
  rectangle: Square,
  ellipse: Circle,
  image: ImagePlus,
  container: Folder,
  sprite: Sparkles,
};
function IconButton({
  title,
  children,
  onClick,
  disabled = false,
  active = false,
}: {
  title: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""}`}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function NumberField({
  label,
  value,
  onChange,
  min = -100000,
  max = 100000,
  step = 1,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        value={Math.round(value * 100) / 100}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          if (e.currentTarget.value === "") return;
          const v = Number(e.currentTarget.value);
          if (Number.isFinite(v)) onChange(clamp(v, min, max));
        }}
      />
    </label>
  );
}
interface Drag {
  type: "move" | "resize";
  id: string;
  baseline: Project;
  value: Pose;
  start: { x: number; y: number };
  matrix: ReturnType<typeof inverse>;
  changed: boolean;
}
export default function App() {
  const [project, setProjectState] = useState<Project>(demoProject),
    pRef = useRef(project);
  const [ready, setReady] = useState(false),
    [saved, setSaved] = useState("Cargando…"),
    [selected, setSelected] = useState<string | null>(null);
  const [frame, setFrame] = useState(45),
    [playing, setPlaying] = useState(false),
    [loop, setLoop] = useState(true),
    [zoom, setZoom] = useState(100),
    [grid, setGrid] = useState(false),
    [snap, setSnap] = useState(true);
  const [tab, setTab] = useState<"layers" | "library">("layers"),
    [modal, setModal] = useState<"export" | "connect" | "help" | "new" | null>(
      null,
    ),
    [notice, setNotice] = useState("");
  const [library, setLibrary] = useState<ImportedSprite[]>([]),
    [baseURL, setBaseURL] = useState("https://isdkai.pages.dev/"),
    [hostConnected, setHostConnected] = useState(false);
  const [context, setContext] = useState<{
      x: number;
      y: number;
      id: string;
    } | null>(null),
    [progress, setProgress] = useState<number | null>(null);
  const undoStack = useRef<Project[]>([]),
    redoStack = useRef<Project[]>([]),
    [, setHistoryVersion] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null),
    stageSpace = useRef<HTMLDivElement>(null),
    drag = useRef<Drag | null>(null),
    exportAbort = useRef<AbortController | null>(null);
  const [stageFit, setStageFit] = useState(640);
  const fileRef = useRef<HTMLInputElement>(null),
    imageRef = useRef<HTMLInputElement>(null),
    spriteRef = useRef<HTMLInputElement>(null),
    spriteImageRef = useRef<HTMLInputElement>(null),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const layer = project.layers.find((l) => l.id === selected),
    value = layer ? evaluate(layer, frame) : null,
    key = layer?.keyframes.find((k) => k.frame === frame);
  const exporting = progress !== null;
  function message(s: string) {
    setNotice(s);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 6000);
  }
  function setProject(p: Project) {
    pRef.current = p;
    setProjectState(p);
  }
  function remember(p: Project) {
    undoStack.current = [...undoStack.current.slice(-49), p];
    redoStack.current = [];
    setHistoryVersion((v) => v + 1);
  }
  function commit(p: Project) {
    if (p === pRef.current) return;
    remember(pRef.current);
    setProject(p);
  }
  function changeLayer(id: string, fn: (l: Layer) => Layer) {
    const p = pRef.current;
    commit({ ...p, layers: p.layers.map((l) => (l.id === id ? fn(l) : l)) });
  }
  function change(patch: Partial<Layer>) {
    if (layer && !layer.locked && !exporting)
      changeLayer(layer.id, (l) => ({ ...l, ...patch }));
  }
  function changePose(patch: Partial<Pose>) {
    if (layer && !layer.locked && !exporting)
      changeLayer(layer.id, (l) => editPose(l, frame, patch));
  }
  function undo() {
    const p = undoStack.current.pop();
    if (!p) return;
    redoStack.current.push(pRef.current);
    setProject(p);
    setHistoryVersion((v) => v + 1);
    setPlaying(false);
  }
  function redo() {
    const p = redoStack.current.pop();
    if (!p) return;
    undoStack.current.push(pRef.current);
    setProject(p);
    setHistoryVersion((v) => v + 1);
  }
  function select(id: string | null) {
    setSelected(id);
    setContext(null);
  }
  function add(kind: Kind, src = "") {
    const p = pRef.current;
    if (p.layers.length >= 200)
      return message("El proyecto admite hasta 200 elementos.");
    let l = createLayer(kind, p.duration);
    l.src = src;
    if (layer?.kind === "container") {
      l.parentId = layer.id;
      l.x = 40;
      l.y = 40;
      l.width = Math.min(l.width, layer.width - 40);
      l.height = Math.min(l.height, layer.height - 40);
    }
    if (kind === "image") {
      const r = loadImage(src);
      if (r.image.naturalWidth) {
        l.width = 480;
        l.height = (480 * r.image.naturalHeight) / r.image.naturalWidth;
      }
    }
    commit({ ...p, layers: [...p.layers, l] });
    select(l.id);
    setTab("layers");
  }
  function duplicate() {
    if (!layer || exporting) return;
    const r = duplicateLayer(pRef.current, layer.id);
    if (r.project.layers.length > 200)
      return message("No hay espacio para duplicar estas capas.");
    commit(r.project);
    select(r.id);
  }
  function remove() {
    if (!layer || layer.locked || exporting) return;
    commit(removeLayer(pRef.current, layer.id));
    select(null);
  }
  function addKey() {
    if (!layer || layer.locked || exporting) return;
    changeLayer(layer.id, (l) => setKey(l, frame));
    message(
      "Fotograma clave marcado. Cambia el tiempo y modifica una propiedad para animar.",
    );
  }
  function deleteKey() {
    if (!layer || !key || layer.locked || exporting) return;
    changeLayer(layer.id, (l) => ({
      ...l,
      keyframes: l.keyframes.filter((k) => k.frame !== frame),
    }));
  }
  function animate(
    kind: "fade" | "rise" | "slide" | "pop" | "out",
    id = selected,
  ) {
    const l = pRef.current.layers.find((l) => l.id === id);
    if (!l || l.locked) return;
    try {
      changeLayer(l.id, (l) =>
        preset(l, kind, frame, project.duration, project.fps),
      );
      setContext(null);
      message("Animación creada. Pulsa reproducir para verla.");
    } catch (e) {
      message((e as Error).message);
    }
  }
  function reorder(direction: number) {
    if (!layer) return;
    const p = pRef.current,
      siblings = p.layers.filter((l) => l.parentId === layer.parentId),
      index = siblings.findIndex((l) => l.id === layer.id),
      other = siblings[index + direction];
    if (!other) return;
    const layers = [...p.layers],
      a = layers.indexOf(layer),
      b = layers.indexOf(other);
    [layers[a], layers[b]] = [layers[b], layers[a]];
    commit({ ...p, layers });
  }
  function seek(n: number) {
    setPlaying(false);
    setFrame(clamp(Math.round(n), 0, project.duration - 1));
  }
  useEffect(() => {
    let live = true;
    restore()
      .then((p) => {
        if (live) {
          setProject(p);
          setSelected(
            (
              p.layers.find((l) => l.name === "Título principal") ??
              p.layers.find((l) => l.kind === "text")
            )?.id ?? null,
          );
          setFrame(Math.min(45, p.duration - 1));
        }
      })
      .catch(() =>
        message(
          "No se ha podido recuperar el guardado local. Puedes abrir tu archivo de proyecto.",
        ),
      )
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    setSaved("Guardando…");
    const t = setTimeout(() => {
      save(project)
        .then(() => setSaved("Guardado en este dispositivo"))
        .catch(() => {
          setSaved("Sin guardar");
          message(
            "No hay espacio para guardar. Descarga el proyecto para conservarlo.",
          );
        });
    }, 450);
    return () => clearTimeout(t);
  }, [project, ready]);
  useLayoutEffect(() => {
    const element = stageSpace.current;
    if (!element) return;
    const fit = () => {
      const style = getComputedStyle(element);
      const width =
        element.clientWidth -
        (parseFloat(style.paddingLeft) || 0) -
        (parseFloat(style.paddingRight) || 0);
      const height =
        element.clientHeight -
        (parseFloat(style.paddingTop) || 0) -
        (parseFloat(style.paddingBottom) || 0);
      setStageFit(
        Math.max(1, Math.min(width, (height * project.width) / project.height)),
      );
    };
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    fit();
    return () => observer.disconnect();
  }, [project.width, project.height]);
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) render(canvas.getContext("2d")!, project, frame);
    };
    draw();
    return onImages(draw);
  }, [project, frame]);
  useEffect(() => {
    if (!playing) return;
    let animation: number;
    const begin = performance.now(),
      start = frame;
    function tick(now: number) {
      const f = start + Math.floor(((now - begin) * project.fps) / 1000);
      if (f >= project.duration && !loop) {
        setFrame(project.duration - 1);
        setPlaying(false);
        return;
      }
      setFrame(f % project.duration);
      animation = requestAnimationFrame(tick);
    }
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [playing, loop, project.duration, project.fps]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.matches("input,textarea,select") ||
          e.target.isContentEditable)
      )
        return;
      if (e.key === "Escape") {
        setContext(null);
        setModal(null);
        return;
      }
      if (exporting) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        exportProject(pRef.current);
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
      }
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((v) => !v);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove();
      }
      if (e.key.toLowerCase() === "k" && !mod) {
        e.preventDefault();
        e.shiftKey ? deleteKey() : addKey();
      }
      if (e.key === "ArrowLeft" && (!layer || mod)) {
        e.preventDefault();
        seek(frame - 1);
      } else if (e.key === "ArrowRight" && (!layer || mod)) {
        e.preventDefault();
        seek(frame + 1);
      } else if (
        layer &&
        !layer.locked &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        const v = evaluate(layer, frame),
          d = e.shiftKey ? 10 : 1;
        changePose({
          x:
            v.x + (e.key === "ArrowRight" ? d : e.key === "ArrowLeft" ? -d : 0),
          y: v.y + (e.key === "ArrowDown" ? d : e.key === "ArrowUp" ? -d : 0),
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [layer, frame, project, exporting]);
  useEffect(
    () => () => {
      exportAbort.current?.abort();
      clearTimeout(noticeTimer.current);
    },
    [],
  );
  useEffect(() => {
    const api = {
      call: async (method: string, params: unknown = {}) => {
        if (method === "api.describe")
          return {
            protocol: "yunima.api.v1",
            methods: ["project.get", "project.replace", "sprites.import"],
            projectFormat: "yunima.project.v1",
            importFormats: ["wisdkai.project.v1", "isdkai sprite descriptor"],
          };
        if (method === "project.get") return clone(pRef.current);
        if (exportAbort.current)
          throw new Error("Hay una exportación en curso.");
        if (method === "project.replace") {
          const p = parseProject(params);
          commit(p);
          seek(0);
          select(null);
          return { ok: true };
        }
        if (method === "sprites.import") {
          const items = importIsdkai(params);
          setLibrary(items);
          setTab("library");
          return { imported: items.length };
        }
        throw new Error("Comando desconocido.");
      },
    };
    (window as unknown as { yunimaAPI: typeof api }).yunimaAPI = api;
  }, []);
  async function importFile(file: File) {
    try {
      if (file.size > 30 * 1024 * 1024)
        throw new Error("El archivo supera 30 MB.");
      const data = JSON.parse(await file.text());
      if (data.format === "yunima.project.v1") {
        const p = parseProject(data);
        commit(p);
        setFrame(0);
        setPlaying(false);
        select(null);
        message("Proyecto abierto. Puedes deshacer para volver al anterior.");
      } else {
        const items = importIsdkai(data, baseURL);
        setLibrary(items);
        setTab("library");
        setModal(null);
        message(
          `${items.length} sprites importados. Elige uno para añadirlo al lienzo.`,
        );
      }
    } catch (e) {
      message((e as Error).message);
    }
  }
  async function importImage(file: File, replaceSprite = false) {
    try {
      if (
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          file.type,
        )
      )
        throw new Error("Usa una imagen PNG, JPEG, WebP o GIF.");
      if (file.size > 8 * 1024 * 1024)
        throw new Error("La imagen supera 8 MB.");
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      if (replaceSprite && layer?.sprite) {
        change({ sprite: { ...layer.sprite, image: safeAsset(data) } });
        message(
          "Spritesheet sustituida. Los recortes y animaciones se conservan.",
        );
        return;
      }
      add("image", safeAsset(data));
      message(
        "Imagen añadida. Los GIF se exportan como imagen estática; para animar usa un sprite.",
      );
    } catch (e) {
      message((e as Error).message);
    }
  }
  function addSprite(item: ImportedSprite) {
    const p = pRef.current;
    if (p.layers.length >= 200)
      return message("El proyecto admite hasta 200 elementos.");
    const l = spriteLayer(item, p.duration);
    commit({ ...p, layers: [...p.layers, l] });
    select(l.id);
    setTab("layers");
  }
  function point(e: RPointer<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * project.width) / r.width,
      y: ((e.clientY - r.top) * project.height) / r.height,
    };
  }
  function pointerDown(e: RPointer<HTMLCanvasElement>) {
    if (e.button !== 0 || exporting) return;
    const pt = point(e),
      l = hitTest(project, frame, pt.x, pt.y);
    select(l?.id ?? null);
    setPlaying(false);
    if (!l || l.locked) return;
    let parent = l.parentId;
    while (parent) {
      const ancestor = project.layers.find((n) => n.id === parent);
      if (ancestor?.locked) return;
      parent = ancestor?.parentId ?? null;
    }
    const v = evaluate(l, frame),
      inv = inverse(parentMatrix(project, l, frame));
    const corner = transform(world(project, l, frame), v.width, v.height),
      r = e.currentTarget.getBoundingClientRect();
    const resize =
      Math.hypot(
        ((pt.x - corner.x) * r.width) / project.width,
        ((pt.y - corner.y) * r.height) / project.height,
      ) < 14;
    drag.current = {
      type: resize ? "resize" : "move",
      id: l.id,
      baseline: project,
      value: v,
      start: transform(inv, pt.x, pt.y),
      matrix: inv,
      changed: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: RPointer<HTMLCanvasElement>) {
    const d = drag.current;
    if (!d) return;
    const pt = point(e),
      local = transform(d.matrix, pt.x, pt.y),
      dx = local.x - d.start.x,
      dy = local.y - d.start.y;
    if (Math.abs(dx) + Math.abs(dy) < 2 && !d.changed) return;
    d.changed = true;
    let patch: Partial<Pose>;
    const step = snap && !e.altKey ? 10 : 1,
      round = (n: number) => Math.round(n / step) * step;
    if (d.type === "move")
      patch = { x: round(d.value.x + dx), y: round(d.value.y + dy) };
    else {
      const rad = (d.value.rotation * Math.PI) / 180,
        c = Math.cos(rad),
        s = Math.sin(rad);
      patch = {
        width: clamp(
          round(d.value.width + (c * dx + s * dy) / d.value.scale),
          1,
          16384,
        ),
        height: clamp(
          round(d.value.height + (-s * dx + c * dy) / d.value.scale),
          1,
          16384,
        ),
      };
    }
    setProject({
      ...d.baseline,
      layers: d.baseline.layers.map((l) =>
        l.id === d.id ? editPose(l, frame, patch) : l,
      ),
    });
  }
  function pointerUp() {
    const d = drag.current;
    if (d?.changed) remember(d.baseline);
    drag.current = null;
  }
  function timelineSeek(e: RPointer<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * (project.duration - 1));
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveKey(e: RPointer<HTMLButtonElement>, at: number) {
    if (!layer || layer.locked || exporting) return;
    e.stopPropagation();
    seek(at);
    const baseline = project,
      id = layer.id,
      track = e.currentTarget.parentElement!,
      rect = track.getBoundingClientRect();
    let changed = false;
    const move = (event: PointerEvent) => {
      const next = clamp(
        Math.round(
          ((event.clientX - rect.left) / rect.width) * (project.duration - 1),
        ),
        0,
        project.duration - 1,
      );
      if (next === at) return;
      changed = true;
      const original = baseline.layers.find((l) => l.id === id)!;
      const moved = original.keyframes.find((k) => k.frame === at)!;
      setProject({
        ...baseline,
        layers: baseline.layers.map((l) =>
          l.id === id
            ? {
                ...l,
                keyframes: [
                  ...original.keyframes.filter(
                    (k) => k.frame !== at && k.frame !== next,
                  ),
                  { ...moved, frame: next },
                ].sort((a, b) => a.frame - b.frame),
              }
            : l,
        ),
      });
      setFrame(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (changed) remember(baseline);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }
  async function video() {
    const controller = new AbortController();
    exportAbort.current = controller;
    setPlaying(false);
    setProgress(0);
    try {
      await exportVideo(clone(project), setProgress, controller.signal);
      if (!controller.signal.aborted) message("Animación WebM descargada.");
    } catch (e) {
      message((e as Error).message);
    } finally {
      setProgress(null);
      exportAbort.current = null;
    }
  }
  const hostOrigin = (() => {
    try {
      const u = new URL(document.referrer);
      return ["masific.com", "www.masific.com"].includes(u.hostname)
        ? u.origin
        : null;
    } catch {
      return null;
    }
  })();
  async function checkHost() {
    try {
      if (!hostOrigin || window.parent === window)
        throw new Error(
          "El puente solo está disponible al instalar Yunima como aplicación en SubaSites.",
        );
      await hostStorage(hostOrigin)("get", "yunima-project");
      setHostConnected(true);
      message("Puente de almacenamiento de SubaSites verificado.");
    } catch (e) {
      setHostConnected(false);
      message(
        (e as Error).message +
          " Las ventanas de sitios externos no reciben este puente.",
      );
    }
  }
  async function hostSync(read = false) {
    try {
      if (!hostOrigin || window.parent === window)
        throw new Error(
          "Abre Yunima dentro de Masific para usar el almacenamiento de SubaSites.",
        );
      const request = hostStorage(hostOrigin);
      if (read) {
        const data = await request("get", "yunima-project");
        if (!data) throw new Error("No hay un proyecto guardado en este host.");
        commit(parseProject(data));
        seek(0);
        select(null);
        message("Proyecto recuperado de SubaSites.");
      } else {
        if (JSON.stringify(project).length > 65536)
          throw new Error(
            "El proyecto supera la cuota de 64 KiB de SubaSites. Descárgalo como archivo.",
          );
        await request("set", "yunima-project", project);
        message("Guardado en SubaSites, en este navegador.");
      }
    } catch (e) {
      message((e as Error).message);
    }
  }
  function resizeDuration(seconds: number) {
    const p = pRef.current,
      duration = Math.max(2, Math.round(seconds * p.fps));
    commit({
      ...p,
      duration,
      layers: p.layers.map((l) => ({
        ...l,
        start: Math.min(l.start, duration - 2),
        end: Math.min(l.end, duration),
        keyframes: l.keyframes.filter((k) => k.frame < duration),
      })),
    });
    seek(Math.min(frame, duration - 1));
  }
  function layerRows(parentId: string | null, depth = 0): ReactNode {
    return project.layers
      .filter((l) => l.parentId === parentId)
      .slice()
      .reverse()
      .map((l) => {
        const Icon = icons[l.kind];
        return (
          <div key={l.id}>
            <div
              className={`layer-row ${selected === l.id ? "selected" : ""} ${l.hidden ? "muted" : ""}`}
              style={{ paddingLeft: 12 + depth * 14 }}
              onClick={() => select(l.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                select(l.id);
                setContext({ x: e.clientX, y: e.clientY, id: l.id });
              }}
            >
              <button className="layer-select" onClick={() => select(l.id)}>
                <Icon size={15} />
                <span>{l.name}</span>
                {l.keyframes.length > 0 && (
                  <Diamond className="tiny-key" size={9} />
                )}
              </button>
              <button
                className="row-action"
                title={l.hidden ? "Mostrar capa" : "Ocultar capa"}
                aria-label={`${l.hidden ? "Mostrar" : "Ocultar"} ${l.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  changeLayer(l.id, (l) => ({ ...l, hidden: !l.hidden }));
                }}
              >
                {l.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button
                className="row-action"
                title={l.locked ? "Desbloquear capa" : "Bloquear capa"}
                aria-label={`${l.locked ? "Desbloquear" : "Bloquear"} ${l.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  changeLayer(l.id, (l) => ({ ...l, locked: !l.locked }));
                }}
              >
                {l.locked ? (
                  <LockKeyhole size={12} />
                ) : (
                  <UnlockKeyhole size={12} />
                )}
              </button>
            </div>
            {layerRows(l.id, depth + 1)}
          </div>
        );
      });
  }
  const selectionMatrix = layer ? world(project, layer, frame) : identity;
  const ticks = Array.from(
    { length: Math.min(13, Math.ceil(project.duration / project.fps) + 1) },
    (_, i) =>
      (i * (project.duration - 1)) /
      Math.min(12, Math.ceil(project.duration / project.fps)),
  );
  const timecode = (f: number) =>
    `${String(Math.floor(f / project.fps)).padStart(2, "0")}:${String(f % project.fps).padStart(2, "0")}`;
  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (exporting) return;
        const file = e.dataTransfer.files[0];
        if (file)
          file.type.startsWith("image/") ? importImage(file) : importFile(file);
      }}
    >
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => e.preventDefault()}
          aria-label="Yunima"
        >
          <svg viewBox="0 0 32 32">
            <path d="M6 6 16 18 26 6M16 18v9" />
          </svg>
          <span>
            yunima<span className="brand-dot">.</span>
          </span>
          <span className="beta">BETA</span>
        </a>
        <div className="project-title">
          <input
            aria-label="Nombre del proyecto"
            value={project.name}
            maxLength={200}
            disabled={exporting}
            onChange={(e) => commit({ ...project, name: e.target.value })}
          />
          <span>
            <i className={saved === "Sin guardar" ? "unsaved" : ""} />
            {saved}
          </span>
        </div>
        <div className="header-actions">
          <button
            className="text-button file-action"
            onClick={() => setModal("new")}
            disabled={exporting}
          >
            <FilePlus2 size={15} />
            Nuevo
          </button>
          <button
            className="text-button file-action"
            onClick={() => fileRef.current?.click()}
            disabled={exporting}
          >
            <FolderOpen size={15} />
            Abrir
          </button>
          <IconButton
            title="Descargar proyecto (⌘/Ctrl S)"
            onClick={() => exportProject(project)}
          >
            <Save size={17} />
          </IconButton>
          <span className="divider" />
          <button
            className="text-button connect-button"
            onClick={() => setModal("connect")}
          >
            <Link2 size={15} />
            Conectar
          </button>
          <button className="primary-button" onClick={() => setModal("export")}>
            <Download size={15} />
            Exportar
            <ChevronDown size={13} />
          </button>
        </div>
      </header>
      <main className="workspace">
        <aside className="left-panel">
          <div className="panel-tabs">
            <button
              className={tab === "layers" ? "active" : ""}
              onClick={() => setTab("layers")}
            >
              <Layers size={14} />
              Capas
            </button>
            <button
              className={tab === "library" ? "active" : ""}
              onClick={() => setTab("library")}
            >
              <Shapes size={14} />
              Recursos
            </button>
          </div>
          {tab === "layers" ? (
            <>
              <div className="panel-heading">
                <span>ESCENA 01</span>
                <IconButton
                  title="Añadir contenedor"
                  onClick={() => add("container")}
                  disabled={exporting}
                >
                  <Plus size={15} />
                </IconButton>
              </div>
              <div className="scene-row" onClick={() => select(null)}>
                <Maximize size={15} />
                <span>Lienzo principal</span>
                <small>{project.layers.length}</small>
              </div>
              <div className="layer-list">
                {layerRows(null)}
                {!project.layers.length && (
                  <div className="empty-state">
                    <Layers size={25} />
                    <p>Todo empieza con una capa.</p>
                    <button
                      className="small-button"
                      onClick={() => add("text")}
                    >
                      Añadir texto
                    </button>
                  </div>
                )}
              </div>
              <div className="layer-footer">
                <span>Orden de apilamiento</span>
                <IconButton
                  title="Subir capa"
                  onClick={() => reorder(1)}
                  disabled={!layer || exporting}
                >
                  <ArrowUp size={14} />
                </IconButton>
                <IconButton
                  title="Bajar capa"
                  onClick={() => reorder(-1)}
                  disabled={!layer || exporting}
                >
                  <ArrowDown size={14} />
                </IconButton>
              </div>
            </>
          ) : (
            <div className="resource-panel">
              <div className="mobile-project-actions">
                <button
                  className="outline-button"
                  onClick={() => setModal("new")}
                  disabled={exporting}
                >
                  <FilePlus2 size={14} />
                  Nuevo
                </button>
                <button
                  className="outline-button"
                  onClick={() => fileRef.current?.click()}
                  disabled={exporting}
                >
                  <FolderOpen size={14} />
                  Abrir
                </button>
                <button
                  className="outline-button"
                  onClick={() => setModal("connect")}
                >
                  <Link2 size={14} />
                  Conectar
                </button>
              </div>
              <div className="section-label">AÑADIR AL LIENZO</div>
              <div className="resource-grid">
                {(["text", "rectangle", "ellipse", "container"] as Kind[]).map(
                  (k) => {
                    const Icon = icons[k];
                    return (
                      <button
                        key={k}
                        onClick={() => add(k)}
                        disabled={exporting}
                      >
                        <Icon size={23} />
                        <span>{labels[k]}</span>
                      </button>
                    );
                  },
                )}
              </div>
              <button
                className="import-card"
                onClick={() => imageRef.current?.click()}
                disabled={exporting}
              >
                <ImagePlus size={20} />
                <span>
                  Importar imagen<small>PNG, JPG, WebP o GIF estático</small>
                </span>
                <Plus size={15} />
              </button>
              <div className="section-label spaced">BIBLIOTECA DE ISDKAI</div>
              {library.map((item) => (
                <button
                  key={item.id}
                  className="sprite-card"
                  disabled={exporting}
                  onClick={() => addSprite(item)}
                >
                  <Sparkles size={18} />
                  <span>
                    {item.name}
                    <small>
                      {item.sprite.frames.length} fotogramas ·{" "}
                      {item.sprite.frameRate} fps
                    </small>
                  </span>
                  <Plus size={15} />
                </button>
              ))}
              <button
                className="outline-button full"
                onClick={() => spriteRef.current?.click()}
                disabled={exporting}
              >
                <Upload size={15} />
                Importar sprites
              </button>
              <p className="hint">
                Abre un proyecto .wisdkai o un descriptor JSON. Sus animaciones
                vienen contigo.
              </p>
              <label className="field">
                Origen de los recursos
                <input
                  value={baseURL}
                  onChange={(e) => setBaseURL(e.target.value)}
                  aria-label="Origen de los recursos de Isdkai"
                />
              </label>
              <p className="hint">
                Se usa para resolver las rutas de imagen relativas del archivo.
              </p>
            </div>
          )}
          <button className="help-card" onClick={() => setModal("help")}>
            <div className="help-icon">
              <Sparkles size={17} />
            </div>
            <span>
              De una idea a una animación
              <small>
                Conoce tu nuevo espacio creativo <ArrowRight size={10} />
              </small>
            </span>
          </button>
          <div className="left-bottom">
            <span>
              UN PRODUCTO DE <b>masific.</b>
            </span>
            <span>v0.1</span>
          </div>
        </aside>
        <section className="editor">
          <div className="canvas-topbar">
            <div className="breadcrumb">
              <span>Proyecto</span>
              <ChevronRight size={12} />
              <strong>Escena 01</strong>
            </div>
            <div className="canvas-meta">
              <span>
                {project.width} × {project.height}
              </span>
              <span className="mini-pill">
                {project.width === project.height
                  ? "1:1"
                  : project.width > project.height
                    ? "16:9"
                    : "9:16"}
              </span>
              <IconButton
                title="Ajustes del lienzo"
                onClick={() => select(null)}
              >
                <Settings2 size={15} />
              </IconButton>
            </div>
          </div>
          <div className="canvas-area">
            <div className="stage-scroll" ref={stageSpace}>
              <div
                className={`stage ${grid ? "with-grid" : ""} ${project.transparent ? "transparent" : ""}`}
                style={{
                  width: (stageFit * zoom) / 100,
                  aspectRatio: `${project.width}/${project.height}`,
                  maxWidth: "none",
                  maxHeight: "none",
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={project.width}
                  height={project.height}
                  aria-label="Lienzo de animación"
                  tabIndex={0}
                  onPointerDown={pointerDown}
                  onPointerMove={pointerMove}
                  onPointerUp={pointerUp}
                  onPointerCancel={() => {
                    if (drag.current) setProject(drag.current.baseline);
                    drag.current = null;
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect(),
                      l = hitTest(
                        project,
                        frame,
                        ((e.clientX - r.left) * project.width) / r.width,
                        ((e.clientY - r.top) * project.height) / r.height,
                      );
                    if (l) {
                      select(l.id);
                      setContext({ x: e.clientX, y: e.clientY, id: l.id });
                    }
                  }}
                />
                {grid && <div className="grid-overlay" />}
                {layer && value && !playing && (
                  <svg
                    className="selection-overlay"
                    viewBox={`0 0 ${project.width} ${project.height}`}
                  >
                    <g transform={`matrix(${selectionMatrix.join(" ")})`}>
                      <rect
                        className={
                          !visible(project, layer, frame)
                            ? "invisible-selection"
                            : ""
                        }
                        width={value.width}
                        height={value.height}
                        stroke={layer.locked ? "#9b97a3" : "#9a78e6"}
                        fill="none"
                        vectorEffect="non-scaling-stroke"
                      />
                      {[
                        [0, 0],
                        [value.width, 0],
                        [0, value.height],
                        [value.width, value.height],
                      ].map(([x, y], i) => (
                        <rect
                          key={i}
                          x={x - 7}
                          y={y - 7}
                          width={14}
                          height={14}
                          fill="white"
                          stroke="#9a78e6"
                          strokeWidth={1.5}
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
                    </g>
                  </svg>
                )}
              </div>
            </div>
            <div className="canvas-bottom">
              <span>
                <i />{" "}
                {playing
                  ? "Reproduciendo"
                  : layer
                    ? labels[layer.kind] + " seleccionado"
                    : "Selecciona una capa para empezar"}
              </span>
              <div>
                <IconButton
                  title="Alejar lienzo"
                  onClick={() => setZoom((z) => clamp(z - 10, 30, 200))}
                >
                  <ZoomOut size={14} />
                </IconButton>
                <button
                  className="zoom-value"
                  title="Ajustar al espacio"
                  onClick={() => setZoom(100)}
                >
                  {zoom}%
                </button>
                <IconButton
                  title="Acercar lienzo"
                  onClick={() => setZoom((z) => clamp(z + 10, 30, 200))}
                >
                  <ZoomIn size={14} />
                </IconButton>
                <span className="divider" />
                <IconButton title="Ajustar lienzo" onClick={() => setZoom(100)}>
                  <Maximize size={13} />
                </IconButton>
              </div>
            </div>
          </div>
          <div className="tools-bar">
            <div className="tools-group">
              <IconButton title="Seleccionar y mover" onClick={() => {}} active>
                <MousePointer2 size={16} />
              </IconButton>
              <span className="divider" />
              <IconButton
                title="Añadir texto"
                onClick={() => add("text")}
                disabled={exporting}
              >
                <Type size={18} />
              </IconButton>
              <IconButton
                title="Añadir rectángulo"
                onClick={() => add("rectangle")}
                disabled={exporting}
              >
                <Square size={16} />
              </IconButton>
              <IconButton
                title="Añadir elipse"
                onClick={() => add("ellipse")}
                disabled={exporting}
              >
                <Circle size={16} />
              </IconButton>
              <IconButton
                title="Añadir imagen"
                onClick={() => imageRef.current?.click()}
                disabled={exporting}
              >
                <ImagePlus size={17} />
              </IconButton>
              <IconButton
                title="Añadir contenedor"
                onClick={() => add("container")}
                disabled={exporting}
              >
                <Folder size={17} />
              </IconButton>
              <span className="divider" />
              <IconButton
                title="Mostrar cuadrícula"
                active={grid}
                onClick={() => setGrid((v) => !v)}
              >
                <Grid2X2 size={15} />
              </IconButton>
            </div>
            <div className="tools-group key-tools">
              <button
                onClick={addKey}
                disabled={!layer || layer.locked || exporting}
                title="Marcar fotograma clave (K)"
              >
                <Diamond size={15} fill={key ? "currentColor" : "none"} />
                <span>Marcar clave</span>
              </button>
              <IconButton
                title="Eliminar fotograma clave (Mayús K)"
                onClick={deleteKey}
                disabled={!key || layer?.locked || exporting}
              >
                <Minus size={16} />
              </IconButton>
              <span className="divider" />
              <IconButton
                title="Deshacer (⌘/Ctrl Z)"
                onClick={undo}
                disabled={!undoStack.current.length || exporting}
              >
                <Undo2 size={16} />
              </IconButton>
              <IconButton
                title="Rehacer"
                onClick={redo}
                disabled={!redoStack.current.length || exporting}
              >
                <Redo2 size={16} />
              </IconButton>
            </div>
          </div>
          <section className="timeline" aria-label="Línea de tiempo">
            <div className="timeline-toolbar">
              <div>
                <strong>Línea de tiempo</strong>
                <span className="timeline-count">
                  {project.layers.length} capas
                </span>
              </div>
              <div className="transport">
                <IconButton
                  title="Ir al inicio"
                  onClick={() => seek(0)}
                  disabled={exporting}
                >
                  <SkipBack size={14} />
                </IconButton>
                <IconButton
                  title={playing ? "Pausar" : "Reproducir (espacio)"}
                  active={playing}
                  onClick={() => {
                    if (frame >= project.duration - 1) setFrame(0);
                    setPlaying((v) => !v);
                  }}
                  disabled={exporting}
                >
                  {playing ? (
                    <Pause size={15} />
                  ) : (
                    <Play size={15} fill="currentColor" />
                  )}
                </IconButton>
                <IconButton
                  title="Ir al final"
                  onClick={() => seek(project.duration - 1)}
                  disabled={exporting}
                >
                  <SkipForward size={14} />
                </IconButton>
                <span className="timecode">
                  {timecode(frame)} <span>/ {timecode(project.duration)}</span>
                </span>
                <IconButton
                  title="Repetir animación"
                  active={loop}
                  onClick={() => setLoop((v) => !v)}
                >
                  <RotateCcw size={14} />
                </IconButton>
              </div>
              <span className="fps">{project.fps} FPS</span>
            </div>
            <div className="timeline-scroll">
              <div className="timeline-ruler">
                <div className="track-name ruler-name">
                  CAPAS <span>FOTOGRAMAS</span>
                </div>
                <div
                  className="ruler"
                  onPointerDown={timelineSeek}
                  onPointerMove={(e) => {
                    if (e.buttons === 1) timelineSeek(e);
                  }}
                >
                  {ticks.map((t, i) => (
                    <span
                      key={i}
                      style={{ left: `${(t / (project.duration - 1)) * 100}%` }}
                    >
                      {(t / project.fps).toFixed(t % project.fps < 1 ? 0 : 1)}s
                    </span>
                  ))}
                  <div
                    className="ruler-playhead"
                    style={{
                      left: `${(frame / (project.duration - 1)) * 100}%`,
                    }}
                  >
                    <i />
                  </div>
                </div>
              </div>
              <div className="tracks">
                {project.layers
                  .slice()
                  .reverse()
                  .map((l) => {
                    const Icon = icons[l.kind];
                    return (
                      <div
                        className={`track-row ${l.id === selected ? "selected" : ""}`}
                        key={l.id}
                      >
                        <button
                          className="track-name"
                          onClick={() => select(l.id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            select(l.id);
                            setContext({
                              x: e.clientX,
                              y: e.clientY,
                              id: l.id,
                            });
                          }}
                        >
                          <Icon size={13} />
                          <span>{l.name}</span>
                          {l.locked && <LockKeyhole size={10} />}
                        </button>
                        <div
                          className="track"
                          onPointerDown={(e) => {
                            select(l.id);
                            timelineSeek(e);
                          }}
                          onPointerMove={(e) => {
                            if (e.buttons === 1) timelineSeek(e);
                          }}
                          style={{
                            backgroundSize: `${100 / (ticks.length - 1)}% 100%`,
                          }}
                        >
                          <div
                            className={`clip ${l.kind === "text" ? "text-clip" : l.kind === "sprite" ? "sprite-clip" : ""} ${l.hidden ? "hidden-clip" : ""}`}
                            style={{
                              left: `${(l.start / project.duration) * 100}%`,
                              width: `${((l.end - l.start) / project.duration) * 100}%`,
                            }}
                          >
                            <span>
                              {l.kind === "text"
                                ? l.text.replace(/\n/g, " ")
                                : l.name}
                            </span>
                          </div>
                          {selected === l.id &&
                            l.keyframes.map((k) => (
                              <button
                                key={k.frame}
                                className={`keyframe ${k.frame === frame ? "current" : ""}`}
                                style={{
                                  left: `${(k.frame / (project.duration - 1)) * 100}%`,
                                }}
                                aria-label={`Fotograma clave ${k.frame}`}
                                title={`Fotograma ${k.frame} · arrastra para mover`}
                                onPointerDown={(e) => moveKey(e, k.frame)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") seek(k.frame);
                                }}
                              >
                                <Diamond size={12} fill="currentColor" />
                              </button>
                            ))}
                          <div
                            className="playhead"
                            style={{
                              left: `${(frame / (project.duration - 1)) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                {!project.layers.length && (
                  <div className="timeline-empty">
                    Añade un elemento para empezar a animar.
                  </div>
                )}
              </div>
            </div>
            <div className="timeline-bottom">
              <span>
                <Diamond size={10} />{" "}
                {layer
                  ? `${layer.name} · ${layer.keyframes.length} fotogramas clave`
                  : "Los fotogramas clave aparecen al seleccionar un elemento"}
              </span>
              <span>
                Arrastra el cabezal para explorar <kbd>ESPACIO</kbd> Reproducir
              </span>
            </div>
          </section>
        </section>
        <aside className="right-panel">
          <div className="inspector-title">
            <Settings2 size={14} />
            <strong>{layer ? "Propiedades" : "Lienzo"}</strong>
            {layer && <span className="mini-pill">{labels[layer.kind]}</span>}
          </div>
          <div
            className={`inspector-body ${layer?.locked ? "locked-inspector" : ""}`}
          >
            {layer && value ? (
              <>
                <div className="selected-heading">
                  <div className="selected-icon">
                    {(() => {
                      const Icon = icons[layer.kind];
                      return <Icon size={19} />;
                    })()}
                  </div>
                  <label>
                    <input
                      aria-label="Nombre de la capa"
                      value={layer.name}
                      disabled={layer.locked || exporting}
                      maxLength={200}
                      onChange={(e) => change({ name: e.target.value })}
                    />
                    <span>
                      {layer.parentId
                        ? "Dentro de un contenedor"
                        : "Lienzo principal"}
                    </span>
                  </label>
                </div>
                {layer.locked && (
                  <p className="locked-message">
                    <LockKeyhole size={12} />
                    Capa bloqueada. Desbloquéala en Capas.
                  </p>
                )}
                <fieldset disabled={layer.locked || exporting}>
                  <div className="inspector-section">
                    <div className="section-title">
                      Transformación{" "}
                      {key && <Diamond size={10} fill="currentColor" />}
                    </div>
                    <div className="field-grid">
                      <NumberField
                        label="X"
                        value={value.x}
                        onChange={(x) => changePose({ x })}
                      />
                      <NumberField
                        label="Y"
                        value={value.y}
                        onChange={(y) => changePose({ y })}
                      />
                      <NumberField
                        label="Ancho"
                        value={value.width}
                        min={1}
                        max={16384}
                        onChange={(width) => changePose({ width })}
                      />
                      <NumberField
                        label="Alto"
                        value={value.height}
                        min={1}
                        max={16384}
                        onChange={(height) => changePose({ height })}
                      />
                      <NumberField
                        label="Rotación °"
                        value={value.rotation}
                        min={-36000}
                        max={36000}
                        onChange={(rotation) => changePose({ rotation })}
                      />
                      <NumberField
                        label="Escala %"
                        value={value.scale * 100}
                        min={1}
                        max={10000}
                        onChange={(scale) => changePose({ scale: scale / 100 })}
                      />
                    </div>
                    <label className="range-field">
                      <span>
                        Opacidad <b>{Math.round(value.opacity * 100)}%</b>
                      </span>
                      <input
                        type="range"
                        aria-label="Opacidad"
                        min={0}
                        max={100}
                        value={Math.round(value.opacity * 100)}
                        onChange={(e) =>
                          changePose({ opacity: Number(e.target.value) / 100 })
                        }
                      />
                    </label>
                  </div>
                  {layer.kind === "text" && (
                    <div className="inspector-section">
                      <div className="section-title">Texto</div>
                      <textarea
                        aria-label="Contenido del texto"
                        value={layer.text}
                        maxLength={10000}
                        onChange={(e) => change({ text: e.target.value })}
                        rows={3}
                      />
                      <div className="field-grid font-fields">
                        <select
                          aria-label="Tipografía"
                          value={layer.fontFamily}
                          onChange={(e) =>
                            change({ fontFamily: e.target.value })
                          }
                        >
                          {["Arial", "Georgia", "Verdana", "Courier New"].map(
                            (f) => (
                              <option key={f}>{f}</option>
                            ),
                          )}
                        </select>
                        <NumberField
                          label="Tamaño"
                          value={layer.fontSize}
                          min={6}
                          max={512}
                          onChange={(fontSize) => change({ fontSize })}
                        />
                      </div>
                      <div className="field-grid">
                        <select
                          aria-label="Grosor del texto"
                          value={layer.fontWeight}
                          onChange={(e) =>
                            change({ fontWeight: Number(e.target.value) })
                          }
                        >
                          <option value={400}>Regular</option>
                          <option value={500}>Medium</option>
                          <option value={700}>Negrita</option>
                          <option value={900}>Black</option>
                        </select>
                        <select
                          aria-label="Alineación del texto"
                          value={layer.align}
                          onChange={(e) =>
                            change({ align: e.target.value as Layer["align"] })
                          }
                        >
                          <option value="left">Izquierda</option>
                          <option value="center">Centro</option>
                          <option value="right">Derecha</option>
                        </select>
                      </div>
                    </div>
                  )}
                  {["text", "rectangle", "ellipse"].includes(layer.kind) && (
                    <div className="inspector-section">
                      <div className="section-title">Apariencia</div>
                      <label className="color-field">
                        <input
                          aria-label="Color del elemento"
                          type="color"
                          value={layer.color}
                          onChange={(e) => change({ color: e.target.value })}
                        />
                        <span>{layer.color.toUpperCase()}</span>
                        <span>100%</span>
                      </label>
                      {layer.kind === "rectangle" && (
                        <NumberField
                          label="Radio"
                          value={layer.radius}
                          min={0}
                          max={8192}
                          onChange={(radius) => change({ radius })}
                        />
                      )}
                    </div>
                  )}
                  {layer.kind === "image" && (
                    <div className="inspector-section">
                      <div className="section-title">Imagen</div>
                      <button
                        className="outline-button full"
                        onClick={() => imageRef.current?.click()}
                      >
                        <ImagePlus size={14} />
                        Añadir otra imagen
                      </button>
                      <p className="hint">
                        La imagen mantiene sus proporciones dentro de la caja.
                      </p>
                    </div>
                  )}
                  {layer.sprite && (
                    <div className="inspector-section">
                      <div className="section-title">Animación de Isdkai</div>
                      <button
                        className="outline-button full"
                        onClick={() => spriteImageRef.current?.click()}
                      >
                        <ImagePlus size={14} />
                        Elegir spritesheet local
                      </button>
                      <p className="hint">
                        Usa el PNG original si el enlace ya no existe o su
                        alojamiento bloquea CORS.
                      </p>
                      <label className="field">
                        Secuencia
                        <select
                          aria-label="Secuencia del sprite"
                          value={layer.sprite.activeSectionID}
                          onChange={(e) =>
                            change({
                              sprite: {
                                ...layer.sprite!,
                                activeSectionID: e.target.value,
                              },
                            })
                          }
                        >
                          {layer.sprite.sections.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <NumberField
                        label="Velocidad FPS"
                        value={layer.sprite.frameRate}
                        min={1}
                        max={60}
                        onChange={(frameRate) =>
                          change({
                            sprite: {
                              ...layer.sprite!,
                              frameRate: Math.round(frameRate),
                            },
                          })
                        }
                      />
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={layer.sprite.animationEnabled}
                          onChange={(e) =>
                            change({
                              sprite: {
                                ...layer.sprite!,
                                animationEnabled: e.target.checked,
                              },
                            })
                          }
                        />
                        Reproducir secuencia
                      </label>
                    </div>
                  )}
                  <div className="inspector-section">
                    <div className="section-title">Jerarquía</div>
                    <label className="field">
                      Contenedor
                      <select
                        aria-label="Contenedor padre"
                        value={layer.parentId ?? ""}
                        onChange={(e) =>
                          change({ parentId: e.target.value || null })
                        }
                      >
                        <option value="">Lienzo principal</option>
                        {project.layers
                          .filter(
                            (l) =>
                              l.kind === "container" &&
                              !descendants(project.layers, layer.id).has(l.id),
                          )
                          .map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <p className="hint">
                      Las posiciones son relativas al contenedor. Sus
                      transformaciones afectan a todas sus capas.
                    </p>
                  </div>
                  <div className="inspector-section">
                    <div className="section-title">Tiempo</div>
                    <div className="field-grid">
                      <NumberField
                        label="Inicio (f)"
                        value={layer.start}
                        min={0}
                        max={layer.end - 1}
                        onChange={(start) =>
                          change({ start: Math.round(start) })
                        }
                      />
                      <NumberField
                        label="Fin (f)"
                        value={layer.end}
                        min={layer.start + 1}
                        max={project.duration}
                        onChange={(end) => change({ end: Math.round(end) })}
                      />
                    </div>
                  </div>
                  <div className="inspector-section">
                    <div className="section-title">
                      Movimiento <Sparkles size={12} />
                    </div>
                    <div className="presets">
                      <button onClick={() => animate("fade")}>
                        <span>◌</span>Aparecer
                      </button>
                      <button onClick={() => animate("rise")}>
                        <ArrowUp size={17} />
                        Elevar
                      </button>
                      <button onClick={() => animate("slide")}>
                        <ArrowRight size={17} />
                        Deslizar
                      </button>
                      <button onClick={() => animate("pop")}>
                        <Maximize size={17} />
                        Escalar
                      </button>
                    </div>
                    {key && (
                      <label className="field spaced">
                        Hasta la siguiente clave
                        <select
                          aria-label="Interpolación"
                          value={key.easing}
                          onChange={(e) =>
                            change({
                              keyframes: layer.keyframes.map((k) =>
                                k.frame === frame
                                  ? { ...k, easing: e.target.value as Ease }
                                  : k,
                              ),
                            })
                          }
                        >
                          {Object.entries(easingLabels).map(([id, label]) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <p className="hint">
                      Clic derecho sobre un elemento para crear una animación.
                    </p>
                  </div>
                </fieldset>
              </>
            ) : (
              <>
                <div className="canvas-settings-icon">
                  <Maximize size={28} />
                  <h2>Tu escenario.</h2>
                  <p>
                    Un espacio para dar forma
                    <br />a lo que imaginas.
                  </p>
                </div>
                <div className="inspector-section">
                  <div className="section-title">Formato</div>
                  <select
                    aria-label="Formato del lienzo"
                    disabled={exporting}
                    value={`${project.width}x${project.height}`}
                    onChange={(e) => {
                      const [width, height] = e.target.value
                        .split("x")
                        .map(Number);
                      commit({ ...project, width, height });
                    }}
                  >
                    {[
                      [1920, 1080, "YouTube · 1920 × 1080"],
                      [1080, 1920, "Shorts · 1080 × 1920"],
                      [1080, 1080, "Cuadrado · 1080 × 1080"],
                    ].map(([w, h, label]) => (
                      <option key={w + "x" + h} value={`${w}x${h}`}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <div className="field-grid spaced">
                    <NumberField
                      label="Duración (s)"
                      value={project.duration / project.fps}
                      min={0.1}
                      max={300}
                      step={0.1}
                      onChange={resizeDuration}
                      disabled={exporting}
                    />
                    <label className="field">
                      Fotogramas/s
                      <select
                        aria-label="Fotogramas por segundo"
                        value={project.fps}
                        disabled={exporting}
                        onChange={(e) => {
                          const fps = Number(e.target.value),
                            ratio = fps / project.fps,
                            duration = Math.round(project.duration * ratio);
                          commit({
                            ...project,
                            fps,
                            duration,
                            layers: project.layers.map((l) => ({
                              ...l,
                              start: Math.round(l.start * ratio),
                              end: Math.min(
                                duration,
                                Math.max(
                                  Math.round(l.start * ratio) + 1,
                                  Math.round(l.end * ratio),
                                ),
                              ),
                              keyframes: [
                                ...new Map(
                                  l.keyframes.map((k) => {
                                    const f = Math.min(
                                      duration - 1,
                                      Math.round(k.frame * ratio),
                                    );
                                    return [f, { ...k, frame: f }];
                                  }),
                                ).values(),
                              ],
                            })),
                          });
                          setFrame((f) =>
                            Math.min(duration - 1, Math.round(f * ratio)),
                          );
                        }}
                      >
                        {[24, 25, 30, 60].map((f) => (
                          <option key={f} value={f}>
                            {f} fps
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div className="inspector-section">
                  <div className="section-title">Fondo</div>
                  <label className="color-field">
                    <input
                      type="color"
                      aria-label="Color del fondo"
                      value={project.background}
                      disabled={exporting}
                      onChange={(e) =>
                        commit({ ...project, background: e.target.value })
                      }
                    />
                    <span>{project.background.toUpperCase()}</span>
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={project.transparent}
                      disabled={exporting}
                      onChange={(e) =>
                        commit({ ...project, transparent: e.target.checked })
                      }
                    />
                    Fondo transparente
                  </label>
                  <p className="hint">
                    PNG conserva la transparencia. WebM usa el color de fondo.
                  </p>
                </div>
                <div className="inspector-section">
                  <div className="section-title">Edición</div>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={snap}
                      onChange={(e) => setSnap(e.target.checked)}
                    />
                    Ajustar a cuadrícula de 10 px
                  </label>
                  <p className="hint">
                    Mantén Alt al arrastrar para mover libremente.
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="inspector-footer">
            {layer ? (
              <>
                <button
                  className="text-button"
                  onClick={duplicate}
                  disabled={exporting}
                >
                  <Copy size={14} />
                  Duplicar
                </button>
                <IconButton
                  title="Eliminar capa"
                  onClick={remove}
                  disabled={layer.locked || exporting}
                >
                  <Trash2 size={15} />
                </IconButton>
              </>
            ) : (
              <button
                className="text-button"
                onClick={() => add("text")}
                disabled={exporting}
              >
                <Plus size={14} />
                Añadir primer elemento
              </button>
            )}
          </div>
        </aside>
      </main>
      <footer className="statusbar">
        <span>
          <i /> Todo ocurre en tu navegador
        </span>
        <span>Diseña. Anima. Cuenta tu historia.</span>
        <button onClick={() => setModal("help")}>
          Atajos y ayuda <kbd>?</kbd>
        </button>
      </footer>
      <input
        ref={fileRef}
        hidden
        type="file"
        accept=".yunima,.json,.wisdkai"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importFile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={spriteRef}
        hidden
        type="file"
        accept=".wisdkai,.json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importFile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={spriteImageRef}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importImage(f, true);
          e.target.value = "";
        }}
      />
      <input
        ref={imageRef}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importImage(f);
          e.target.value = "";
        }}
      />
      {notice && (
        <div className="toast" role="status">
          <Sparkles size={16} />
          <span>{notice}</span>
          <button aria-label="Cerrar aviso" onClick={() => setNotice("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {context && (
        <>
          <div
            className="context-dismiss"
            onPointerDown={() => setContext(null)}
          />
          <div
            className="context-menu"
            style={{
              left: Math.max(8, Math.min(context.x, window.innerWidth - 235)),
              top: Math.max(8, Math.min(context.y, window.innerHeight - 340)),
            }}
          >
            <div className="section-label">CREAR ANIMACIÓN</div>
            {(
              [
                ["fade", "Aparecer"],
                ["rise", "Elevar desde abajo"],
                ["slide", "Deslizar desde la izquierda"],
                ["pop", "Entrada con escala"],
                ["out", "Desvanecer"],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                disabled={layer?.locked || exporting}
                onClick={() => animate(kind, context.id)}
              >
                <Sparkles size={14} />
                {label}
              </button>
            ))}
            <hr />
            <button
              disabled={layer?.locked || exporting}
              onClick={() => {
                addKey();
                setContext(null);
              }}
            >
              <Diamond size={14} />
              Marcar fotograma clave<kbd>K</kbd>
            </button>
            <button
              onClick={() => {
                duplicate();
                setContext(null);
              }}
              disabled={exporting}
            >
              <Copy size={14} />
              Duplicar
            </button>
            <button
              onClick={() => {
                remove();
                setContext(null);
              }}
              disabled={layer?.locked || exporting}
            >
              <Trash2 size={14} />
              Eliminar
            </button>
          </div>
        </>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget && !exporting) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="modal-close icon-button"
              aria-label="Cerrar ventana"
              onClick={() => {
                if (!exporting) setModal(null);
              }}
              disabled={exporting}
            >
              <X size={19} />
            </button>
            {modal === "export" && (
              <>
                <div className="modal-symbol">
                  <Download size={25} />
                </div>
                <h2 id="modal-title">Lista para salir al mundo.</h2>
                <p>Elige cómo llevarte tu creación.</p>
                <div className="export-options">
                  <button disabled={exporting} onClick={video}>
                    <Play size={23} />
                    <span>
                      <strong>Animación WebM</strong>
                      <small>
                        {project.width} × {project.height} · {project.fps} fps ·{" "}
                        {(project.duration / project.fps).toFixed(1)} s
                      </small>
                    </span>
                    <ArrowRight size={17} />
                  </button>
                  <p className="hint">
                    Exportación en tiempo real. Mantén esta pestaña visible.
                    Fondo sólido, sin audio. El contenedor es WebM; puedes
                    convertirlo si tu editor necesita MP4.
                  </p>
                  <button
                    disabled={exporting}
                    onClick={async () => {
                      try {
                        await exportPNG(project, frame);
                        message("Fotograma PNG descargado.");
                      } catch (e) {
                        message((e as Error).message);
                      }
                    }}
                  >
                    <ImagePlus size={22} />
                    <span>
                      <strong>Fotograma PNG</strong>
                      <small>
                        Fotograma {frame}
                        {project.transparent ? " · fondo transparente" : ""}
                      </small>
                    </span>
                    <ArrowRight size={17} />
                  </button>
                  <button
                    disabled={exporting}
                    onClick={() => exportProject(project)}
                  >
                    <FolderOpen size={22} />
                    <span>
                      <strong>Proyecto editable</strong>
                      <small>
                        Archivo .yunima · conserva capas y animaciones
                      </small>
                    </span>
                    <ArrowRight size={17} />
                  </button>
                </div>
                {exporting && (
                  <div className="export-progress">
                    <div>
                      <span>
                        Creando animación… {Math.round(progress! * 100)}%
                      </span>
                      <button onClick={() => exportAbort.current?.abort()}>
                        Cancelar
                      </button>
                    </div>
                    <progress value={progress!} max={1} />
                  </div>
                )}
              </>
            )}
            {modal === "connect" && (
              <>
                <div className="modal-symbol">
                  <Link2 size={25} />
                </div>
                <h2 id="modal-title">Las ideas se conectan.</h2>
                <p>Trae tus recursos de Isdkai a una nueva historia.</p>
                <div className="connection-card">
                  <span className="connection-logo">i</span>
                  <div>
                    <strong>iSDKai → Yunima</strong>
                    <p>
                      Sprites, secuencias, recortes, máscaras y velocidad de
                      reproducción.
                    </p>
                  </div>
                  <span className="supported">
                    <Check size={12} />
                    Disponible
                  </span>
                </div>
                <button
                  className="primary-button full"
                  onClick={() => spriteRef.current?.click()}
                  disabled={exporting}
                >
                  <Upload size={16} />
                  Abrir proyecto .wisdkai o sprite JSON
                </button>
                <label className="field spaced">
                  Origen de imágenes con ruta relativa
                  <input
                    value={baseURL}
                    onChange={(e) => setBaseURL(e.target.value)}
                  />
                </label>
                <div className="connection-notes">
                  <h3>SubaSites y Masific</h3>
                  <p>
                    El adaptador del SDK está preparado para el puente de
                    almacenamiento de SubaSites. Requiere instalar la aplicación
                    y verificar el host; las ventanas de sitios externos no
                    reciben este puente.
                  </p>
                  <button
                    className="outline-button spaced"
                    onClick={checkHost}
                    disabled={!hostOrigin}
                  >
                    Comprobar puente de SubaSites
                  </button>
                  <div className="host-actions">
                    <button
                      className="outline-button"
                      onClick={() => hostSync()}
                      disabled={exporting || !hostConnected}
                    >
                      Guardar en el host
                    </button>
                    <button
                      className="outline-button"
                      onClick={() => hostSync(true)}
                      disabled={exporting || !hostConnected}
                    >
                      Abrir desde el host
                    </button>
                  </div>
                  <p className="hint">
                    {hostOrigin
                      ? "Host detectado: " + hostOrigin
                      : "Adaptador sin conectar. El guardado actual es local de Yunima."}
                  </p>
                  <h3>DarePass</h3>
                  <p>
                    Comparte el enfoque de escenas y capas. La conexión directa
                    de cuentas y plantillas necesita un contrato y permisos
                    entre ambos servicios; aún no está conectada.
                  </p>
                </div>
              </>
            )}
            {modal === "help" && (
              <>
                <div className="modal-symbol">
                  <Sparkles size={25} />
                </div>
                <h2 id="modal-title">Una idea. Un poco de movimiento.</h2>
                <p>Tu primera animación, en cuatro pasos.</p>
                <ol className="help-steps">
                  <li>
                    <b>Añade un elemento.</b> Usa la barra bajo el lienzo o el
                    panel Recursos.
                  </li>
                  <li>
                    <b>Marca su punto de partida.</b> Selecciona la capa y pulsa
                    Marcar clave.
                  </li>
                  <li>
                    <b>Avanza en el tiempo.</b> Mueve el cabezal y cambia
                    posición, tamaño, escala, giro u opacidad. Se crea otra
                    clave.
                  </li>
                  <li>
                    <b>Dale al play y exporta.</b> O usa clic derecho para
                    aplicar una entrada preparada.
                  </li>
                </ol>
                <div className="shortcut-list">
                  <span>
                    <kbd>ESPACIO</kbd>Reproducir / pausar
                  </span>
                  <span>
                    <kbd>K</kbd>Marcar clave
                  </span>
                  <span>
                    <kbd>⇧ K</kbd>Eliminar clave
                  </span>
                  <span>
                    <kbd>⌘/Ctrl Z</kbd>Deshacer
                  </span>
                  <span>
                    <kbd>⌘/Ctrl D</kbd>Duplicar capa
                  </span>
                  <span>
                    <kbd>⌘/Ctrl S</kbd>Descargar proyecto
                  </span>
                  <span>
                    <kbd>⌘/Ctrl ← →</kbd>Avanzar un fotograma
                  </span>
                  <span>
                    <kbd>SUPR</kbd>Eliminar capa
                  </span>
                </div>
                <p className="hint">
                  Arrastra la esquina inferior derecha para cambiar el tamaño.
                  Agrupa con contenedores desde Propiedades → Jerarquía. Los
                  proyectos se guardan en este navegador; descarga una copia
                  para llevarlos a otro dispositivo.
                </p>
              </>
            )}
            {modal === "new" && (
              <>
                <div className="modal-symbol">
                  <FilePlus2 size={25} />
                </div>
                <h2 id="modal-title">Empieza una nueva historia.</h2>
                <p>
                  Descarga tu proyecto actual si quieres conservar una copia.
                  También podrás deshacer este cambio.
                </p>
                <button
                  className="outline-button full"
                  onClick={() => exportProject(project)}
                >
                  <Download size={16} />
                  Guardar una copia de este proyecto
                </button>
                <div className="new-options">
                  <button
                    className="primary-button"
                    onClick={() => {
                      commit(blankProject());
                      setFrame(0);
                      setPlaying(false);
                      select(null);
                      setModal(null);
                    }}
                  >
                    Lienzo en blanco
                  </button>
                  <button
                    className="outline-button"
                    onClick={() => {
                      const p = demoProject();
                      commit(p);
                      setFrame(45);
                      select(p.layers[2].id);
                      setModal(null);
                    }}
                  >
                    Usar escena de ejemplo
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
