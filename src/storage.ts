import { demoProject, parseProject, type Project } from "./model";
const DB = "yunima",
  KEY = "current";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("projects");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function restore(): Promise<Project> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction("projects").objectStore("projects").get(KEY);
      r.onsuccess = () => {
        try {
          resolve(r.result ? parseProject(r.result) : demoProject());
        } catch (e) {
          reject(e);
        }
      };
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function save(p: Project): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("projects", "readwrite");
      t.objectStore("projects").put(p, KEY);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}
