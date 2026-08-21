import { chromium, type Browser } from "playwright";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SLIDE_WIDTH, SLIDE_HEIGHT } from "@/lib/sanitize";

// ============================================
// Slide renderer
//
// Rasterises a slide document so the agent can evaluate what a slide actually
// looks like rather than guessing from its markup. Also reports layout faults
// measured from the DOM, which are cheaper and more reliable than asking a
// model to spot them.
// ============================================

let browserPromise: Promise<Browser> | null = null;

/** One browser per process, reused across renders.
 *  CHROMIUM_EXECUTABLE_PATH lets a deployment point at a system Chromium
 *  instead of the copy Playwright downloads, which matters in slim containers
 *  and anywhere `npx playwright install` cannot run. */
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH || undefined;
    browserPromise = chromium.launch({
      executablePath,
      args: ["--no-sandbox", "--font-render-hinting=none"],
    });
  }
  return browserPromise;
}

export async function closeRenderer(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}

let cachedCss: string | null = null;

/** Inline the compiled slide stylesheet so rendering needs no running server. */
async function slideCss(): Promise<string> {
  if (cachedCss !== null) return cachedCss;
  try {
    cachedCss = await readFile(path.join(process.cwd(), "public", "slide-runtime.css"), "utf8");
  } catch {
    console.error(
      "[slide-renderer] public/slide-runtime.css missing — run npm run build:slide-css",
    );
    cachedCss = "";
  }
  return cachedCss;
}

/**
 * Open a slide document in a page, run `fn` against it, and always clean up.
 *
 * Shared by rendering and layout extraction so both load a slide identically:
 * the design canvas as the viewport, the compiled stylesheet injected, and no
 * network access.
 */
export async function chromiumPage<T>(
  wrappedHtml: string,
  fn: (page: import("playwright").Page) => Promise<T>,
  options: { deviceScaleFactor?: number; timeoutMs?: number } = {},
): Promise<T> {
  const { deviceScaleFactor = 1, timeoutMs = 15_000 } = options;
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
    deviceScaleFactor,
  });
  const page = await context.newPage();

  try {
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith("data:") || url.startsWith("about:")) return route.continue();
      return route.abort();
    });

    await page.setContent(wrappedHtml, { waitUntil: "load", timeout: timeoutMs });

    // setContent gives the document an about:blank origin, so the stylesheet
    // link never resolves to a fetchable URL. Inject the compiled CSS instead.
    const css = await slideCss();
    if (css) await page.addStyleTag({ content: css });
    await page.waitForTimeout(150);

    return await fn(page);
  } finally {
    await context.close();
  }
}

/** A concrete layout fault measured from the DOM, not inferred by a model. */
export interface LayoutFault {
  kind: "overflow-y" | "overflow-x" | "tiny-text" | "out-of-bounds" | "empty-canvas";
  detail: string;
}

export interface RenderResult {
  /** PNG bytes of the slide at its design size. */
  png: Buffer;
  faults: LayoutFault[];
  /** Fraction of the canvas covered by content, 0-1. Very low means a sparse slide. */
  fillRatio: number;
}

export interface RenderOptions {
  /** 2 produces a retina-scale image, which reads better for visual evaluation. */
  deviceScaleFactor?: number;
  timeoutMs?: number;
}

/**
 * Render one wrapped slide document to PNG and measure its layout.
 *
 * The viewport is set to exactly the design canvas, so the fit script resolves
 * to scale 1 and one rendered pixel equals one authored pixel.
 */
export async function renderSlide(
  wrappedHtml: string,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const { deviceScaleFactor = 2, timeoutMs = 15_000 } = options;

  return chromiumPage(
    wrappedHtml,
    async (page) => {
      const measured = await page.evaluate(() => {
        const canvas = document.getElementById("slide-canvas");
        if (!canvas) return null;
        const faults: { kind: string; detail: string }[] = [];

        if (canvas.scrollHeight > canvas.clientHeight + 2) {
          faults.push({
            kind: "overflow-y",
            detail: `content is ${canvas.scrollHeight - canvas.clientHeight}px taller than the slide and is being cut off`,
          });
        }
        if (canvas.scrollWidth > canvas.clientWidth + 2) {
          faults.push({
            kind: "overflow-x",
            detail: `content is ${canvas.scrollWidth - canvas.clientWidth}px wider than the slide`,
          });
        }

        const bounds = canvas.getBoundingClientRect();
        let painted = 0;
        let tiniest = Infinity;
        let outOfBounds = 0;

        for (const el of Array.from(canvas.querySelectorAll<HTMLElement>("*"))) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          // Decoration is marked aria-hidden and is clipped by the canvas.
          // The renderer deliberately bleeds shapes off the edges, so counting
          // them as out-of-bounds reported a fault on every well-formed slide.
          if (el.closest('[aria-hidden="true"]')) continue;

          const text = (el.textContent ?? "").trim();
          if (text && el.children.length === 0) {
            const size = parseFloat(getComputedStyle(el).fontSize);
            // Deck furniture — the template's own 10pt page number — is not
            // content, and holding it to a content readability floor reported
            // a fault on every faithfully rendered slide.
            const isFurniture = el.getAttribute("data-path") === "__footer";
            if (size > 0 && size < tiniest && !isFurniture) tiniest = size;
            painted += rect.width * rect.height;
          }
          if (
            rect.right > bounds.right + 2 ||
            rect.left < bounds.left - 2 ||
            rect.bottom > bounds.bottom + 2 ||
            rect.top < bounds.top - 2
          ) {
            outOfBounds++;
          }
        }

        if (outOfBounds > 0) {
          faults.push({
            kind: "out-of-bounds",
            detail: `${outOfBounds} element(s) extend past the slide edge`,
          });
        }
        if (tiniest !== Infinity && tiniest < 14) {
          faults.push({
            kind: "tiny-text",
            detail: `smallest text is ${tiniest.toFixed(0)}px at slide scale, which is unreadable when projected`,
          });
        }
        if (!canvas.textContent?.trim()) {
          faults.push({ kind: "empty-canvas", detail: "the slide renders no text at all" });
        }

        return { faults, fillRatio: Math.min(1, painted / (bounds.width * bounds.height)) };
      });

      const png = (await page.screenshot({ type: "png" })) as Buffer;

      if (measured === null) {
        // Never report a document without a canvas as clean; that would let a
        // broken slide pass evaluation unexamined.
        return {
          png,
          faults: [
            {
              kind: "empty-canvas" as const,
              detail:
                "no slide canvas found in the document, so its layout could not be measured; re-wrap it with wrapSlideHtml",
            },
          ],
          fillRatio: 0,
        };
      }

      return {
        png,
        faults: measured.faults as LayoutFault[],
        fillRatio: measured.fillRatio,
      };
    },
    { deviceScaleFactor, timeoutMs },
  );
}
