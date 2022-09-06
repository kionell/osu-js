import { LoadCallback } from "./executor";
import { Howl } from "howler";
import { loadSound } from "./util";
import { isUsingIOS } from "../constants";

export async function loadSamples(
  input: Map<string, Blob>,
  cb: LoadCallback
): Promise<Map<string, Howl>> {
  const samples = new Map<string, Howl>();

  let decoded = 0;
  for (const [name, blob] of input.entries()) {
    cb(
      decoded / input.size,
      `Loading Samples (${decoded + 1} / ${input.size})`
    );

    const howl = await loadSound({
      src: URL.createObjectURL(blob),
      html5: !isUsingIOS,
      preload: true,
      format: name.substring(name.lastIndexOf(".") + 1),
    });

    samples.set(name, howl);

    decoded++;
  }

  return samples;
}
