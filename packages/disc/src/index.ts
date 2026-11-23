import { discDirectorySources } from "@tm4/resources/host/disc";

import { openDataSources } from "./data.ts";

export async function openDataDisc(directory: string) {
  return openDataSources(await discDirectorySources(directory));
}
