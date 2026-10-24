// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { demoProject, type Project } from "../src/model";
import fixture from "./fixtures/isdkai.json";
vi.mock("../src/storage", async () => {
  const { demoProject } = await import("../src/model");
  return {
    restore: vi.fn(async () => demoProject()),
    save: vi.fn(async () => {}),
  };
});
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
});
let root: Root, container: HTMLDivElement;
const api = () =>
  (window as any).yunimaAPI as {
    call: (method: string, params?: unknown) => Promise<any>;
  };
const buttons = () => Array.from(container.querySelectorAll("button"));
async function clickTitle(title: string) {
  const b = container.querySelector<HTMLButtonElement>(
    `button[title="${title}"]`,
  );
  expect(b).not.toBeNull();
  await act(async () => b!.click());
}
async function clickText(text: string) {
  const b = buttons().find((b) => b.textContent?.trim() === text);
  expect(b).not.toBeUndefined();
  await act(async () => b!.click());
}
const keys = () =>
  Array.from(
    container.querySelectorAll('button[aria-label^="Fotograma clave "]'),
  ).map((b) => b.getAttribute("aria-label"));
beforeEach(async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    new Proxy({} as CanvasRenderingContext2D, {
      get: (target, key) =>
        key in target ? Reflect.get(target, key) : () => {},
    }),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<App />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
describe("complete editor flows", () => {
  it("shows only the selected element keys, creates text, animates it, deletes a key and undoes", async () => {
    expect(keys()).toEqual([
      "Fotograma clave 0",
      "Fotograma clave 30",
      "Fotograma clave 150",
    ]);
    await clickText("Acento");
    expect(keys()).toHaveLength(0);
    await clickTitle("Añadir texto");
    await clickTitle("Marcar fotograma clave (K)");
    expect(keys()).toEqual(["Fotograma clave 45"]);
    await clickTitle("Ir al final");
    const field = container.querySelector<HTMLInputElement>(
      'input[aria-label="X"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(field, "800");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(keys()).toEqual(["Fotograma clave 45", "Fotograma clave 179"]);
    expect(
      (await api().call("project.get")).layers.at(-1).keyframes[1].value.x,
    ).toBe(800);
    await clickTitle("Eliminar fotograma clave (Mayús K)");
    expect(keys()).toEqual(["Fotograma clave 45"]);
    await clickTitle("Deshacer (⌘/Ctrl Z)");
    expect(keys()).toHaveLength(2);
    await clickText("Título principal");
    expect(keys()).toHaveLength(3);
  });
  it("creates a nested layer inside a container and duplicates the whole subtree", async () => {
    await clickTitle("Añadir contenedor");
    await clickTitle("Añadir texto");
    let p: Project = await api().call("project.get");
    expect(p.layers.at(-1)?.parentId).toBe(p.layers.at(-2)?.id);
    await clickText("Contenedor");
    await clickText("Duplicar");
    p = await api().call("project.get");
    expect(p.layers).toHaveLength(10);
    expect(p.layers.at(-1)?.parentId).toBe(p.layers.at(-2)?.id);
    await clickTitle("Eliminar capa");
    p = await api().call("project.get");
    expect(p.layers).toHaveLength(8);
  });
  it("validates the API boundary and turns imported Isdkai assets into real timeline layers", async () => {
    await expect(
      api().call("project.replace", { format: "wrong" }),
    ).rejects.toThrow();
    expect((await api().call("project.get")).layers).toHaveLength(6);
    await act(async () => {
      await api().call("sprites.import", {
        format: "wisdkai.project.v1",
        data: { sprites: { james: fixture } },
      });
    });
    await clickText("James4 fotogramas · 8 fps");
    const p: Project = await api().call("project.get");
    expect(p.layers).toHaveLength(7);
    expect(p.layers.at(-1)?.sprite?.origin).toEqual(fixture.origin);
    expect(p.layers.at(-1)?.height).toBe(fixture.logicalSize);
  });
  it("restores a replaced project through undo and never mutates exported snapshots", async () => {
    const p = demoProject();
    p.name = "Another project";
    await act(async () => {
      await api().call("project.replace", p);
    });
    const snapshot = await api().call("project.get");
    snapshot.name = "tampered";
    expect((await api().call("project.get")).name).toBe("Another project");
    await clickTitle("Deshacer (⌘/Ctrl Z)");
    expect((await api().call("project.get")).name).toBe(
      "Una idea en movimiento",
    );
  });
});
