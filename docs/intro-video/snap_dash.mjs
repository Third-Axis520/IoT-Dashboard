import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
await page.goto('http://192.168.6.23:5200/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4500);
await page.screenshot({ path: 'screenshots/dash-now.png', fullPage: false });
// Inspect card values
const vals = await page.$$eval('.glass-panel', cards => cards.map(c => {
  const r = c.getBoundingClientRect();
  const big = c.querySelectorAll('[class*="text-3xl"], [class*="text-4xl"], [class*="text-5xl"], [class*="text-6xl"]');
  return {
    x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
    text: c.textContent.trim().slice(0, 120),
    vals: Array.from(big).map(b => b.textContent.trim()).filter(Boolean),
  };
}).filter(c => c.w > 200 && c.h > 100));
console.log('CARDS:');
vals.forEach(v => console.log(' ', JSON.stringify(v)));
await browser.close();
