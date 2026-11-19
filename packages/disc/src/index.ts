import { discDirectorySources } from "@tm4/resources/host/disc";
import { parseCcd } from "@tm4/resources/loader/ccd";
import { parseCue } from "@tm4/resources/loader/cue";
import { Disc } from "@tm4/resources/loader/disc";
import { fileKey } from "@tm4/resources/loader/sources";

// Only the data track is needed to build resources.
export async function openDataDisc(directory: string) {
  const sources = await discDirectorySources(directory);
  const files = [...sources.values()];
  const descriptors = files.filter((file) => /\.(ccd|cue)$/i.test(file.name));
  if (descriptors.length > 1) throw Error(`Multiple disc descriptors in ${directory}`);
  const [descriptor] = descriptors;
  let disc: Disc;
  if (descriptor) {
    if (descriptor.size > 65536) throw Error(`Disc descriptor is too large: ${descriptor.name}`);
    const text = await descriptor.file.text();
    const tracks = /\.ccd$/i.test(descriptor.name)
      ? parseCcd(text, descriptor.name).tracks
      : parseCue(text);
    const first = tracks[0]!;
    const source = sources.get(fileKey(first.file));
    if (!source) throw Error(`Missing data track in ${directory}: ${first.file}`);
    disc = new Disc(source, first.index);
  } else {
    const images = files.filter((file) => /\.(bin|img)$/i.test(file.name));
    if (images.length !== 1) throw Error(`Expected a CUE, CCD or single raw image in ${directory}`);
    disc = new Disc(images[0]!);
  }
  const entries = await disc.entries();
  return async (path: string) => {
    const entry = entries.find((entry) => entry.path.toUpperCase() === path);
    if (!entry) throw Error(`${directory}: disc file ${path} is missing`);
    return disc.read(entry.lba, entry.size);
  };
}
