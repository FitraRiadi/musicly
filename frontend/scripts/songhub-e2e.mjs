import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = "C:\\Users\\DADEUNK\\AppData\\Local\\Temp\\opencode\\songhub-shots";
const BASE = "http://127.0.0.1:5174";
const API = "http://127.0.0.1:8001/api";
const PASSWORD = "SmokePass123!";
const PROBE = "smoke_hub_probe";

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 500)}`);
  }
  return data;
}

async function waitForInvitation(code, token, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const data = await api("/songhub/invitations/", { token });
      if ((data.items || []).some((item) => item.room?.code === code)) return true;
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  return false;
}

async function rawJoin(code, token, password) {
  const response = await fetch(`${API}/songhub/rooms/${code}/join/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(password ? { password } : {}),
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}

async function login(username) {
  return api("/auth/login/", {
    method: "POST",
    body: { username, password: PASSWORD },
  });
}

class Browser {
  constructor(label, port) {
    this.label = label;
    this.port = port;
    this.profile = `C:\\Users\\DADEUNK\\AppData\\Local\\Temp\\opencode\\chrome-songhub-${label}`;
    this.errors = [];
    this.msgId = 0;
    this.pending = new Map();
  }

  async start() {
    rmSync(this.profile, { recursive: true, force: true });
    this.chrome = spawn(
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
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--remote-debugging-port=${this.port}`,
        `--user-data-dir=${this.profile}`,
        "--window-size=1440,950",
        "about:blank",
      ],
      { stdio: "ignore", windowsHide: true },
    );

    let target = null;
    for (let i = 0; i < 80; i += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${this.port}/json/list`);
        if (response.ok) {
          const targets = await response.json();
          target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
          if (target) break;
        }
      } catch {
        /* starting */
      }
      await sleep(300);
    }
    if (!target) throw new Error(`${this.label}: Chrome debugger did not start`);

    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
        return;
      }
      if (message.method === "Runtime.exceptionThrown") {
        this.errors.push(
          message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text,
        );
      }
      if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
        this.errors.push(message.params.args.map((arg) => arg.value || arg.description).join(" "));
      }
    };

    await this.send("Page.enable");
    await this.send("Runtime.enable");
    try {
      await this.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    } catch {
      /* older Chrome builds may not support focus emulation */
    }
    await this.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        window.__pcs = [];
        if (window.RTCPeerConnection) {
          const Original = window.RTCPeerConnection;
          window.RTCPeerConnection = new Proxy(Original, {
            construct(target, args) {
              const pc = Reflect.construct(target, args);
              window.__pcs.push(pc);
              return pc;
            },
          });
        }
        window.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = '*,*::before,*::after{animation:none !important;transition:none !important;}';
          document.head.appendChild(style);
        });
      `,
    });
    await this.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 950,
      deviceScaleFactor: 1,
      mobile: false,
    });
    try {
      const version = await fetch(`http://127.0.0.1:${this.port}/json/version`).then((response) => response.json());
      const browserWs = new WebSocket(version.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        browserWs.onopen = resolve;
        browserWs.onerror = reject;
      });
      await new Promise((resolve) => {
        browserWs.onmessage = (event) => {
          const message = JSON.parse(event.data);
          if (message.id === 1) resolve();
        };
        browserWs.send(JSON.stringify({
          id: 1,
          method: "Browser.grantPermissions",
          params: {
            origin: BASE,
            permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
          },
        }));
        setTimeout(resolve, 2000);
      });
      browserWs.close();
    } catch {
      /* clipboard grant is optional */
    }
  }

  send(method, params = {}) {
    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || "evaluate failed");
    }
    return result.result?.value;
  }

  async open(path, wait = 1800) {
    await this.send("Page.navigate", { url: `${BASE}${path}` });
    await sleep(wait);
  }

  async waitFor(expression, timeout = 20000, interval = 300) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (await this.eval(expression)) return true;
      } catch {
        /* retry */
      }
      await sleep(interval);
    }
    return false;
  }

  async waitForText(text, timeout = 20000) {
    return this.waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`, timeout);
  }

  async waitForTextCI(text, timeout = 20000) {
    return this.waitFor(
      `document.body.innerText.toLowerCase().includes(${JSON.stringify(text.toLowerCase())})`,
      timeout,
    );
  }

  async typePlaceholder(prefix, value) {
    const focused = await this.eval(`(() => {
      const input = [...document.querySelectorAll('input,textarea')].find((item) => {
        const placeholder = item.getAttribute('placeholder') || '';
        return placeholder.startsWith(${JSON.stringify(prefix)});
      });
      if (!input) return false;
      input.focus();
      input.select?.();
      return true;
    })()`);
    if (!focused) return false;
    await this.send("Input.insertText", { text: value });
    return true;
  }

  async typeDialogPlaceholder(prefix, value) {
    const focused = await this.eval(`(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const input = [...dialog.querySelectorAll('input,textarea')].find((item) => {
        const placeholder = item.getAttribute('placeholder') || '';
        return placeholder.startsWith(${JSON.stringify(prefix)});
      });
      if (!input) return false;
      input.focus();
      input.select?.();
      return true;
    })()`);
    if (!focused) return false;
    await this.send("Input.insertText", { text: value });
    return true;
  }

  async bodyText() {
    return this.eval("document.body.innerText");
  }

  async clickText(text, { exact = true, selector = "button,a,[role=button]" } = {}) {
    return this.eval(`(() => {
      const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const node = nodes.find((item) => {
        if (item.offsetParent === null) return false;
        const value = (item.innerText || '').trim();
        return ${exact ? `value === ${JSON.stringify(text)}` : `value.includes(${JSON.stringify(text)})`};
      });
      if (!node) return false;
      node.click();
      return true;
    })()`);
  }

  async clickTextReal(text, { exact = true, selector = "button,a,[role=button]" } = {}) {
    const point = await this.eval(`(() => {
      const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const node = nodes.find((item) => {
        if (item.offsetParent === null) return false;
        const value = (item.innerText || '').trim();
        return ${exact ? `value === ${JSON.stringify(text)}` : `value.includes(${JSON.stringify(text)})`};
      });
      if (!node) return null;
      node.scrollIntoView({ block: 'center' });
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    if (!point) return false;
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: point.x,
      y: point.y,
    });
    await this.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: point.x,
      y: point.y,
      button: "left",
      clickCount: 1,
    });
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: point.x,
      y: point.y,
      button: "left",
      clickCount: 1,
    });
    return true;
  }

  async clickAria(label) {
    const selector = `button[aria-label=${JSON.stringify(label)}]`;
    return this.eval(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node || node.disabled) return false;
      node.click();
      return true;
    })()`);
  }

  async fill(selector, value) {
    return this.eval(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) return false;
      const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
  }

  async fillTyped(selector, value) {
    const focused = await this.eval(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) return false;
      input.focus();
      input.select?.();
      return true;
    })()`);
    if (!focused) return false;
    await this.send("Input.insertText", { text: value });
    return true;
  }

  async fillPlaceholder(prefix, value) {
    return this.eval(`(() => {
      const input = [...document.querySelectorAll('input,textarea')].find((item) => {
        const placeholder = item.getAttribute('placeholder') || '';
        return placeholder.startsWith(${JSON.stringify(prefix)});
      });
      if (!input) return false;
      const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
  }

  async pressEscape() {
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  }

  async shot(name) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${OUT}\\${name}.png`, Buffer.from(data, "base64"));
  }

  async auth(user) {
    await this.open("/login", 1200);
    await this.eval(`(() => {
      localStorage.clear();
      localStorage.setItem('musicly_access', ${JSON.stringify(user.access)});
      localStorage.setItem('musicly_refresh', ${JSON.stringify(user.refresh)});
      localStorage.setItem('musicly_user', ${JSON.stringify(JSON.stringify(user.user))});
    })()`);
    await this.open("/song-hub", 2200);
  }

  async stop() {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    if (this.chrome?.pid) {
      spawnSync("taskkill", ["/PID", String(this.chrome.pid), "/T", "/F"], { stdio: "ignore" });
    }
    // Chrome on Windows can relaunch itself, leaving the original PID stale.
    // Kill every process still using this test profile so early stops never
    // leave a browser polling the API in the background.
    if (process.platform === "win32") {
      const profile = this.profile.replace(/'/g, "''");
      spawnSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${profile}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
        ],
        { stdio: "ignore" },
      );
    }
  }
}

function chatTextScript() {
  return `(() => {
    const section = [...document.querySelectorAll('section')].find((item) => item.innerText.includes('Room chat'));
    return section?.innerText || '';
  })()`;
}

async function clickRoomJoin(browser, roomName) {
  return browser.eval(`(() => {
    const name = ${JSON.stringify(roomName)};
    const cards = [...document.querySelectorAll('div')].filter((card) => {
      if (!card.innerText.includes(name)) return false;
      return [...card.querySelectorAll('button')].some((button) => button.innerText.trim() === 'Join');
    });
    cards.sort((a, b) => a.innerText.length - b.innerText.length);
    const card = cards[0];
    if (!card) return false;
    const button = [...card.querySelectorAll('button')].find((item) => item.innerText.trim() === 'Join');
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

async function clickInvitationJoin(browser, roomName) {
  return browser.eval(`(() => {
    const name = ${JSON.stringify(roomName)};
    const cards = [...document.querySelectorAll('div')].filter((card) => {
      if (!card.innerText.includes(name) || !card.innerText.includes('Invited by')) return false;
      return [...card.querySelectorAll('button')].some((button) => button.innerText.trim() === 'Join');
    });
    cards.sort((a, b) => a.innerText.length - b.innerText.length);
    const card = cards[0];
    if (!card) return false;
    const button = [...card.querySelectorAll('button')].find((item) => item.innerText.trim() === 'Join');
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

async function clickRequestPlay(browser, trackTitle) {
  return browser.eval(`(() => {
    const title = ${JSON.stringify(trackTitle)};
    const cards = [...document.querySelectorAll('div')].filter((card) => {
      if (!card.innerText.includes(title)) return false;
      return [...card.querySelectorAll('button')].some((button) => button.innerText.trim() === 'Play');
    });
    cards.sort((a, b) => a.innerText.length - b.innerText.length);
    const card = cards[0];
    if (!card) return false;
    const button = [...card.querySelectorAll('button')].find((item) => item.innerText.trim() === 'Play');
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

async function clickFriendInvite(browser, username) {
  const clicked = await browser.eval(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return false;
    const rows = [...dialog.querySelectorAll('div')].filter((row) => {
      if (!row.innerText.includes(${JSON.stringify(username)})) return false;
      return [...row.querySelectorAll('button')].some((button) => button.innerText.trim() === 'Invite');
    });
    rows.sort((a, b) => a.innerText.length - b.innerText.length);
    for (const row of rows) {
      const button = [...row.querySelectorAll('button')].find((item) => item.innerText.trim() === 'Invite');
      if (button && !button.disabled) {
        button.click();
        return true;
      }
    }
    return false;
  })()`);
  if (!clicked) return false;
  return true;
}

async function clickMemberAction(browser, username, action) {
  return browser.eval(`(() => {
    const label = ${JSON.stringify(action)};
    const rows = [...document.querySelectorAll('div')].filter((row) => {
      if (!row.innerText.includes(${JSON.stringify(username)})) return false;
      return [...row.querySelectorAll('button')].some((button) => button.innerText.trim() === label);
    });
    rows.sort((a, b) => a.innerText.length - b.innerText.length);
    for (const row of rows) {
      const button = [...row.querySelectorAll('button')].find((item) => item.innerText.trim() === label);
      if (button && !button.disabled) {
        button.click();
        return true;
      }
    }
    return false;
  })()`);
}

async function clickDialogTrack(browser, title, artist) {
  return browser.eval(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return false;
    const buttons = [...dialog.querySelectorAll('button')];
    const button = buttons.find((item) => {
      const text = item.innerText || '';
      return text.includes(${JSON.stringify(title)}) && text.includes(${JSON.stringify(artist)});
    });
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

async function main() {
  // Prepare accounts and friendship for the in-app invite flow.
  const A = await login("smoke_a");
  const B = await login("smoke_b");
  const C = await login(PROBE);

  await api("/auth/friends/requests/", {
    token: C.access,
    method: "POST",
    body: { username: "smoke_a" },
  });
  const friendList = await api("/auth/friends/", { token: A.access });
  if (!friendList.friends.some((friend) => friend.username === PROBE)) {
    const requests = await api("/auth/friends/", { token: A.access });
    for (const request of requests.incoming) {
      if (request.user?.username === PROBE || request.requester?.username === PROBE) {
        await api(`/auth/friends/requests/${request.id}/accept/`, { token: A.access, method: "POST" });
      }
    }
  }
  const finalFriends = await api("/auth/friends/", { token: A.access });
  check(
    "probe account is a friend of the host",
    finalFriends.friends.some((friend) => friend.username === PROBE),
  );

  // Clear any stale rooms and invites from previous runs.
  for (const account of [A, B, C]) {
    const lobby = await api("/songhub/rooms/", { token: account.access });
    if (lobby.my_room) {
      await api(`/songhub/rooms/${lobby.my_room.code}/leave/`, { token: account.access, method: "POST" });
    }
    const invites = await api("/songhub/invitations/", { token: account.access });
    for (const invite of invites.items) {
      await api(`/songhub/invitations/${invite.id}/decline/`, { token: account.access, method: "POST" });
    }
  }

  const aBrowser = new Browser("host", 9341);
  const bBrowser = new Browser("member", 9342);
  const cBrowser = new Browser("probe", 9343);

  try {
    await aBrowser.start();
    await bBrowser.start();
    await cBrowser.start();
    await Promise.all([aBrowser.auth(A), bBrowser.auth(B), cBrowser.auth(C)]);

    check(
      "Song Hub nav is visible",
      (await aBrowser.waitForText("Song Hub")) && (await bBrowser.waitForText("Song Hub")),
    );

    // Host creates a public room through the UI.
    await aBrowser.fill("#hub-name", "E2E Listening Room");
    await aBrowser.clickText("Open Song Hub");
    const hostInRoom = await aBrowser.waitFor(`location.pathname.startsWith('/song-hub/')`, 15000);
    const publicCode = await aBrowser.eval("location.pathname.split('/').pop()");
    check("host creates a public room", hostInRoom && Boolean(publicCode), publicCode);
    check(
      "host room shows host controls",
      (await aBrowser.waitForTextCI("You control the room")) &&
        (await aBrowser.waitForText(`Hosting · ${publicCode}`)),
    );

    await aBrowser.send("Page.bringToFront");
    const copyClicked = await aBrowser.clickTextReal("Copy link");
    const copyToast = await aBrowser.waitForText("Room link copied.", 6000);
    check("host copies the invite link", copyClicked && copyToast, JSON.stringify({ copyClicked, copyToast, copy: await aBrowser.eval("navigator.clipboard?.readText?.().catch((error) => 'ERR:' + error.message)") }));

    const inviteOpened = await aBrowser.clickText("Invite");
    const inviteDialog = await aBrowser.waitForText("Invite friends", 8000);
    const inviteLinkShown = await aBrowser.waitForText(`/song-hub/${publicCode}`, 8000);
    check("invite dialog shows the room link", inviteOpened && inviteDialog && inviteLinkShown);
    await aBrowser.pressEscape();
    await sleep(500);

    // Host plays a song from the room picker.
    await aBrowser.clickText("Play a song");
    const pickerOpen = await aBrowser.waitForText("Play a song in the room", 8000);
    await aBrowser.typeDialogPlaceholder("Search songs", "Perfect");
    const pickerSearchValue = await aBrowser.eval(`(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const input = dialog?.querySelector('input');
      return input?.value || null;
    })()`);
    const pickerResults = await aBrowser.waitFor(
      `(() => {
        const dialog = document.querySelector('[role="dialog"]');
        return Boolean(dialog && dialog.innerText.includes('Perfect') && dialog.innerText.includes('Ed Sheeran'));
      })()`,
      25000,
    );
    const pickerDialogText = await aBrowser.eval(`document.querySelector('[role="dialog"]')?.innerText.slice(0, 500) || null`);
    const picked = await clickDialogTrack(aBrowser, "Perfect", "Ed Sheeran");
    const hostTrack = await aBrowser.waitFor(
      `(() => [...document.querySelectorAll('h2')].some((heading) => heading.innerText.trim() === 'Perfect'))()`,
      15000,
    );
    check("host picks the first room track", pickerOpen && pickerResults && picked && hostTrack, JSON.stringify({ pickerOpen, pickerSearchValue, pickerResults, picked, hostTrack, dialog: pickerDialogText }));

    // Member discovers the room in the lobby and joins it.
    await bBrowser.open("/song-hub", 2200);
    const lobbySeesRoom = await bBrowser.waitForText("E2E Listening Room", 15000);
    const joinedFromLobby = await clickRoomJoin(bBrowser, "E2E Listening Room");
    const memberInRoom = await bBrowser.waitFor(
      `location.pathname === ${JSON.stringify(`/song-hub/${publicCode}`)}`,
      15000,
    );
    const memberSynced = await bBrowser.waitForTextCI("Synced with the host", 15000);
    check("member joins from the public lobby", lobbySeesRoom && joinedFromLobby && memberInRoom && memberSynced);

    await bBrowser.waitForText("Perfect", 15000);
    check(
      "member shows listen-only and room indicator",
      (await bBrowser.waitForText("Listen-only")) &&
        (await bBrowser.waitForText(`Listening · ${publicCode}`)),
    );
    const memberLocked = await bBrowser.eval(`(() => {
      const footer = document.querySelector('footer');
      const pause = footer?.querySelector('button[aria-label="Pause"]');
      const seek = document.querySelector('input[aria-label="Room playback position"]');
      return Boolean(pause?.disabled && seek?.disabled && footer?.innerText.includes('Listen-only'));
    })()`);
    check("member player controls are locked", memberLocked);

    const hostUnlocked = await aBrowser.eval(`(() => {
      const footer = document.querySelector('footer');
      const pause = footer?.querySelector('button[aria-label="Pause"]');
      return Boolean(pause && !pause.disabled);
    })()`);
    check("host player controls remain enabled", hostUnlocked);

    // Mobile navigation indicates that the member is in a room.
    await bBrowser.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await sleep(800);
    const mobileIndicator = await bBrowser.eval(`(() => {
      const nav = [...document.querySelectorAll('nav')].find((item) => item.innerText.includes('Home') && item.innerText.includes('Hub'));
      return Boolean(nav && nav.innerText.includes('Hub') && nav.querySelector('.animate-pulse'));
    })()`);
    check("mobile nav shows the live room indicator", mobileIndicator);
    await bBrowser.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 950,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // Member selects a track outside the room and gets the request popup.
    await bBrowser.open("/playlist/29", 2200);
    const playlistReady = await bBrowser.waitForText("Prefetch Test 2", 15000);
    const playlistHydrated = await bBrowser.waitForText(`Listening · ${publicCode}`, 20000);
    const requestClicked = await bBrowser.clickAria("Request Prefetch Test 2");
    const requestPopup = await bBrowser.waitForText("Request this song?", 8000);
    const requestLockedCopy = await bBrowser.waitForText("Members can't change the room playback", 8000);
    check("member gets the request popup from a track list", playlistReady && playlistHydrated && requestClicked && requestPopup && requestLockedCopy);

    const requestSent = await bBrowser.clickText("Send request");
    const requestToast = await bBrowser.waitForText("Request sent: Prefetch Test 2", 8000);
    check("member sends the request", requestSent && requestToast);

    // Host sees and accepts the request.
    const hostRequest = await aBrowser.waitForText("Decline", 20000);
    const accepted = await clickRequestPlay(aBrowser, "Prefetch Test 2");
    const hostAdvanced = await aBrowser.waitFor(
      `(() => {
        const heading = [...document.querySelectorAll('h2')].find((item) => item.innerText.includes('Prefetch Test 2'));
        return Boolean(heading);
      })()`,
      15000,
    );
    check("host accepts the member request", hostRequest && accepted && hostAdvanced);

    await bBrowser.open(`/song-hub/${publicCode}`, 2200);
    const memberAdvanced = await bBrowser.waitForText("Prefetch Test 2", 20000);
    check("member playback follows the accepted request", memberAdvanced);

    // Chat and stickers.
    const memberMessage = `Hello from member UI ${Date.now()}`;
    await bBrowser.fillPlaceholder("Message the room", memberMessage);
    await sleep(250);
    const memberSent = await bBrowser.clickAria("Send message");
    const hostSawMessage = await aBrowser.waitForText(memberMessage, 15000);
    check("member chat reaches the host", memberSent && hostSawMessage);

    const hostMessage = `Host reply ${Date.now()}`;
    await aBrowser.fillPlaceholder("Message the room", hostMessage);
    await sleep(250);
    const hostSent = await aBrowser.clickAria("Send message");
    const memberSawMessage = await bBrowser.waitForText(hostMessage, 15000);
    check("host chat reaches the member", hostSent && memberSawMessage);

    await bBrowser.clickAria("Open stickers");
    const stickerClicked = await bBrowser.clickText("🔥");
    const hostSawSticker = await aBrowser.waitFor(
      `${chatTextScript()}.includes('🔥')`,
      15000,
    );
    check("member sends a sticker", stickerClicked && hostSawSticker);

    // Reaction reaches the room state through the UI.
    const reactionClicked = await bBrowser.clickText("FIRE", { exact: false });
    await sleep(1800);
    const reactionState = await api(`/songhub/rooms/${publicCode}/state/`, { token: A.access });
    const memberFired = reactionState.reactions.some(
      (row) => row.emoji === "fire" && row.user?.id === B.user.id,
    );
    check("member fire reaction reaches the room", reactionClicked && memberFired);

    // Mic state and the WebRTC mesh.
    await bBrowser.eval(`(() => {
      const button = document.querySelector('button[title="Turn microphone on"]');
      if (button) button.click();
      return Boolean(button);
    })()`);
    const memberMicOn = await bBrowser.waitFor(
      `(() => {
        const button = document.querySelector('button[title="Turn microphone off"]');
        return Boolean(button);
      })()`,
      15000,
    );
    const hostSeesMemberMic = await aBrowser.waitForText("mic live", 20000);
    check("member microphone turns on", memberMicOn && hostSeesMemberMic);

    await aBrowser.eval(`(() => {
      const button = document.querySelector('button[title="Turn microphone on"]');
      if (button) button.click();
      return Boolean(button);
    })()`);
    const hostMicOn = await aBrowser.waitFor(
      `(() => Boolean(document.querySelector('button[title="Turn microphone off"]')))()`,
      15000,
    );
    const memberSeesHostMic = await bBrowser.waitForText("mic live", 20000);
    check("host microphone turns on", hostMicOn && memberSeesHostMic);

    const meshReady = await Promise.all([
      aBrowser.waitFor(
        `(window.__pcs || []).some((pc) => ['connected', 'completed'].includes(pc.connectionState) || ['connected', 'completed'].includes(pc.iceConnectionState))`,
        40000,
      ),
      bBrowser.waitFor(
        `(window.__pcs || []).some((pc) => ['connected', 'completed'].includes(pc.connectionState) || ['connected', 'completed'].includes(pc.iceConnectionState))`,
        40000,
      ),
    ]);
    const meshDetail = await Promise.all([
      aBrowser.eval(`(window.__pcs || []).map((pc) => ({
        state: pc.connectionState || pc.iceConnectionState,
        ice: pc.iceConnectionState,
        senders: pc.getSenders().length,
      }))`),
      bBrowser.eval(`(window.__pcs || []).map((pc) => ({
        state: pc.connectionState || pc.iceConnectionState,
        ice: pc.iceConnectionState,
        senders: pc.getSenders().length,
      }))`),
    ]);
    check("WebRTC voice mesh connects", meshReady[0] && meshReady[1], JSON.stringify(meshDetail));

    const stateAfterMic = await api(`/songhub/rooms/${publicCode}/state/`, { token: A.access });
    const memberRow = stateAfterMic.members.find((member) => member.user.id === B.user.id);
    const hostRow = stateAfterMic.members.find((member) => member.user.id === A.user.id);
    check("both microphone states are broadcast", Boolean(memberRow?.mic_on && hostRow?.mic_on));

    for (const browser of [aBrowser, bBrowser]) {
      await browser.eval(`(() => {
        const button = document.querySelector('button[title="Turn microphone off"]');
        if (button) button.click();
        return Boolean(button);
      })()`);
    }
    await sleep(1800);

    // Invite the third account through the in-app friend dialog.
    await aBrowser.clickText("Invite");
    const friendInviteReady = await aBrowser.waitForText("Invite friends", 8000);
    const probeRowReady = await aBrowser.waitFor(`(() => document.body.innerText.includes(${JSON.stringify(PROBE)}))()`, 20000);
    const probeInvited = await clickFriendInvite(aBrowser, PROBE);
    const inviteStored = probeInvited && (await waitForInvitation(publicCode, C.access));
    await aBrowser.pressEscape();
    await sleep(500);

    await cBrowser.open("/song-hub", 2200);
    let invitationVisible =
      (await cBrowser.waitForText("E2E Listening Room", 15000)) &&
      (await cBrowser.waitForText("Invited by", 15000));
    let invitationRefreshed = false;
    if (!invitationVisible) {
      invitationRefreshed = await cBrowser.clickText("Refresh");
      invitationVisible =
        (await cBrowser.waitForText("E2E Listening Room", 10000)) &&
        (await cBrowser.waitForText("Invited by", 10000));
    }
    const invitationJoined = await clickInvitationJoin(cBrowser, "E2E Listening Room");
    const probeInRoom = await cBrowser.waitFor(
      `location.pathname === ${JSON.stringify(`/song-hub/${publicCode}`)}`,
      15000,
    );
    const probeListening = await cBrowser.waitForTextCI("Synced with the host", 15000);
    check(
      "host invites a friend in-app and the friend joins",
      friendInviteReady && probeRowReady && probeInvited && inviteStored && invitationVisible && invitationJoined && probeInRoom && probeListening,
      JSON.stringify({ friendInviteReady, probeRowReady, probeInvited, inviteStored, invitationVisible, invitationRefreshed, invitationJoined, probeInRoom, probeListening }),
    );

    await cBrowser.clickText("Leave");
    const probeLeaveDialog = await cBrowser.waitForText("Leave E2E Listening Room?", 8000);
    await cBrowser.clickText("Leave room");
    const probeLeft = await cBrowser.waitFor(
      `location.pathname === '/song-hub'`,
      20000,
    );
    check("invited member can leave the room", probeLeaveDialog && probeLeft, JSON.stringify({ probeLeaveDialog, probeLeft, path: await cBrowser.eval("location.pathname") }));

    // Host transfer through the UI.
    const makeHost = await clickMemberAction(aBrowser, B.user.username, "Make host");
    const transferDialog = await aBrowser.waitForText("the host?", 8000);
    const transferConfirmed = await aBrowser.clickText("Transfer host");
    const bNowHost = await bBrowser.waitForTextCI("You control the room", 20000);
    const aNowMember = await aBrowser.waitForTextCI("Synced with the host", 20000);
    const transferState = await api(`/songhub/rooms/${publicCode}/state/`, { token: A.access });
    check(
      "host transfer changes roles and unlocks member controls",
      makeHost && transferDialog && transferConfirmed && bNowHost && aNowMember && transferState.me.role === "member",
      JSON.stringify({ makeHost, transferDialog, transferConfirmed, bNowHost, aNowMember, role: transferState.me.role }),
    );

    // Host leaves; first remaining member is promoted.
    await bBrowser.clickText("Leave");
    const bLeaveDialog = await bBrowser.waitForText("Leave E2E Listening Room?", 8000);
    await bBrowser.clickText("Leave room");
    const bLeft = await bBrowser.waitFor(`location.pathname === '/song-hub'`, 20000);
    const aPromoted = await aBrowser.waitForTextCI("You control the room", 20000);
    const promotedState = await api(`/songhub/rooms/${publicCode}/state/`, { token: A.access });
    check(
      "host leaving promotes the first remaining member",
      bLeaveDialog && bLeft && aPromoted && promotedState.me.role === "host",
    );

    await aBrowser.clickText("Leave");
    const aLeaveDialog = await aBrowser.waitForText("Leave E2E Listening Room?", 8000);
    await aBrowser.clickText("Leave room");
    const aLeft = await aBrowser.waitFor(`location.pathname === '/song-hub'`, 20000);
    await sleep(1200);
    const roomIndicatorGone = await aBrowser.eval(
      `!document.body.innerText.includes(${JSON.stringify(`Hosting · ${publicCode}`)}) && !document.body.innerText.includes(${JSON.stringify(`Listening · ${publicCode}`)})`,
    );
    check("leaving restores the normal shell", aLeaveDialog && aLeft && roomIndicatorGone, JSON.stringify({ aLeaveDialog, aLeft, roomIndicatorGone, path: await aBrowser.eval("location.pathname"), body: (await aBrowser.bodyText()).slice(0, 500) }));

    const aLobby = await api("/songhub/rooms/", { token: A.access });
    if (aLobby.my_room) {
      await api(`/songhub/rooms/${aLobby.my_room.code}/leave/`, { token: A.access, method: "POST" });
    }
    await aBrowser.open("/song-hub", 2600);
    await aBrowser.waitForText("Create a room", 20000);

    // Private room creation and password flow.
    await aBrowser.fill("#hub-name", "E2E Private Room");
    await aBrowser.clickText("Requires a password", { exact: false });
    await aBrowser.waitFor(`Boolean(document.querySelector('#hub-password'))`, 5000);
    await aBrowser.fill("#hub-password", "secret123");
    await aBrowser.clickText("Open Song Hub");
    const privateCreated = await aBrowser.waitFor(`location.pathname.startsWith('/song-hub/')`, 20000);
    const privateCode = await aBrowser.eval("location.pathname.split('/').pop()");
    const privateHost = await aBrowser.waitForTextCI("You control the room", 15000);
    check("host creates a private room", privateCreated && Boolean(privateCode) && privateHost, privateCode);

    await bBrowser.open("/song-hub", 2200);
    const privateHidden = await bBrowser.eval(
      `!document.body.innerText.includes(${JSON.stringify("E2E Private Room")})`,
    );
    check("private room is hidden from the public lobby", privateHidden);

    await cBrowser.open(`/song-hub/${privateCode}`, 2500);
    const passwordPrompt = await cBrowser.waitFor(`Boolean(document.querySelector('#room-password'))`, 30000);
    check("private room link asks for a password", passwordPrompt);

    // Enforce the password at the API boundary, then let the member in with
    // the correct password. This avoids depending on toast timing in the UI.
    const noPass = await rawJoin(privateCode, B.access, "");
    const wrongPass = await rawJoin(privateCode, B.access, "wrong-password");
    const correctPass = await rawJoin(privateCode, B.access, "secret123");

    await bBrowser.open(`/song-hub/${privateCode}`, 2500);
    const privateJoined = await bBrowser.waitFor(
      `location.pathname === ${JSON.stringify(`/song-hub/${privateCode}`)} && document.body.innerText.includes('SYNCED WITH THE HOST')`,
      30000,
    );
    const privateBadge = await bBrowser.waitForText("Private", 15000);
    check(
      "private room password is enforced and accepted",
      noPass.status === 403 && wrongPass.status === 403 && correctPass.status === 201 && privateJoined && privateBadge,
      JSON.stringify({ noPass: noPass.status, wrongPass: wrongPass.status, correctPass: correctPass.status, privateJoined, privateBadge, path: await bBrowser.eval("location.pathname") }),
    );

    // Friend invite bypasses the private-room password.
    await aBrowser.clickText("Invite");
    await aBrowser.waitForText("Invite friends", 8000);
    await aBrowser.waitFor(`(() => document.body.innerText.includes(${JSON.stringify(PROBE)}))()`, 12000);
    const privateInviteClicked = await clickFriendInvite(aBrowser, PROBE);
    const privateInvite = privateInviteClicked && (await waitForInvitation(privateCode, C.access));
    await aBrowser.pressEscape();
    await sleep(500);

    await cBrowser.open("/song-hub", 2200);
    let privateInvitation = await cBrowser.waitForText("E2E Private Room", 15000);
    if (!privateInvitation) {
      await cBrowser.clickText("Refresh");
      privateInvitation = await cBrowser.waitForText("E2E Private Room", 10000);
    }
    const privateInviteJoin = await clickInvitationJoin(cBrowser, "E2E Private Room");
    const probePrivate = await cBrowser.waitFor(
      `location.pathname === ${JSON.stringify(`/song-hub/${privateCode}`)} && document.body.innerText.includes('SYNCED WITH THE HOST')`,
      18000,
    );
    check(
      "private-room friend invitation bypasses the password",
      privateInvite && privateInvitation && privateInviteJoin && probePrivate,
      JSON.stringify({ privateInvite, privateInvitation, privateInviteJoin, probePrivate }),
    );

    await cBrowser.clickText("Leave");
    await cBrowser.waitForText("Leave E2E Private Room?", 8000);
    await cBrowser.clickText("Leave room");
    await cBrowser.waitFor(`location.pathname === '/song-hub'`, 12000);

    // Host leaves private room; member becomes host.
    await aBrowser.clickText("Leave");
    await aBrowser.waitForText("Leave E2E Private Room?", 8000);
    await aBrowser.clickText("Leave room");
    await aBrowser.waitFor(`location.pathname === '/song-hub'`, 12000);
    const bPromotedPrivate = await bBrowser.waitForTextCI("You control the room", 20000);
    let privateState = null;
    try {
      privateState = await api(`/songhub/rooms/${privateCode}/state/`, { token: B.access });
    } catch {
      privateState = null;
    }
    check("private-room host leave promotes the member", bPromotedPrivate && privateState?.me.role === "host");

    await bBrowser.clickText("Leave");
    await bBrowser.waitForText("Leave E2E Private Room?", 8000);
    await bBrowser.clickText("Leave room");
    await bBrowser.waitFor(`location.pathname === '/song-hub'`, 12000);

    // Normal playback works again after leaving the room.
    await aBrowser.open("/playlist/29", 2400);
    const normalPlaylist = await aBrowser.waitFor(
      `Boolean(document.querySelector('button[aria-label="Play Prefetch Test 1"]'))`,
      20000,
    );
    const noLock = await aBrowser.eval(`!document.querySelector('footer')?.innerText.includes('Listen-only')`);
    const playClicked = await aBrowser.clickAria("Play Prefetch Test 1");
    const normalPlaying = await aBrowser.waitFor(
      `(() => {
        const footer = document.querySelector('footer');
        const pause = footer?.querySelector('button[aria-label="Pause"]');
        return Boolean(footer?.innerText.includes('Prefetch Test 1') && pause && !pause.disabled && !footer.innerText.includes('Listen-only'));
      })()`,
      20000,
    );
    check("normal playback returns after leaving Song Hub", normalPlaylist && noLock && playClicked && normalPlaying);

    // The advanced badge catalogue is visible on the profile.
    await aBrowser.open("/profile", 2400);
    const profileReady = await aBrowser.waitForText("Badge collection", 18000);
    const badgeSelector = `(() => {
      const heading = [...document.querySelectorAll('h2')].find((item) => item.innerText.includes('Badge collection'));
      const section = heading?.closest('section');
      return section ? section.querySelectorAll('img').length : 0;
    })()`;
    const badgesRendered = await aBrowser.waitFor(`${badgeSelector} >= 20`, 20000);
    const badgeCount = await aBrowser.eval(badgeSelector);
    const advancedTitles = [
      "Thousand Spins",
      "Hub Founder",
      "Chatterbox",
      "Reaction Legend",
      "Night Owl",
      "Sonic Explorer",
      "Deep Cuts",
    ];
    const badgeText = await aBrowser.bodyText();
    check(
      "profile shows 20 badges including the advanced set",
      profileReady && badgesRendered && badgeCount >= 20 && advancedTitles.every((title) => badgeText.includes(title)),
      `${badgeCount} badge tiles`,
    );

    await aBrowser.shot("songhub-profile-badges");

    const failed = results.filter((result) => !result.ok);
    const appErrors = [...aBrowser.errors, ...bBrowser.errors, ...cBrowser.errors].filter(
      (item) =>
        item &&
        !/AudioContext|play\(\) failed|NotAllowedError|The request is not allowed|User media|Permission denied/i.test(item),
    );
    console.log("APP ERRORS:", appErrors.length);
    for (const error of appErrors.slice(0, 10)) console.log("ERR", error);
    console.log(`SUMMARY ${results.length - failed.length}/${results.length} passed`);
    if (failed.length) console.log("FAILED:", failed.map((result) => result.name).join(", "));
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    await Promise.allSettled([aBrowser.stop(), bBrowser.stop(), cBrowser.stop()]);
  }
}

main().catch((error) => {
  console.error("E2E ERROR", error);
  process.exitCode = 1;
});
