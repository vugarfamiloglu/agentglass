/**
 * Records the README demo: the live dashboard, a run torn open in the
 * inspector, analytics, and the assistant answering.
 *
 *   npm run dev                       # dashboard on :4318, simulator on
 *   npx playwright@latest install chromium
 *   node scripts/record-demo.mjs      # writes rec/<hash>.webm
 *   ffmpeg -i rec/*.webm -vf "fps=9,scale=880:-1:flags=lanczos,split[s0][s1];\
 *     [s0]palettegen=max_colors=128:stats_mode=diff[p];\
 *     [s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
 *     -loop 0 docs/demo.gif
 *
 * Disconnect the assistant in Settings first — a local answer is instant, while
 * a real model can spend a minute thinking and there's no GIF in that.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.AG ?? "http://localhost:4318";
const OUT = process.env.OUT ?? "./rec";
const beat = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });

// Pick the richest recent run so the waterfall has a real agent loop to show.
const listed = await (await fetch(`${BASE}/api/traces?limit=12`)).json();
const hero = listed.data.traces
  .filter((t) => t.status !== "running" && t.spanCount >= 6)
  .sort((a, b) => b.spanCount - a.spanCount)[0];
if (!hero) throw new Error("no finished run with enough spans yet — let the simulator run a while");
console.log(`hero run: "${hero.name}" — ${hero.spanCount} spans, ${hero.toolCount} tools`);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 780 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 780 } },
});
const page = await context.newPage();

// 1. The command center, updating live.
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".stat-grid");
await beat(3200);

// 2. Every run, searchable.
await page.click('a[href="/traces"]');
await page.waitForSelector('a[href^="/traces/tr_"]');
await beat(1800);

// 3. Open the black box: waterfall, then a step's full I/O.
await page.click(`a[href="/traces/${hero.id}"]`);
await page.waitForSelector(".span-row");
await beat(2600);
await page.locator(".span-row").nth(1).click();
await page.waitForSelector(".sd-json");
await beat(3000);

// 4. Where the money went.
await page.click('a[href="/analytics"]');
await page.waitForSelector(".panel");
await beat(2600);

// 5. Ask the runs a question.
await page.click('a[href="/"]');
await page.waitForSelector(".stat-grid");
await beat(700);
await page.click('button:has-text("Which models cost the most?")');
await beat(3200);

await context.close(); // finalises the video file
await browser.close();
console.log(`recorded to ${OUT}`);
