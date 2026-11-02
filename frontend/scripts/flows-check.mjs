import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE = "C:\\Users\\DADEUNK\\AppData\\Local\\Temp\\opencode\\chrome-flows";
const OUT = "C:\\Users\\DADEUNK\\AppData\\Local\\Temp\\opencode\\shots";
const PORT = 9334;
const BASE = "http://127.0.0.1:5173";
const API = "http://127.0.0.1:8000";
const ACCESS = process.env.ACCESS || "";
const REFRESH = process.env.REFRESH || "";

if (!ACCESS) throw new Error("ACCESS token missing");

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
  { stdio: "ignore" },
);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function waitForDebugger() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (res.ok) {
        const targets = await res.json();
        const page = targets.find((target) => target.type === "page");
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {
      /* not ready */
    }
    await sleep(400);
  }
  throw new Error("Chrome debugger did not start");
}

const ws = new WebSocket(await waitForDebugger());
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
    errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  }
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    errors.push(message.params.args.map((arg) => arg.value || arg.description).join(" "));
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
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || "eval failed");
  return result.result?.value;
}

async function open(path, wait = 3000) {
  await send("Page.navigate", { url: `${BASE}${path}` });
  await sleep(wait);
}

async function waitFor(expression, timeout = 15000, interval = 300) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return true;
    await sleep(interval);
  }
  return false;
}

async function waitForAsync(predicate, timeout = 15000, interval = 350) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await predicate()) return true;
    } catch {
      /* retry */
    }
    await sleep(interval);
  }
  return false;
}

async function shot(name) {
  await evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}\\${name}.png`, Buffer.from(data, "base64"));
  console.log(`shot ${name}`);
}

const clickLabel = (label) =>
  evaluate(`(() => {
    const node = [...document.querySelectorAll('button')].find((btn) => btn.getAttribute('aria-label') === ${JSON.stringify(label)});
    if (!node) return false;
    node.click();
    return true;
  })()`);

const footerText = () => evaluate("document.querySelector('footer')?.innerText || ''");

const apiGet = async (path) => {
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${ACCESS}` } });
  if (!response.ok) throw new Error(`${path} -> ${response.status}`);
  return response.json();
};

async function setReactInput(selector, value) {
  return evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
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
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

// Auth bootstrap with demo tokens.
await open("/login", 2500);
await evaluate(
  `localStorage.setItem('musicly_access', ${JSON.stringify(ACCESS)}); localStorage.setItem('musicly_refresh', ${JSON.stringify(REFRESH)});`,
);

// 1. Playback from an album.
await open("/album/137217782", 2000);
const albumReady = await waitFor(`Boolean(document.querySelector('button[aria-label^="Play "]'))`, 20000);
const albumPlay = albumReady
  ? await evaluate(`(() => {
      const btn = document.querySelector('button[aria-label^="Play "]');
      if (!btn) return false;
      btn.click();
      return true;
    })()`)
  : false;
check("album play button present", albumPlay);
const playerReady = await waitFor(
  `(() => { const text = document.querySelector('footer')?.innerText || ''; return text.trim().length > 0 && !text.includes('Pick a track'); })()`,
  15000,
);
await sleep(1200);
const footer = await footerText();
check(
  "player shows a track",
  playerReady && footer.trim().length > 0 && !footer.includes("Pick a track"),
  footer.replace(/\s+/g, " ").slice(0, 120),
);
await shot("17-desktop-playing");

// 2. Lyrics panel opens and closes from the desktop player.
const lyricsButtonReady = await waitFor(
  `Boolean(document.querySelector('footer button[aria-label="Show lyrics"]'))`,
  8000,
);
const lyricsOpened = lyricsButtonReady
  ? await evaluate(`(() => {
      const btn = document.querySelector('footer button[aria-label="Show lyrics"]');
      if (!btn) return false;
      btn.click();
      return true;
    })()`)
  : false;
const lyricsPanelOpen = await waitFor(
  `Boolean(document.querySelector('aside [aria-label="Close lyrics"]'))`,
  8000,
);
check("desktop lyrics panel opens", lyricsOpened && lyricsPanelOpen);
await shot("17b-desktop-lyrics");
const lyricsClosed = await evaluate(`(() => {
  const btn = document.querySelector('aside [aria-label="Close lyrics"]');
  if (!btn) return false;
  btn.click();
  return true;
})()`);
const lyricsPanelClosed = await waitFor(
  `!document.querySelector('aside [aria-label="Close lyrics"]')`,
  5000,
);
check("desktop lyrics panel closes", lyricsClosed && lyricsPanelClosed);

// 3. Like / unlike from the player.
const likeLabel = () =>
  evaluate(
    `document.querySelector('footer button[aria-label="Save to Liked Songs"], footer button[aria-label="Remove from Liked Songs"]')?.getAttribute('aria-label') || null`,
  );
const clickLike = (label) =>
  evaluate(`(() => {
    const btn = document.querySelector('footer button[aria-label=${JSON.stringify(label)}]');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
const likeButtonReady = await waitFor(
  `Boolean(document.querySelector('footer button[aria-label="Save to Liked Songs"], footer button[aria-label="Remove from Liked Songs"]'))`,
  12000,
);
let label = likeButtonReady ? await likeLabel() : null;
check("player like button present", Boolean(label), label || "");

// Start from an unliked track so the test is deterministic; this also cleans up
// a stray like left behind by an interrupted earlier run.
if (label === "Remove from Liked Songs") {
  await clickLike("Remove from Liked Songs");
  await waitFor(
    `Boolean(document.querySelector('footer button[aria-label="Save to Liked Songs"]'))`,
    10000,
  );
}
const baseLikes = (await apiGet("/api/likes/")).items.length;

await clickLike("Save to Liked Songs");
const likedNow = await waitFor(
  `Boolean(document.querySelector('footer button[aria-label="Remove from Liked Songs"]'))`,
  10000,
);
check("like from player", likedNow);
const likeAdded = await waitForAsync(
  async () => (await apiGet("/api/likes/")).items.length === baseLikes + 1,
  12000,
);
check("like persisted", likeAdded, `${baseLikes} -> ${baseLikes + 1}`);

await clickLike("Remove from Liked Songs");
const unlikedNow = await waitFor(
  `Boolean(document.querySelector('footer button[aria-label="Save to Liked Songs"]'))`,
  10000,
);
check("unlike from player", unlikedNow);
const likeRestored = await waitForAsync(
  async () => (await apiGet("/api/likes/")).items.length === baseLikes,
  12000,
);
const likeAfter = (await apiGet("/api/likes/")).items.length;
check("like count restored", likeRestored && likeAfter === baseLikes, `${baseLikes} -> ${likeAfter}`);

// 4. Create playlist from the library.
await open("/library", 2500);
const createReady = await waitFor(
  `Boolean([...document.querySelectorAll('button')].find((node) => node.textContent?.trim().includes('Create playlist')))`,
  15000,
);
const opened = createReady
  ? await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim().includes('Create playlist'));
      if (!btn) return false;
      btn.click();
      return true;
    })()`)
  : false;
check("open create playlist dialog", opened);
await waitFor(`Boolean(document.querySelector('input[placeholder="My playlist"]'))`, 8000);
const typed = await setReactInput('input[placeholder="My playlist"]', "QA flow playlist");
check("fill playlist name", typed);
await evaluate(`(() => {
  const form = document.querySelector('form');
  const submit = form?.querySelector('button[type="submit"]');
  if (submit) submit.click();
  return Boolean(submit);
})()`);
const playlistShown = await waitFor(
  `document.body.innerText.includes('QA flow playlist')`,
  15000,
);
check("playlist created and shown", playlistShown);
await shot("18-playlist-created");

const library = await apiGet("/api/library/");
const created = library.playlists.find((playlist) => playlist.name === "QA flow playlist");
check("playlist persisted", Boolean(created), created ? `id=${created.id}` : "missing");
if (created) {
  const response = await fetch(`${API}/api/playlists/${created.id}/`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${ACCESS}` },
  });
  check("cleanup created playlist", response.status === 204, `status=${response.status}`);
}

// 5. Follow / unfollow artist.
const followState = () =>
  evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Follow' || node.textContent?.trim() === 'Following');
    return btn?.textContent?.trim() || null;
  })()`);
const clickFollow = () =>
  evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Follow' || node.textContent?.trim() === 'Following');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
const waitFollowState = (state) =>
  waitFor(
    `Boolean([...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === ${JSON.stringify(state)}))`,
    12000,
  );

await open("/artist/11005292", 2000);
await waitFor(
  `Boolean([...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Follow' || node.textContent?.trim() === 'Following'))`,
  15000,
);
const followBefore = await followState();
check("artist follow button present", Boolean(followBefore), followBefore || "");

if (followBefore === "Following") {
  await clickFollow();
  const unfollowed = await waitFollowState("Follow");
  check("unfollow artist", unfollowed, (await followState()) || "");
  await clickFollow();
  const refollowed = await waitFollowState("Following");
  check("refollow artist", refollowed, (await followState()) || "");
} else {
  await clickFollow();
  const followed = await waitFollowState("Following");
  check("follow artist", followed, (await followState()) || "");
  await clickFollow();
  const restored = await waitFollowState("Follow");
  check("restore unfollowed state", restored, (await followState()) || "");
}

// 6. Search interaction.
await open("/search", 2500);
await waitFor(`Boolean(document.querySelector('input[placeholder="What do you want to play?"]'))`, 12000);
const searchTyped = await setReactInput('input[placeholder="What do you want to play?"]', "weeknd");
check("type in search", searchTyped);
await evaluate(`(() => {
  const input = document.querySelector('input[placeholder="What do you want to play?"]');
  if (!input) return false;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  const form = input.closest('form');
  if (form) form.requestSubmit();
  return true;
})()`);
const navigated = await waitFor(`location.search.includes('q=weeknd')`, 10000);
const searchPath = await evaluate("location.pathname + location.search");
const resultsReady = await waitFor(`document.body.innerText.includes('Blinding Lights')`, 25000);
check("search navigates with query", navigated, searchPath);
check("search shows results", resultsReady);
await shot("19-search-flow");

// 7. Mobile player flow.
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true });
await open("/album/137217782", 2000);
const mobilePlayReady = await waitFor(`Boolean(document.querySelector('button[aria-label^="Play "]'))`, 20000);
const mobilePlay = mobilePlayReady
  ? await evaluate(`(() => {
      const btn = document.querySelector('button[aria-label^="Play "]');
      if (btn) btn.click();
      return Boolean(btn);
    })()`)
  : false;
check("mobile start playback", mobilePlay);
const mini = await waitFor(
  `Boolean([...document.querySelectorAll('button')].find((btn) => btn.getAttribute('aria-label') === 'Open now playing'))`,
  15000,
);
check("mobile mini player visible", mini);
const openedMobile = mini
  ? await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find((node) => node.getAttribute('aria-label') === 'Open now playing');
      if (!btn) return false;
      btn.click();
      return true;
    })()`)
  : false;
const full = await waitFor(
  `Boolean([...document.querySelectorAll('button')].find((btn) => btn.getAttribute('aria-label') === 'Close player'))`,
  10000,
);
check("mobile full player opens", openedMobile && full);
const beforeNext = await evaluate("document.body.innerText");
await shot("20-mobile-playing");
const mobileLyricsReady = await waitFor(
  `Boolean([...document.querySelectorAll('button')].find((btn) => btn.getAttribute('aria-label') === 'Show lyrics'))`,
  8000,
);
const mobileLyricsOpened = mobileLyricsReady
  ? await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find((node) => node.getAttribute('aria-label') === 'Show lyrics');
      if (!btn) return false;
      btn.click();
      return true;
    })()`)
  : false;
const mobileLyricsOpen = await waitFor(
  `Boolean(document.querySelector('aside [aria-label="Close lyrics"]'))`,
  8000,
);
check("mobile lyrics panel opens", mobileLyricsOpened && mobileLyricsOpen);
await shot("20b-mobile-lyrics");
const mobileLyricsClosed = await evaluate(`(() => {
  const btn = document.querySelector('aside [aria-label="Close lyrics"]');
  if (!btn) return false;
  btn.click();
  return true;
})()`);
const mobileLyricsGone = await waitFor(
  `!document.querySelector('aside [aria-label="Close lyrics"]')`,
  5000,
);
check("mobile lyrics panel closes", mobileLyricsClosed && mobileLyricsGone);
const nextClicked = await evaluate(`(() => {
  const btn = [...document.querySelectorAll('button')].find((node) => node.getAttribute('aria-label') === 'Next');
  if (!btn) return false;
  btn.click();
  return true;
})()`);
const trackChanged = await waitFor(`document.body.innerText !== ${JSON.stringify(beforeNext)}`, 15000);
check("mobile next track", nextClicked && trackChanged);
const closed = await evaluate(`(() => {
  const btn = [...document.querySelectorAll('button')].find((node) => node.getAttribute('aria-label') === 'Close player');
  if (!btn) return false;
  btn.click();
  return true;
})()`);
const closedNow = await waitFor(
  `!Boolean([...document.querySelectorAll('button')].find((btn) => btn.getAttribute('aria-label') === 'Close player'))`,
  8000,
);
check("mobile player closes", closed && closedNow);

console.log("ERRORS:", errors.length);
for (const error of errors.slice(0, 10)) console.log("ERR", error);
const failed = results.filter((result) => !result.ok);
console.log(`SUMMARY ${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log("FAILED:", failed.map((result) => result.name).join(", "));

ws.close();
chrome.kill("SIGKILL");
process.exit(failed.length ? 1 : 0);
