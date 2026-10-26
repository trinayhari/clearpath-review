import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({
  ignoreHTTPSErrors: process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS === "1",
});
await page.goto(process.env.BASE_URL ?? "http://127.0.0.1:3000");
if (process.argv.includes("--review"))
  await page.getByRole("button", { name: /A little breathing room/ }).click();
const selectors = process.argv.includes("--review")
  ? [
      ".review-meta",
      ".version-bar",
      ".finding-top",
      ".finding-top a",
      ".finding>p",
      ".analysis-summary p",
      ".copy-meta",
      ".copy-foot",
      ".uncertainty",
      ".suggestion small",
      ".suggestion p",
    ]
  : [
      ".page-heading p",
      ".stat small",
      ".campaign-link small",
      "th",
      ".owner",
      ".table-footer",
      ".subtle-footer",
      ".demo-strip",
      ".nav-label",
      ".queue-tabs button",
      ".risk-high",
      ".risk-medium",
      ".badge.in-review",
      ".badge.changes-requested",
      ".badge.approved",
      ".badge.rejected",
    ];
const rows = await page.evaluate((selectors) => {
  function rgb(v) {
    return (v.match(/[\d.]+/g) || []).map(Number);
  }
  function lum(c) {
    return c
      .slice(0, 3)
      .map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
  }
  return selectors.map((selector) => {
    const el = document.querySelector(selector);
    if (!el) return { selector, missing: true };
    const color = getComputedStyle(el).color;
    let bg = "rgb(255, 255, 255)",
      node = el;
    while (node) {
      const value = getComputedStyle(node).backgroundColor;
      const parts = rgb(value);
      if (parts.length === 3 || parts[3] > 0) {
        bg = value;
        break;
      }
      node = node.parentElement;
    }
    const a = lum(rgb(color)),
      b = lum(rgb(bg));
    return {
      selector,
      color,
      background: bg,
      ratio: Number(
        ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2),
      ),
    };
  });
}, selectors);
console.log(JSON.stringify(rows, null, 2));
await browser.close();
if (
  process.argv.includes("--assert") &&
  rows.some((r) => !r.missing && r.ratio < 4.5)
)
  process.exitCode = 1;
