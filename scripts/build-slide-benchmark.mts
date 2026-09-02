import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractSlideBenchmark } from "../src/lib/slides/benchmark/extract";
import {
  ACTIVE_BENCHMARK_PROFILE,
  SlideBenchmarkProfileSchema,
} from "../src/lib/slides/benchmark/profile";

const args = process.argv.slice(2);
const valueAfter = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const force = args.includes("--force");
const inputDir = path.join(process.cwd(), "slide-benchmarks", "input");
const explicit = valueAfter("--input");
const candidates = explicit
  ? [path.resolve(explicit)]
  : (await readdir(inputDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pptx"))
      .map((entry) => path.join(inputDir, entry.name));

if (candidates.length !== 1) {
  throw new Error(
    candidates.length === 0
      ? `No benchmark PowerPoint found. Put one .pptx in ${inputDir}.`
      : `Found ${candidates.length} benchmark PowerPoints. Keep one in input/ or pass --input <file>.`,
  );
}

const sourcePath = candidates[0];
const data = await readFile(sourcePath);
const sourceSha256 = createHash("sha256").update(data).digest("hex");

if (!force) {
  try {
    const existing = SlideBenchmarkProfileSchema.parse(
      JSON.parse(await readFile(ACTIVE_BENCHMARK_PROFILE, "utf8")),
    );
    if (existing.sourceSha256 === sourceSha256) {
      console.log(
        `slide benchmark unchanged (${sourceSha256.slice(0, 12)}); using ${ACTIVE_BENCHMARK_PROFILE}`,
      );
      process.exit(0);
    }
  } catch {
    // Missing or invalid cache is rebuilt below.
  }
}

const profile = SlideBenchmarkProfileSchema.parse(
  await extractSlideBenchmark(data, path.basename(sourcePath), sourceSha256),
);
await mkdir(path.dirname(ACTIVE_BENCHMARK_PROFILE), { recursive: true });
await writeFile(ACTIVE_BENCHMARK_PROFILE, `${JSON.stringify(profile, null, 2)}\n`, "utf8");

console.log(
  `built slide benchmark ${sourceSha256.slice(0, 12)} from ${path.basename(sourcePath)}: ` +
    `${profile.layouts.length} layouts, ${profile.template.fonts.heading}/${profile.template.fonts.body}, ` +
    `${profile.editorial.averageWords} average words`,
);
