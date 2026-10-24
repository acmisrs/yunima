import { describe, expect, it } from "vitest";
import {
  blankProject,
  createLayer,
  demoProject,
  duplicateLayer,
  editPose,
  evaluate,
  parseProject,
  pose,
  preset,
  removeLayer,
  safeAsset,
  setKey,
  spriteIndex,
} from "../src/model";
import { hitTest, inverse, multiply, transform, world } from "../src/geometry";
import { importIsdkai, spriteLayer } from "../src/integrations";
import fixture from "./fixtures/isdkai.json";

describe("per-element animation", () => {
  it("interpolates properties with an outgoing easing and holds boundary poses", () => {
    const l = createLayer("text");
    const a = { ...pose(l), x: 0, opacity: 0 },
      b = { ...pose(l), x: 100, opacity: 1 };
    const animated = setKey(setKey(l, 10, a, "linear"), 30, b);
    expect(evaluate(animated, 0)).toEqual(a);
    expect(evaluate(animated, 40)).toEqual(b);
    expect(evaluate(animated, 20)).toMatchObject({ x: 50, opacity: 0.5 });
    expect(
      evaluate(
        {
          ...animated,
          keyframes: animated.keyframes.map((k) => ({
            ...k,
            easing: "ease-in",
          })),
        },
        20,
      ).x,
    ).toBe(12.5);
    expect(
      evaluate(
        {
          ...animated,
          keyframes: animated.keyframes.map((k) => ({ ...k, easing: "step" })),
        },
        29,
      ).x,
    ).toBe(0);
    expect(
      evaluate(
        {
          ...animated,
          keyframes: animated.keyframes.map((k) => ({ ...k, easing: "step" })),
        },
        30,
      ).x,
    ).toBe(100);
  });
  it("updates exactly one key and leaves other elements unchanged", () => {
    const a = setKey(createLayer("text"), 0),
      b = createLayer("rectangle");
    const next = editPose(a, 20, { x: 900 });
    expect(next.keyframes).toHaveLength(2);
    expect(next.keyframes[1].value.x).toBe(900);
    expect(a.keyframes).toHaveLength(1);
    expect(b.keyframes).toHaveLength(0);
    expect(setKey(next, 20, { ...pose(next), x: 800 }).keyframes).toHaveLength(
      2,
    );
  });
  it("edits static base poses until the user explicitly starts keyframing", () => {
    const l = createLayer("text"),
      next = editPose(l, 90, { x: 2 });
    expect(next.x).toBe(2);
    expect(next.keyframes).toHaveLength(0);
  });
  it("creates presets at the playhead and refuses a zero-length animation", () => {
    const l = createLayer("text"),
      next = preset(l, "rise", 30, 180, 30);
    expect(next.keyframes.map((k) => k.frame)).toEqual([30, 54]);
    expect(evaluate(next, 30).opacity).toBe(0);
    expect(evaluate(next, 54).y).toBe(l.y);
    expect(() => preset(l, "fade", 179, 180, 30)).toThrow();
  });
});
describe("scene graph", () => {
  it("combines nested translation, rotation and scale and reverses coordinate conversion", () => {
    const p = blankProject(),
      a = {
        ...createLayer("container"),
        x: 100,
        y: 70,
        width: 200,
        height: 200,
        rotation: 90,
        scale: 2,
      };
    const b = {
      ...createLayer("text"),
      parentId: a.id,
      x: 20,
      y: 30,
      width: 50,
      height: 20,
    };
    p.layers = [a, b];
    const m = world(p, b, 0),
      pt = transform(m, 12, 9);
    expect(transform(inverse(m), pt.x, pt.y).x).toBeCloseTo(12);
    expect(transform(inverse(m), pt.x, pt.y).y).toBeCloseTo(9);
    expect(multiply(m, inverse(m))).toEqual(
      expect.arrayContaining([expect.any(Number)]),
    );
    expect(hitTest(p, 0, pt.x, pt.y)?.id).toBe(b.id);
  });
  it("hides children with a hidden parent and honors parent time ranges", () => {
    const p = blankProject(),
      a = { ...createLayer("container"), hidden: true },
      b = { ...createLayer("text"), parentId: a.id, x: 0, y: 0 };
    p.layers = [a, b];
    expect(hitTest(p, 0, a.x + 5, a.y + 5)).toBeUndefined();
    p.layers[0] = { ...a, hidden: false, start: 30 };
    expect(hitTest(p, 0, a.x + 5, a.y + 5)).toBeUndefined();
  });
  it("duplicates subtrees with fresh IDs and independent keyframes and removes them atomically", () => {
    const p = blankProject(),
      a = setKey(createLayer("container"), 0),
      b = { ...createLayer("text"), parentId: a.id },
      c = { ...createLayer("rectangle"), parentId: b.id };
    // Only containers may own children; use a second container here.
    b.kind = "container";
    p.layers = [a, b, c];
    const result = duplicateLayer(p, a.id);
    expect(result.project.layers).toHaveLength(6);
    expect(new Set(result.project.layers.map((l) => l.id)).size).toBe(6);
    const copied = result.project.layers.find((l) => l.id === result.id)!;
    expect(copied.x).toBe(a.x + 40);
    expect(copied.keyframes[0].value.x).toBe(a.x + 40);
    expect(removeLayer(result.project, result.id)).toEqual(p);
  });
});
describe("untrusted project boundary", () => {
  it("round trips the sample without losing animation or typography", () => {
    const p = demoProject();
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it("rejects cycles, invalid parents and duplicate IDs", () => {
    const p = blankProject(),
      a = createLayer("container"),
      b = { ...createLayer("container"), parentId: a.id };
    a.parentId = b.id;
    p.layers = [a, b];
    expect(() => parseProject(p)).toThrow(/ciclo/);
    a.parentId = "missing";
    expect(() => parseProject(p)).toThrow(/inexistente/);
    p.layers = [a, { ...a }];
    expect(() => parseProject(p)).toThrow(/duplicados/);
  });
  it("rejects non-finite geometry, duplicate keys and out-of-range time", () => {
    const p = demoProject();
    p.layers[0].x = NaN;
    expect(() => parseProject(p)).toThrow();
    p.layers[0].x = 0;
    p.layers[2].keyframes.push(p.layers[2].keyframes[0]);
    expect(() => parseProject(p)).toThrow(/duplicados/);
    p.layers[2].keyframes = [];
    p.layers[0].end = p.duration + 1;
    expect(() => parseProject(p)).toThrow();
  });
  it("drops unknown executable fields and blocks unsafe resource schemes", () => {
    const p = {
      ...blankProject(),
      onload: "alert(1)",
      __extra: { code: "bad" },
    };
    expect(parseProject(p)).not.toHaveProperty("onload");
    for (const src of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "data:image/svg+xml,<svg/>",
      "https://user:secret@example.com/a.png",
      "http://example.com/a.png",
    ])
      expect(() => safeAsset(src)).toThrow();
    expect(safeAsset("/demo/sheet.png", "https://isdkai.pages.dev/")).toBe(
      "https://isdkai.pages.dev/demo/sheet.png",
    );
  });
});
describe("real iSDKai descriptor compatibility", () => {
  it("imports a .wisdkai document and preserves masks, disabled frames, alignment and sequence order", () => {
    const imported = importIsdkai({
      format: "wisdkai.project.v1",
      data: { sprites: { james: fixture } },
    })[0];
    expect(imported.sprite.image).toBe(
      "https://isdkai.pages.dev/demo/james.png",
    );
    expect(imported.sprite.frames[0].width).toBe(256);
    expect(imported.sprite.sections[0].frameOrder).toEqual([0, 1, 2, 3]);
    const custom = structuredClone(fixture) as any;
    custom.frames[0].offsetX = -12;
    custom.frames[0].erasedRuns = [{ x: 10, y: 70, length: 6 }];
    custom.frames[1].enabled = false;
    custom.sections[0].frameOrder = [3, 1, 0];
    const sprite = importIsdkai(custom)[0].sprite;
    expect(sprite.frames[0].offsetX).toBe(-12);
    expect(sprite.frames[0].erasedRuns[0]).toEqual({ x: 10, y: 70, length: 6 });
    expect(spriteIndex(sprite, 0, 30)).toBe(3);
    expect(spriteIndex(sprite, 4, 30)).toBe(0);
    expect(spriteIndex(sprite, 8, 30)).toBe(3);
    const l = spriteLayer(imported, 180),
      p = { ...blankProject(), layers: [l] };
    expect(parseProject(p).layers[0].sprite).toEqual(imported.sprite);
  });
  it("supports standalone descriptors and rejects corrupt frame references", () => {
    expect(importIsdkai(fixture)).toHaveLength(1);
    const broken = structuredClone(fixture);
    broken.sections[0].frameOrder = [999];
    expect(() => importIsdkai(broken)).toThrow();
  });
  it("honors animationEnabled and a static idle pose", () => {
    const s = importIsdkai(fixture)[0].sprite;
    s.animationEnabled = false;
    s.idleFrame = 2;
    expect(spriteIndex(s, 999, 30)).toBe(2);
  });
});
