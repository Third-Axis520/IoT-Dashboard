// Find which mini-trend charts have real data right now
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
await page.goto('http://192.168.6.23:5200/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4500);
await page.locator('button', { hasText: '趨勢' }).first().click();
await page.waitForTimeout(3000);

const charts = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('.recharts-wrapper'));
  return cards.map((card, i) => {
    const rect = card.getBoundingClientRect();
    const linePath = card.querySelector('path.recharts-line-curve, path.recharts-curve');
    const dAttr = linePath?.getAttribute('d') || '';
    const ys = Array.from(dAttr.matchAll(/[ML,]\s*[\d.]+\s*,?\s*([\d.]+)/g)).map(m => Number(m[1]));
    const yVariance = ys.length > 1 ? (Math.max(...ys) - Math.min(...ys)) : 0;
    return {
      i,
      cx: Math.round(rect.x + rect.width / 2),
      cy: Math.round(rect.y + rect.height / 2),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      yVar: Math.round(yVariance * 10) / 10,
      pts: ys.length,
    };
  });
});

charts.sort((a, b) => b.yVar - a.yVar);
console.log('ACTIVE CHARTS (top 6):');
charts.slice(0, 8).forEach(c => console.log(' ', JSON.stringify(c)));
console.log('TOTAL non-empty:', charts.filter(c => c.yVar > 5).length);

await page.screenshot({ path: 'screenshots/trend-now.png', fullPage: false });
await browser.close();
