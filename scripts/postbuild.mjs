// Copy the assets Next's standalone output does not include.
// Replaces the POSIX `cp -r` chain so the build runs on Windows too.
import { cp, access } from "node:fs/promises";
import { constants } from "node:fs";

const copies = [
  ["./.next/static", "./.next/standalone/.next/static"],
  ["./public", "./.next/standalone/public"],
];

for (const [from, to] of copies) {
  try {
    await access(from, constants.F_OK);
  } catch {
    console.log(`postbuild: skipping ${from} (not present)`);
    continue;
  }
  await cp(from, to, { recursive: true });
  console.log(`postbuild: ${from} -> ${to}`);
}
