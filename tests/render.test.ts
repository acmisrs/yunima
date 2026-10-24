// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { blankProject, createLayer } from "../src/model";
import { importIsdkai, spriteLayer } from "../src/integrations";
import { images, render } from "../src/render";
import fixture from "./fixtures/isdkai.json";
function context() {
  const calls = new Map<string, ReturnType<typeof vi.fn>>();
  const ctx = new Proxy({ globalAlpha: 1 } as CanvasRenderingContext2D, {
    get: (target, key) => {
      if (key in target) return Reflect.get(target, key);
      if (!calls.has(String(key))) calls.set(String(key), vi.fn());
      return calls.get(String(key));
    },
  });
  return { ctx, calls };
}
afterEach(() => {
  images.clear();
  vi.restoreAllMocks();
});
describe("preview/export shared renderer", () => {
  it("preserves transparent PNG backgrounds while explicitly filling video backgrounds", () => {
    const p = { ...blankProject(), transparent: true },
      a = context();
    render(a.ctx, p, 0);
    expect(a.calls.get("fillRect")).toBeUndefined();
    render(a.ctx, p, 0, true);
    expect(a.calls.get("fillRect")).toHaveBeenCalledWith(0, 0, 1920, 1080);
  });
  it("preserves physical scale, masks, offsets and anchor across differently sized sprite cells", () => {
    const descriptor = structuredClone(fixture) as any;
    descriptor.frames[0] = {
      x: 8,
      y: 64,
      width: 128,
      height: 200,
      offsetX: 10,
      offsetY: -4,
      enabled: true,
      erasedRuns: [{ x: 12, y: 66, length: 3 }],
    };
    descriptor.sections[0].frameOrder = [0];
    descriptor.idleFrame = 3;
    const imported = importIsdkai(descriptor)[0],
      l = spriteLayer(imported, 180),
      p = { ...blankProject(), layers: [l] };
    const image = new Image();
    Object.defineProperties(image, {
      complete: { value: true },
      naturalWidth: { value: 1100 },
      naturalHeight: { value: 400 },
    });
    images.set(imported.sprite.image, { image, error: false });
    const inner = context();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      inner.ctx,
    );
    const a = context();
    render(a.ctx, p, 0);
    expect(inner.calls.get("clearRect")).toHaveBeenCalledWith(4, 2, 3, 1);
    // logicalSize=128, reference=256², anchor=.5/.975: varying crops retain one scale.
    expect(a.calls.get("drawImage")).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      0,
      0,
      128,
      200,
      37,
      25.3,
      64,
      100,
    );
  });
  it("does not render descendants outside their parent time range", () => {
    const parent = { ...createLayer("container"), start: 30 },
      child = { ...createLayer("text"), parentId: parent.id };
    const p = { ...blankProject(), layers: [parent, child] },
      a = context();
    render(a.ctx, p, 0);
    expect(a.calls.get("fillText")).toBeUndefined();
    render(a.ctx, p, 30);
    expect(a.calls.get("fillText")).toHaveBeenCalled();
  });
});
