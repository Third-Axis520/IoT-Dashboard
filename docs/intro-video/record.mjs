// ─────────────────────────────────────────────────────────────────────────────
// IoT Dashboard — 30-second intro video (v2 · 2026-06-02 重做)
// Recorder: Playwright → webm → ffmpeg minterpolate 50fps → mp4
// Storyboard: Cover → 儀表板 → 告警鈴鐺 → 趨勢 → UCL/LCL → 輪播 → Closing
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEOS_DIR = path.join(__dirname, 'videos');
if (!existsSync(VIDEOS_DIR)) mkdirSync(VIDEOS_DIR, { recursive: true });

const CONFIG = {
    APP_URL: process.env.APP_URL ?? 'http://192.168.6.23:5200/',
    WIDTH: 1920,
    HEIGHT: 1080,
    TARGET_DURATION_SEC: 30,
    OUTPUT_BASENAME: 'intro-30s',
    BRAND: {
        productName: 'IoT Dashboard',
        company: 'DIAMOND GROUP',
        tagline: '一眼看到問題 · 即時告警 · 線上調限值',
        logoUrl: '/Diamond.png',
    },
    COLORS: {
        brandDeep: '#0B4A6F',
        brandMid: '#1F8FCB',
        brandSoft: '#9ED1EB',
        alertRed: '#E04848',
        textDark: '#0F1320',
        textBody: '#2D3748',
        border: '#D6DCE5',
    },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const C = CONFIG.COLORS;

const TOP_CHROME = '';
const bottomChrome = () => '';

function sceneTitle({ kicker, title, subtitle }) {
    return `${TOP_CHROME}
    <div class="iv-title-card">
      <div class="iv-kicker">${kicker}</div>
      <div class="iv-title">${title}</div>
      <div class="iv-subtitle">${subtitle}</div>
    </div>${bottomChrome()}`;
}

function sceneLowerThird({ kicker, title, desc, accent = C.brandMid }) {
    return `${TOP_CHROME}
    <div class="iv-lower" style="--accent:${accent}">
      <div class="iv-lower-bar"></div>
      <div class="iv-lower-text">
        <div class="iv-lower-kicker">${kicker}</div>
        <div class="iv-lower-title">${title}</div>
        <div class="iv-lower-desc">${desc}</div>
      </div>
    </div>${bottomChrome()}`;
}

function sceneClosing() {
    return `${TOP_CHROME}
    <div class="iv-closing">
      <div class="iv-logo-row">
        <img src="${CONFIG.BRAND.logoUrl}" alt="" class="iv-logo" onerror="this.style.display='none'"/>
        <div>
          <div class="iv-closing-brand">${CONFIG.BRAND.company}</div>
          <div class="iv-closing-product">${CONFIG.BRAND.productName}</div>
        </div>
      </div>
      <div class="iv-closing-tagline">${CONFIG.BRAND.tagline}</div>
    </div>${bottomChrome()}`;
}

const OVERLAY_CSS = `
  #intro-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000;
    font-family: 'Inter', 'Noto Sans TC', 'Segoe UI', Arial, sans-serif; color: ${C.textDark}; }
  .iv-title-card { position: absolute; left: 56px; right: 56px; top: 26%;
    background: rgba(255,255,255,0.96); backdrop-filter: blur(16px);
    border: 1px solid ${C.border}; border-radius: 18px; padding: 52px 56px;
    box-shadow: 0 24px 60px rgba(15,19,32,0.30); animation: iv-fade-up 0.55s ease-out both; }
  .iv-kicker { color: ${C.brandMid}; font-size: 15px; letter-spacing: 0.42em; font-weight: 700; margin-bottom: 16px; }
  .iv-title { color: ${C.textDark}; font-weight: 800; font-size: 60px; line-height: 1.15; }
  .iv-subtitle { color: ${C.textBody}; font-size: 22px; margin-top: 16px; }
  .iv-lower { position: absolute; left: 56px; bottom: 80px; max-width: 720px; padding: 18px 24px;
    background: rgba(255,255,255,0.96); backdrop-filter: blur(14px); border: 1px solid ${C.border};
    border-radius: 14px; box-shadow: 0 18px 40px rgba(0,0,0,0.45); display: flex; gap: 16px;
    animation: iv-fade-up 0.45s ease-out both; }
  .iv-lower-bar { width: 4px; border-radius: 3px; background: var(--accent); align-self: stretch; }
  .iv-lower-text { display: flex; flex-direction: column; gap: 4px; }
  .iv-lower-kicker { color: var(--accent); font-size: 12px; letter-spacing: 0.32em; font-weight: 700; }
  .iv-lower-title { color: ${C.textDark}; font-size: 26px; font-weight: 800; line-height: 1.18; }
  .iv-lower-desc { color: ${C.textBody}; font-size: 14px; line-height: 1.55; max-width: 660px; }
  .iv-closing { position: absolute; left: 0; right: 0; top: 30%; text-align: center; animation: iv-fade-up 0.55s ease-out both; }
  .iv-logo-row { display: inline-flex; align-items: center; gap: 22px; }
  .iv-logo { width: 96px; height: 96px; object-fit: contain; border-radius: 18px; background: #fff; padding: 6px;
    box-shadow: 0 12px 30px rgba(0,0,0,0.35); }
  .iv-closing-brand { color: ${C.brandSoft}; font-size: 14px; letter-spacing: 0.42em; font-weight: 800; text-align: left; }
  .iv-closing-product { color: #fff; font-size: 52px; font-weight: 800; line-height: 1.1; margin-top: 6px; text-align: left; }
  .iv-closing-tagline { margin-top: 32px; color: #E2E8F0; font-size: 22px; letter-spacing: 0.06em; }
  body.iv-dim::after { content: ''; position: fixed; inset: 0; background: rgba(8,12,20,0.62);
    backdrop-filter: blur(3px); z-index: 2147482000; pointer-events: none; }
  @keyframes iv-fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  #iv-cursor { position: fixed; width: 26px; height: 26px; border-radius: 50%;
    border: 2px solid ${C.brandMid}; background: rgba(31,143,203,0.20); pointer-events: none;
    z-index: 2147483600; opacity: 0; transition: opacity 0.25s ease;
    transform: translate(-50%, -50%); box-shadow: 0 0 0 6px rgba(31,143,203,0.10); }
  #iv-cursor.on { opacity: 1; }
  .iv-callout { position: absolute; max-width: 290px; padding: 14px 18px;
    background: rgba(255,255,255,0.97); border: 2px solid var(--accent); border-radius: 12px;
    box-shadow: 0 14px 36px rgba(0,0,0,0.55); animation: iv-fade-up 0.45s ease-out both;
    font-family: 'Inter', 'Noto Sans TC', 'Segoe UI', Arial, sans-serif; }
  .iv-callout-label { color: var(--accent); font-size: 20px; font-weight: 800;
    letter-spacing: 0.04em; margin-bottom: 6px; }
  .iv-callout-desc { color: #2D3748; font-size: 14px; line-height: 1.5; }
`;

(async () => {
    const { WIDTH: W, HEIGHT: H, TARGET_DURATION_SEC, APP_URL, OUTPUT_BASENAME } = CONFIG;

    console.log(`[intro] launching chromium @ ${W}x${H}…`);
    const browser = await chromium.launch({ headless: false });
    const contextCreatedAt = Date.now();
    const context = await browser.newContext({
        viewport: { width: W, height: H }, deviceScaleFactor: 1,
        recordVideo: { dir: VIDEOS_DIR, size: { width: W, height: H } },
    });

    const page = await context.newPage();
    console.log(`[intro] opening ${APP_URL}`);
    // IoT dashboard runs SSE → never reaches networkidle; use domcontentloaded
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await sleep(4500); // let dashboard render + first SSE tick

    await page.addStyleTag({ content: OVERLAY_CSS });
    await page.evaluate(() => {
        const o = document.createElement('div'); o.id = 'intro-overlay'; document.body.appendChild(o);
        const c = document.createElement('div'); c.id = 'iv-cursor'; document.body.appendChild(c);
    });

    const setOverlay = (html, { dim = false } = {}) =>
        page.evaluate(({ html, dim }) => {
            document.getElementById('intro-overlay').innerHTML = html;
            document.body.classList.toggle('iv-dim', !!dim);
        }, { html, dim });

    const smoothMove = async (fromX, fromY, toX, toY, durationMs = 1200) => {
        await page.evaluate(async ({ fromX, fromY, toX, toY, durationMs }) => {
            const cursor = document.getElementById('iv-cursor');
            cursor.classList.add('on');
            const start = performance.now();
            await new Promise((resolve) => {
                const step = (now) => {
                    const t = Math.min(1, (now - start) / durationMs);
                    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                    const x = fromX + (toX - fromX) * e;
                    const y = fromY + (toY - fromY) * e;
                    cursor.style.left = x + 'px';
                    cursor.style.top = y + 'px';
                    if (t < 1) requestAnimationFrame(step); else resolve();
                };
                requestAnimationFrame(step);
            });
        }, { fromX, fromY, toX, toY, durationMs });
    };

    const cursorHide = async () => page.evaluate(() => document.getElementById('iv-cursor').classList.remove('on'));

    const t0 = Date.now();
    const setupOffsetMs = t0 - contextCreatedAt;
    const waitUntil = async (ms) => { const r = ms - (Date.now() - t0); if (r > 0) await sleep(r); };

    // ─────────────────────────────────────────────────────────────────────────
    // STORYBOARD — 30 seconds (v3 — boss-focused, autoplay removed)
    // 00.0 – 03.0  Cover (dim)
    // 03.0 – 08.5  儀表板 3:3 grid glance (3 pans)
    // 08.5 – 14.0  告警鈴鐺 dropdown (open + cursor sweeps alarm rows)
    // 14.0 – 22.0  趨勢分頁 (switch tab + slow scroll down 5.5s to reveal all sensors)
    // 22.0 – 28.0  UCL/LCL 限值設定 (open modal + 2 callouts annotate UCL/LCL)
    // 28.0 – 30.0  Closing (dim + brand)
    // ─────────────────────────────────────────────────────────────────────────

    // ── Scene 1: Cover ───────────────────────────────────────────────────────
    await setOverlay(sceneTitle({
        kicker: 'DIAMOND GROUP · IoT-DASHBOARD',
        title: '工廠 IoT 即時監控',
        subtitle: '一眼看到問題 · 即時告警 · 線上調限值',
    }), { dim: true });
    await waitUntil(3000);

    // ── Scene 2: 儀表板 3:3 glance ───────────────────────────────────────────
    await setOverlay(sceneLowerThird({
        kicker: 'OVERVIEW · 主控台',
        title: '一頁看完整條產線',
        desc: '高速定型 / 烘箱 / 冷凍 / 冷熱定型 / 壓底 / 線釘 — 整條 LeanA 產線設備同框,主數值 + 即時趨勢一頁覽盡。',
        accent: C.brandMid,
    }), { dim: false });
    // Z-pattern pan across 3:3 grid (avoid card 5 area where lower-third overlay sits)
    const pan = async (fromX, fromY, toX, toY, panMs, dwellMs) => {
        await smoothMove(fromX, fromY, toX, toY, panMs);
        await sleep(dwellMs);
    };
    await pan(960, 540, 320, 220, 1100, 450);   // top-left (高速定型紅色 ~59.6)
    await pan(320, 220, 1600, 220, 1100, 450);  // top-right (冷凍)
    await pan(1600, 220, 320, 700, 1300, 500);  // diagonal down to bottom-left
    await cursorHide();
    await waitUntil(8500);

    // ── Scene 3: 告警鈴鐺 dropdown ──────────────────────────────────────────
    await setOverlay(sceneLowerThird({
        kicker: 'ALERTS · 即時告警',
        title: '不用守在電腦前',
        desc: '右上鈴鐺集中所有告警,點開立刻看到誰、什麼感測器、超過多少 — 底部跑馬燈同步輪播。',
        accent: C.alertRed,
    }), { dim: false });
    await page.mouse.move(0, 0);
    await sleep(200);
    let bellCx = 1631, bellCy = 28;
    try {
        const btn = page.locator('[aria-label="告警記錄"]');
        const box = await btn.boundingBox();
        if (box) {
            bellCx = box.x + box.width / 2; bellCy = box.y + box.height / 2;
            await smoothMove(960, 540, bellCx, bellCy, 900);
            await page.mouse.click(bellCx, bellCy);
            console.log('[bell] clicked at', bellCx, bellCy);
        }
    } catch (e) { console.log('[bell-open]', e.message); }
    await sleep(1100); // ensure dropdown content fully renders
    // Sweep cursor through the alarm rows so eye is drawn to the content
    // Dropdown rows roughly at x≈1500, y stepping every ~28px starting y≈100
    await smoothMove(bellCx, bellCy, 1500, 110, 700);
    await sleep(450);
    await smoothMove(1500, 110, 1500, 170, 500);
    await sleep(450);
    await smoothMove(1500, 170, 1500, 230, 500);
    await sleep(400);
    await cursorHide();
    await waitUntil(14000);

    // Close dropdown by clicking outside (Esc doesn't close in production)
    await page.mouse.click(600, 540);
    await sleep(300);

    // ── Scene 4: 趨勢分頁 ────────────────────────────────────────────────────
    await setOverlay(sceneLowerThird({
        kicker: 'TREND · 趨勢回放',
        title: '一頁看遍所有感測點',
        desc: '每顆感測器一張迷你趨勢圖 — 越過上下限自動標紅外框,滑鼠移過去看當下值。',
        accent: C.brandMid,
    }), { dim: false });
    try {
        const trendTab = page.locator('button', { hasText: '趨勢' }).first();
        const tb = await trendTab.boundingBox();
        if (tb) {
            await smoothMove(960, 540, tb.x + tb.width / 2, tb.y + tb.height / 2, 700);
            await trendTab.click();
        }
    } catch (e) { console.log('[trend-tab]', e.message); }
    await sleep(1500); // let all charts render
    await cursorHide();
    // Slow smooth scroll down to reveal all sensors, then back to top
    await page.evaluate(async () => {
        // Find the scrollable container — try window first, fall back to inner scrollers
        let scroller = document.scrollingElement || document.documentElement;
        let target = scroller.scrollHeight - scroller.clientHeight;
        if (target <= 50) {
            const candidates = document.querySelectorAll('main, [class*="overflow-y"], [class*="overflow-auto"]');
            for (const c of candidates) {
                const t = c.scrollHeight - c.clientHeight;
                if (t > 50) { scroller = c; target = t; break; }
            }
        }
        if (target <= 50) return;
        const start = performance.now();
        const downDur = 4500;
        await new Promise((resolve) => {
            const step = (now) => {
                const t = Math.min(1, (now - start) / downDur);
                const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                scroller.scrollTop = target * e;
                if (t < 1) requestAnimationFrame(step); else resolve();
            };
            requestAnimationFrame(step);
        });
        // Brief pause at bottom
        await new Promise(r => setTimeout(r, 500));
        // Snap back to top for next scene
        scroller.scrollTop = 0;
    });
    await waitUntil(22000);

    // ── Scene 5: UCL/LCL 限值設定 + 標註 ─────────────────────────────────────
    const scene5LowerThird = sceneLowerThird({
        kicker: 'CONFIG · 上下限',
        title: 'UCL / LCL 線上設定',
        desc: '每顆感測器都能線上設定上限／下限,改了立即生效 — 不用改 code、不用重啟。',
        accent: C.brandDeep,
    });
    await setOverlay(scene5LowerThird, { dim: false });
    await page.mouse.move(0, 0);
    await sleep(200);
    try {
        const btn = page.locator('[aria-label="限值設定（UCL/LCL）"]');
        const box = await btn.boundingBox();
        if (box) {
            const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
            await smoothMove(960, 540, cx, cy, 900);
            await page.mouse.click(cx, cy);
            console.log('[limits] clicked at', cx, cy);
        }
    } catch (e) { console.log('[limits-open]', e.message); }
    await cursorHide();
    await sleep(1400); // wait for modal + data load past loading state
    // Render two callouts flanking the UCL/LCL columns (modal sits ~640-1280px wide)
    const calloutsHtml = `
        <div class="iv-callout" style="left:80px; top:230px; --accent:${C.alertRed}">
            <div class="iv-callout-label">UCL · 上限</div>
            <div class="iv-callout-desc">感測器超過此數值,系統自動標紅、推播告警。</div>
        </div>
        <div class="iv-callout" style="left:1370px; top:330px; --accent:${C.brandMid}">
            <div class="iv-callout-label">LCL · 下限</div>
            <div class="iv-callout-desc">感測器低於此數值,同樣自動標紅、推播告警。</div>
        </div>`;
    await setOverlay(calloutsHtml + scene5LowerThird, { dim: false });
    await waitUntil(28000);

    // ── Scene 6: Closing ────────────────────────────────────────────────────
    // Close modal so the closing scene fades over a clean view
    await page.keyboard.press('Escape');
    await sleep(200);
    await setOverlay(sceneClosing(), { dim: true });
    await waitUntil(TARGET_DURATION_SEC * 1000);

    console.log('[intro] timeline done — closing context to flush video…');
    await page.close();
    await context.close();
    await browser.close();

    // Pick newest webm (avoid picking up stale page@*.webm)
    const candidates = readdirSync(VIDEOS_DIR)
        .filter((f) => f.endsWith('.webm') && f !== 'intro-raw.webm')
        .map((f) => ({ f, t: statSync(path.join(VIDEOS_DIR, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
    if (!candidates.length) { console.error('[intro] no webm produced'); process.exit(1); }
    const webmPath = path.join(VIDEOS_DIR, 'intro-raw.webm');
    if (existsSync(webmPath)) rmSync(webmPath);
    renameSync(path.join(VIDEOS_DIR, candidates[0].f), webmPath);
    for (const c of candidates.slice(1)) rmSync(path.join(VIDEOS_DIR, c.f), { force: true });
    console.log(`[intro] raw → ${webmPath}`);

    const trimStartSec = (setupOffsetMs / 1000).toFixed(3);
    console.log(`[intro] trim ${trimStartSec}s (page load), duration ${TARGET_DURATION_SEC}s`);

    const runFfmpeg = (args, label) => new Promise((resolve) => {
        const ff = spawn('ffmpeg', args, { stdio: 'inherit' });
        ff.on('exit', (code) => { console.log(`[intro] ${label}: ${code === 0 ? 'ok' : 'fail'}`); resolve(code === 0); });
        ff.on('error', () => { console.log(`[intro] ${label}: ffmpeg not available`); resolve(false); });
    });
    const mp4Path = path.join(VIDEOS_DIR, `${OUTPUT_BASENAME}.mp4`);
    if (existsSync(mp4Path)) rmSync(mp4Path);

    const ok = await runFfmpeg(
        ['-y', '-ss', trimStartSec, '-i', webmPath, '-t', String(TARGET_DURATION_SEC),
         '-vf', 'minterpolate=fps=50:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,format=yuv420p',
         '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'animation',
         '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4Path],
        'mp4 (50fps interpolated, CRF 14)',
    );
    if (!ok) {
        await runFfmpeg(
            ['-y', '-ss', trimStartSec, '-i', webmPath, '-t', String(TARGET_DURATION_SEC),
             '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'animation',
             '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4Path],
            'mp4 (25fps fallback, CRF 14)',
        );
    }
    if (existsSync(mp4Path)) console.log(`[intro] → ${mp4Path}`);
})().catch((err) => { console.error(err); process.exit(1); });
