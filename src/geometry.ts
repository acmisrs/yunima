import { evaluate, type Layer, type Pose, type Project } from "./model";
export type Matrix = [number, number, number, number, number, number];
export const identity: Matrix = [1, 0, 0, 1, 0, 0];
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export function transform(m: Matrix, x: number, y: number) {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}
export function inverse(m: Matrix): Matrix {
  const d = m[0] * m[3] - m[1] * m[2];
  return [
    m[3] / d,
    -m[1] / d,
    -m[2] / d,
    m[0] / d,
    (m[2] * m[5] - m[3] * m[4]) / d,
    (m[1] * m[4] - m[0] * m[5]) / d,
  ];
}
export function matrix(p: Pose): Matrix {
  const r = (p.rotation * Math.PI) / 180,
    c = Math.cos(r) * p.scale,
    s = Math.sin(r) * p.scale;
  return [
    c,
    s,
    -s,
    c,
    p.x + p.width / 2 - (c * p.width) / 2 + (s * p.height) / 2,
    p.y + p.height / 2 - (s * p.width) / 2 - (c * p.height) / 2,
  ];
}
export function world(p: Project, l: Layer, frame: number): Matrix {
  const local = matrix(evaluate(l, frame)),
    parent = p.layers.find((n) => n.id === l.parentId);
  return parent ? multiply(world(p, parent, frame), local) : local;
}
export function parentMatrix(p: Project, l: Layer, frame: number): Matrix {
  const parent = p.layers.find((n) => n.id === l.parentId);
  return parent ? world(p, parent, frame) : identity;
}
export function visible(p: Project, l: Layer, frame: number): boolean {
  if (l.hidden || frame < l.start || frame >= l.end) return false;
  const parent = p.layers.find((n) => n.id === l.parentId);
  return !parent || visible(p, parent, frame);
}
export function hitTest(
  p: Project,
  frame: number,
  x: number,
  y: number,
): Layer | undefined {
  const visit = (parentId: string | null): Layer | undefined => {
    for (const l of p.layers.filter((l) => l.parentId === parentId).reverse()) {
      if (!visible(p, l, frame)) continue;
      const child = visit(l.id);
      if (child) return child;
      const pt = transform(inverse(world(p, l, frame)), x, y),
        v = evaluate(l, frame);
      if (pt.x >= 0 && pt.y >= 0 && pt.x <= v.width && pt.y <= v.height)
        return l;
    }
  };
  return visit(null);
}
