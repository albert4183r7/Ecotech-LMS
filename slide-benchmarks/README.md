# Slide benchmark decks

Place one approved `.pptx` in `input/`, then run:

```bash
npm run slides:benchmark
```

The command reads the PowerPoint locally and writes `cache/active-profile.json`.
It does **not** call an LLM. If the source file hash has not changed, it exits
without rebuilding the profile.

Lesson generation reads only the cached profile. It never re-opens the source
PowerPoint and sends only a few role-compatible layout/content exemplars to the
model, not the whole reference deck. This keeps the prompt small while the
PowerPoint renderer applies the extracted fonts, type scale, palette, geometry,
and transparency deterministically.

The source `.pptx` is git-ignored because reference decks can be large or
confidential. The generated profile is intentionally committable for deployment.
It contains extracted sample text, so review it before committing if the source
deck contains sensitive material.

To replace the benchmark, replace the `.pptx` and rerun the command. Use
`npm run slides:benchmark -- --force` to rebuild even when the hash matches.
