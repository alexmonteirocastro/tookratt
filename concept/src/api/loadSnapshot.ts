import snapshot from "../data/snapshot.json";
import type { DemoPayload } from "./types";

export async function loadSnapshot(): Promise<DemoPayload> {
  return snapshot as DemoPayload;
}
