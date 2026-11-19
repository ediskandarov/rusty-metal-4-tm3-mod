import type { MrDirectory, MrEntry } from "@tm4/resources/compatibility/mr";

import { at, requireValue } from "../shared/binary.ts";
import type { ConvertedGroup } from "./convert.ts";

// Resource-only conversion bakes custom parts into body space. Behavior modules
// need the original local vertices and a custom-group callback at the same pivot.
export function enableCarAnimations(root: MrDirectory, groups: ConvertedGroup[][]): void {
  const resolution = root.folders.get("display")?.folders.get("resolution");
  requireValue(resolution, "Missing car resolution directory");
  const vertexEntry = resolution.files.get("VertexList");
  requireValue(vertexEntry, "Missing car vertices");
  const vertices = vertexEntry.bytes.slice();
  const view = new DataView(vertices.buffer, vertices.byteOffset, vertices.byteLength);
  const restored = new Set<number>();
  const updates: { files: MrDirectory["files"]; name: string; entry: MrEntry }[] = [];
  for (const [lod, level] of groups.entries()) {
    const resources = resolution.folders.get(`r${lod}`)?.folders.get("Groups");
    requireValue(resources, "Missing LOD groups");
    for (const group of level) {
      if (!group.custom_vertices_in_body_space) continue;
      const entry = resources.files.get(group.name);
      requireValue(entry && entry.bytes.length >= 31, `Missing source group ${group.name}`);
      const bytes = entry.bytes.slice();
      const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      requireValue(data.getUint8(30) === 0, "Moving part is already enabled");
      for (const frame of [0, 12]) {
        const first = data.getInt16(frame + 4, true),
          count = data.getInt16(frame + 6, true);
        requireValue(
          first >= 0 && count >= 0 && (first + count) * 8 <= vertices.length,
          "Moving-part vertices outside storage",
        );
        for (let vertex = first; vertex < first + count; ++vertex) {
          requireValue(!restored.has(vertex), "Overlapping moving-part vertex storage");
          restored.add(vertex);
          for (let axis = 0; axis < 3; ++axis) {
            const offset = vertex * 8 + axis * 2;
            const local = view.getInt16(offset, true) - at(group.converted_pivot, axis);
            requireValue(
              local >= -32768 && local <= 32767,
              "Local moving-part coordinate overflow",
            );
            view.setInt16(offset, local, true);
          }
        }
      }
      data.setUint8(30, 1);
      updates.push({ files: resources.files, name: group.name, entry: { ...entry, bytes } });
    }
  }
  // Commit group flags and local vertices together, only after every LOD validates.
  for (const { files, name, entry } of updates) files.set(name, entry);
  resolution.files.set("VertexList", { ...vertexEntry, bytes: vertices });
}
