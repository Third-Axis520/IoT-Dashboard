import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
await page.goto('http://192.168.6.23:5200/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4500);

console.log('-- dashboard view --');
const b1 = await page.locator('[aria-label="限值設定（UCL/LCL）"]').boundingBox();
console.log('限值 button:', b1);
const c1 = await page.locator('[aria-label="限值設定（UCL/LCL）"]').count();
console.log('count:', c1);

// Switch to trend
await page.locator('button', { hasText: '趨勢' }).first().click();
await page.waitForTimeout(2500);

console.log('-- trend view --');
const b2 = await page.locator('[aria-label="限值設定（UCL/LCL）"]').boundingBox();
console.log('限值 button:', b2);
const c2 = await page.locator('[aria-label="限值設定（UCL/LCL）"]').count();
console.log('count:', c2);
const visible = await page.locator('[aria-label="限值設定（UCL/LCL）"]').isVisible().catch(() => false);
console.log('visible:', visible);

// Also count Start auto-play in trend view
const playCount = await page.locator('[aria-label="Start auto-play"]').count();
console.log('autoplay button count:', playCount);
const playBox = await page.locator('[aria-label="Start auto-play"]').boundingBox().catch(() => null);
console.log('autoplay box:', playBox);

await browser.close();
