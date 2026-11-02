import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE = "C:\\Users\\DADEUNK\\AppData\\Local\\Temp\\opencode\\chrome-cdp";
const OUT = "C:\\Users\\DADEUNK\\AppData\\Local\\Temp\\opencode\\shots";
const PORT = 9333;
const BASE = "http://127.0.0.1:5173";
const ACCESS = process.env.ACCESS || "";
const REFRESH = process.env.REFRESH || "";

rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--mute-audio",
    "--autoplay-policy=no-user-gesture-required",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--window-size=1440,950",
    "about:blank",
  ],
  { stdio: "ignore", detached: false },
);

async function waitForDebugger() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (res.ok) {
        const targets = await res.json();
        const page = targets.find((t) => t.type === "page");
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error("Chrome debugger did not start");
}

const wsUrl = await waitForDebugger();
const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let msgId = 0;
const pending = new Map();
const errors = [];

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
    return;
  }
  if (message.method === "Runtime.exceptionThrown") {
    const d = message.params.exceptionDetails;
    errors.push(`EXCEPTION: ${d.exception?.description || d.text}`);
  }
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    errors.push(`CONSOLE: ${message.params.args.map((a) => a.value || a.description).join(" ")}`);
  }
};

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || "eval failed");
  }
  return result.result?.value;
}

async function goto(path, wait = 3800) {
  await send("Page.navigate", { url: `${BASE}${path}` });
  await sleep(wait);
}

async function waitFor(expression, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return true;
    await sleep(350);
  }
  return false;
}

const SPOTLIGHT_HEADING =
  "[...document.querySelectorAll('h2')].some((node) => node.textContent?.includes('Alt & indie essentials'))";

async function scrollToHeading(text) {
  return evaluate(`(() => {
    const heading = [...document.querySelectorAll('h2')].find((node) => node.textContent?.includes(${JSON.stringify(text)}));
    if (!heading) return false;
    heading.scrollIntoView({ block: 'center' });
    return true;
  })()`);
}

async function shot(name) {
  await evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}\\${name}.png`, Buffer.from(data, "base64"));
  console.log(`shot ${name}`);
}

async function viewport(width, height, mobile = false) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
}

await send("Page.enable");
await send("Runtime.enable");
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    window.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '*,*::before,*::after{animation:none !important;transition:none !important;}';
      document.head.appendChild(style);
    });
  `,
});

// ---- Guest ----
await viewport(1440, 950);
await goto("/", 1000);
let guestReady = await waitFor("document.querySelectorAll('h2').length >= 3", 45000);
if (!guestReady) {
  await send("Page.reload", { ignoreCache: false });
  guestReady = await waitFor("document.querySelectorAll('h2').length >= 3", 45000);
}
console.log("guest home ready", guestReady);
await sleep(700);
await shot("01-home-guest");
console.log(
  "guest home:",
  await evaluate(`JSON.stringify({
    path: location.pathname,
    rootChildren: document.getElementById('root')?.children.length,
    mainText: (document.querySelector('main')?.innerText || '').slice(0, 160),
    bodyText: document.body.innerText.slice(0, 160),
    bg: getComputedStyle(document.body).backgroundColor,
  })`),
);
const guestSpotlight = await waitFor(SPOTLIGHT_HEADING, 30000);
console.log("guest spotlight found", guestSpotlight);
if (guestSpotlight) {
  await scrollToHeading("Alt & indie essentials");
  await sleep(900);
}
await shot("01c-guest-spotlight");
await goto("/search", 3000);
await shot("02-search-browse");
await goto("/search?q=weeknd", 5000);
await shot("03-search-query");
await goto("/login", 2500);
await shot("04-login");

const ids = await evaluate(`(async () => {
  const album = await (await fetch('http://127.0.0.1:8000/api/search/?q=after+hours&type=album&limit=3')).json();
  const artist = await (await fetch('http://127.0.0.1:8000/api/search/?q=weeknd&type=artist&limit=3')).json();
  return {
    album: album.items?.[0]?.id || 'null',
    artist: artist.items?.[0]?.id || 'null',
  };
})()`);
console.log("ids", ids);

if (ids.album && ids.album !== "null") {
  await goto(`/album/${ids.album}`, 4500);
  await shot("05-album");
}
if (ids.artist && ids.artist !== "null") {
  await goto(`/artist/${ids.artist}`, 4500);
  await shot("06-artist");
}

// ---- Authenticated ----
if (ACCESS) {
  // Prime the tokens before the app boots so RequireAuth does not flash a
  // splash screen while the screenshots are being taken.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try {
      localStorage.setItem('musicly_access', ${JSON.stringify(ACCESS)});
      localStorage.setItem('musicly_refresh', ${JSON.stringify(REFRESH)});
    } catch (error) {}`,
  });
  await goto("/", 1000);
  const authReady = await waitFor("document.body.innerText.includes('Demo Listener')", 45000);
  const authSpotlight = await waitFor(SPOTLIGHT_HEADING, 30000);
  console.log("auth ready", authReady, "auth spotlight found", authSpotlight);
  await sleep(700);
  await shot("07-home-auth");
  if (authSpotlight) {
    await scrollToHeading("Alt & indie essentials");
    await sleep(900);
  }
  await shot("07b-home-spotlight");
  await evaluate("(() => { const main = document.querySelector('main'); if (main) main.scrollTop = 0; })()");
  await goto("/library", 800);
  const libraryReady = await waitFor(
    "document.body.innerText.includes('Create playlist') || document.body.innerText.includes('Playlists')",
    30000,
  );
  console.log("library ready", libraryReady);
  await sleep(500);
  await shot("08-library");
  await goto("/dashboard", 800);
  const dashboardReady = await waitFor("document.body.innerText.includes('Listening activity')", 30000);
  console.log("dashboard ready", dashboardReady);
  await sleep(700);
  await shot("09-dashboard");
  await evaluate("(() => { const main = document.querySelector('main'); if (main) main.scrollTop = 780; })()");
  await sleep(900);
  await shot("09b-dashboard-lower");
  await evaluate("(() => { const main = document.querySelector('main'); if (main) main.scrollTop = 0; })()");

  const data = await evaluate(`(async () => {
    const res = await fetch('http://127.0.0.1:8000/api/library/', { headers: { Authorization: 'Bearer ' + localStorage.getItem('musicly_access') } });
    const lib = await res.json();
    return {
      playlist: lib.playlists?.[0]?.id || null,
      alt: lib.playlists?.find((item) => item.name === 'Alt & indie essentials')?.id || null,
    };
  })()`);
  if (data.playlist) {
    await goto(`/playlist/${data.playlist}`, 800);
    await waitFor("document.querySelectorAll('main img').length > 3", 25000);
    await sleep(500);
    await shot("10-playlist");
  }
  if (data.alt) {
    await goto(`/playlist/${data.alt}`, 800);
    await waitFor("document.querySelectorAll('main img').length > 3", 25000);
    await sleep(500);
    await shot("10b-spotlight-playlist");
  }
  await goto("/liked", 800);
  await waitFor("document.body.innerText.includes('Liked Songs')", 25000);
  await sleep(600);
  await shot("11-liked");
  await goto("/profile", 800);
  await waitFor("document.body.innerText.includes('Edit profile')", 25000);
  await sleep(500);
  await shot("12-profile");

  // Mobile
  await viewport(390, 844, true);
  await goto("/", 800);
  await waitFor("document.querySelectorAll('h2').length >= 3", 45000);
  await sleep(600);
  await shot("13-mobile-home");
  await goto("/dashboard", 800);
  await waitFor("document.body.innerText.includes('Listening activity')", 30000);
  await sleep(600);
  await shot("14-mobile-dashboard");

  // Start playback from home and capture mini player + expanded mobile player.
  await goto("/", 800);
  await waitFor(`Boolean(document.querySelector('button[aria-label^="Play "]'))`, 30000);
  const started = await evaluate(`(() => {
    const btn = document.querySelector('button[aria-label^="Play "]');
    if (btn) btn.click();
    return Boolean(btn);
  })()`);
  console.log("play clicked", started);
  const miniReady = await waitFor(
    `Boolean([...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Open now playing'))`,
    20000,
  );
  await shot("15-mobile-player-mini");
  const opened = miniReady
    ? await evaluate(`(() => {
        const open = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Open now playing');
        if (open) open.click();
        return Boolean(open);
      })()`)
    : false;
  console.log("player opened", opened);
  await waitFor(
    `Boolean([...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Close player'))`,
    10000,
  );
  await sleep(600);
  await shot("16-mobile-player-full");
}

console.log("ERRORS:", errors.length);
for (const error of errors.slice(0, 20)) console.log(error);
ws.close();
chrome.kill("SIGKILL");
process.exit(0);
