# Overlay Assistant (Pluely-class) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Repo IPC rule (apps/desktop/AGENTS.md):** Electron IPC ALWAYS goes through tRPC (`src/lib/trpc`). Use `observable` for subscriptions (trpc-electron does NOT support async generators). Use tsconfig path aliases.

**Goal:** Add a stealth, always-on-top overlay assistant to the Rox Electron desktop — a compact summon-by-hotkey window that sees the screen on demand, is hidden from screen-share/recording, and answers via the existing Rox AI provider stack.

**Architecture:** A second `BrowserWindow` ("overlay") owned by a new `OverlayWindowManager` in the main process, summoned by a `globalShortcut`, rendered by a dedicated `/overlay` route in the existing renderer. Screen capture (`desktopCapturer`) and AI calls run in main and stream to the overlay via a new tRPC `overlay` router. Stealth = `win.setContentProtection(true)` + `alwaysOnTop('screen-saver')` + `visibleOnAllWorkspaces`. No code is ported from the GPL-3.0 Pluely repo — only the UX is referenced.

**Tech Stack:** Electron 40.8.5, electron-vite 4, React 19, TanStack Router, trpc-electron, TailwindCSS v4 + `@rox/ui`, Bun + Vitest.

---

## Часть 0 — Концепт (обязательно прочитать перед задачами)

### 0.1 Реформулировка задачи

Сейчас desktop Rox — обычное оконное Electron-приложение (`apps/desktop/src/main/windows/main.ts:129` → `alwaysOnTop:false`, нет `setContentProtection`, нет `globalShortcut`, нет захвата экрана ОС). «Pluely» в репо существует только как пункт роадмапа (`plans/rox-superapp-roadmap-and-design.md:46-49`). Эталон `~/Projects/pluely` — Tauri+Rust v0.1.9 (GPL-3.0), его код в Electron не переносится.

Задача: реализовать суть Pluely/Cluely **нативно на Electron API** как дополнительную поверхность того же приложения Rox: невидимый для screenshare overlay, вызываемый системным хоткеем поверх любого приложения, с опциональным «взглядом» на экран и голосовым вводом, отвечающий через уже существующий AI-слой Rox (gateway `api.zed.md`, модель R1/`cx/gpt-5.5`).

### 0.2 Допущения и границы

**Допущения:**
- macOS — первичная цель (как у Mark). Windows/Linux — best-effort, под флагами платформы (`shared/constants` `PLATFORM`).
- AI-бэкенд уже есть в Rox (chat-runtime/chat-service tRPC-роутеры + провайдер zed). Overlay переиспользует его, не вводит свой провайдер.
- Screen Recording / Microphone permission уже запрашиваются в `src/renderer/.../settings/permissions/PermissionsSettings.tsx`.
- `useDictation` (`src/renderer/lib/voice/useDictation/useDictation.ts`) — рабочий STT, переиспользуется как push-to-talk вход.

**В границах (this plan):** overlay-окно, summon-хоткей, stealth-режим (content protection), захват экрана on-demand, минимальный overlay UI (свёрнутая строка + раскрытие), проводка к существующему AI, push-to-talk, настройка вкл/выкл + permission-гейтинг, smoke/visual proof.

**Вне границ (отдельные тикеты):** непрерывный «ambient» анализ экрана, локальный whisper-резерв, мульти-монитор-таргетинг, биллинг/квоты overlay, мобильный аналог. Эти пункты — follow-up, не блокируют MVP.

### 0.3 Архитектурная карта

```
                         ┌──────────────────────── MAIN PROCESS ────────────────────────┐
 globalShortcut  ──────► │  OverlayWindowManager (src/main/windows/overlay/)             │
 (Cmd+\ summon)          │   • create() second BrowserWindow (transparent, panel)        │
                         │   • show()/hide()/toggle()                                    │
                         │   • setContentProtection(true)  ← STEALTH                     │
                         │   • alwaysOnTop('screen-saver') + visibleOnAllWorkspaces      │
                         │                                                               │
                         │  overlay tRPC router (src/lib/trpc/routers/overlay/)          │
                         │   • captureScreen() → desktopCapturer → PNG base64            │
                         │   • ask(prompt,image?) → reuse chat-runtime → observable      │
                         │   • setStealth(on)                                            │
                         └───────────────▲───────────────────────────┬──────────────────┘
                                         │ tRPC (trpc-electron)       │ webContents.send
                                         │                            ▼  "overlay:summoned"
                         ┌───────────────┴──────── RENDERER (overlay) ────────────────────┐
                         │  route /overlay  (src/renderer/routes/overlay/)                │
                         │   • collapsed bar  ⌥  expands to chat                          │
                         │   • push-to-talk (reuse useDictation)                          │
                         │   • streams answer tokens from overlay.ask subscription       │
                         └───────────────────────────────────────────────────────────────┘
```

### 0.4 Sequence-диаграмма (summon → ответ)

```
User        globalShortcut   OverlayWindowMgr   OverlayRoute(renderer)   overlay tRPC      AI(zed gateway)
 │  Cmd+\         │                 │                    │                    │                  │
 ├───────────────►│                 │                    │                    │                  │
 │                ├── toggle() ─────►│                    │                    │                  │
 │                │            show()+focus()             │                    │                  │
 │                │            send "overlay:summoned" ──►│                    │                  │
 │                │                 │              (input focus)              │                  │
 │  type / hold-to-talk ────────────────────────────────►│                    │                  │
 │                │                 │             ask({prompt, wantsScreen}) ─►│                  │
 │                │                 │   captureScreen() ◄─┤ (if wantsScreen)   │                  │
 │                │     desktopCapturer.getSources ◄──────┤                    │                  │
 │                │                 │   PNG base64 ───────► ask() builds msg ──► stream request ─►│
 │                │                 │                    │  observable.next(token) ◄── tokens ────┤
 │                │                 │              render tokens ◄─────────────┤                  │
 │  Esc / Cmd+\ ──► hide() ─────────►│ hide(); blur                            │                  │
```

**Точки отказа (заложить обработку):**
- Нет Screen Recording permission → `captureScreen()` вернёт пустой/чёрный кадр. Гейтить: проверять `systemPreferences.getMediaAccessStatus('screen')`, при `denied` — показать в overlay подсказку «включить доступ», не падать.
- `globalShortcut.register` вернул `false` (хоткей занят другим приложением) → лог + fallback-хоткей + видимая запись в настройках.
- Overlay renderer не загрузился → окно создаётся `show:false`; показывать только после `did-finish-load` (как делает MainWindow).
- `setContentProtection` не поддержан на платформе → no-op, но в настройках честно отметить «stealth доступен только на macOS/Windows».

### 0.5 Опции и tradeoffs

**A. Где живёт overlay UI:**
| Опция | Плюсы | Минусы |
|---|---|---|
| **A1. Отдельный route `/overlay` в существующем renderer** (рекоменд.) | Минимум правок сборки; переиспускает trpc-клиент, провайдеры, дизайн-систему, `useDictation` | Грузит общий бандл renderer (тяжелее старт overlay) |
| A2. Отдельный renderer entry `overlay.html`+`overlay.tsx` | Лёгкий изолированный бандл, быстрый summon | Правка `electron.vite.config.ts` (multi-input), дублирование провайдеров/trpc-bootstrap |

→ **MVP: A1.** Оптимизацию до A2 вынести в follow-up, если холодный summon ощутимо медленный.

**B. AI-бэкенд overlay:**
| Опция | Плюсы | Минусы |
|---|---|---|
| **B1. Переиспользовать chat-runtime/chat-service Rox** (рекоменд.) | Единый провайдер/ключи/биллинг; ноль дублирования; согласуется с roadmap | Нужно аккуратно вызвать существующий стрим из overlay-контекста |
| B2. Прямой fetch к `api.zed.md` из overlay (как делает форк pluely) | Просто, автономно | Дублирует провайдер-слой, обходит биллинг/политику Rox; разъезд конфигов |

→ **B1.** Это и есть смысл «встроить в Rox», а не «принести второй pluely».

**C. Stealth по умолчанию:**
| Опция | Плюсы | Минусы |
|---|---|---|
| **C1. Content protection ВКЛ по умолчанию, тоггл в настройках** (рекоменд.) | Соответствует сути Cluely-альтернативы | Двойное назначение → этика/ToS (см. §3) |
| C2. ВЫКЛ по умолчанию, явный opt-in | Консервативно с т.з. этики | Не «из коробки», лишний шаг |

→ **C1**, но с явной строкой в настройках и в §3 (этика/ToS — осознанный выбор пользователя-владельца).

### 0.6 Рекомендованный путь (BLUF)

A1 + B1 + C1: один новый main-модуль `OverlayWindowManager`, один `globalShortcut`, один tRPC-роутер `overlay`, один renderer-route `/overlay`, переиспуск существующих AI-стрима и `useDictation`. Stealth через `setContentProtection`. Никакого кода из GPL-pluely. 12 задач ниже, TDD, частые коммиты, проверка `bun run typecheck` + `bun run lint` + ручной/visual smoke.

---

## Часть 1 — File Structure

**Создаём:**
- `src/main/windows/overlay/overlayWindowConfig.ts` — чистая фабрика опций `BrowserWindow` (тестируемая).
- `src/main/windows/overlay/overlayWindowConfig.test.ts`
- `src/main/windows/overlay/OverlayWindowManager.ts` — синглтон жизненного цикла overlay-окна.
- `src/main/windows/overlay/OverlayWindowManager.test.ts`
- `src/main/windows/overlay/index.ts` — barrel.
- `src/main/lib/overlay-shortcut/overlayShortcut.ts` — регистрация/снятие `globalShortcut`.
- `src/main/lib/overlay-shortcut/overlayShortcut.test.ts`
- `src/lib/trpc/routers/overlay/overlay.ts` — tRPC-роутер (captureScreen, ask, setStealth).
- `src/lib/trpc/routers/overlay/captureScreen.ts` + `captureScreen.test.ts` — захват экрана (чистая обёртка над desktopCapturer).
- `src/lib/trpc/routers/overlay/index.ts`
- `src/renderer/routes/overlay/route.tsx` — overlay UI route (TanStack Router).
- `src/renderer/routes/overlay/components/OverlayBar/OverlayBar.tsx` (+ `index.ts`, `.test.tsx`)
- `src/renderer/routes/overlay/hooks/useOverlayAsk/useOverlayAsk.ts` (+ `index.ts`, `.test.ts`)

**Модифицируем:**
- `src/main/index.ts` — после `makeAppSetup(...)` (≈ строка 488): создать overlay manager, зарегистрировать shortcut; на `before-quit`/`will-quit`: снять shortcut + закрыть overlay.
- `src/preload/ipc-channels.ts` — добавить событийный канал `"overlay:summoned"` (main→renderer).
- `src/lib/trpc/routers/index.ts` — подключить `overlay` роутер в `createAppRouter`.
- `src/renderer/.../settings/permissions/PermissionsSettings.tsx` (или соседний settings-раздел) — тоггл «Overlay assistant» + «Stealth (hide from screen share)» + статус хоткея/permission.

---

## Часть 2 — Tasks

### Task 1: Overlay window config factory (pure, testable)

**Files:**
- Create: `src/main/windows/overlay/overlayWindowConfig.ts`
- Test: `src/main/windows/overlay/overlayWindowConfig.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/windows/overlay/overlayWindowConfig.test.ts
import { describe, expect, it } from "vitest";
import { buildOverlayWindowConfig } from "./overlayWindowConfig";

describe("buildOverlayWindowConfig", () => {
  it("is a frameless, transparent, non-taskbar always-on-top window", () => {
    const cfg = buildOverlayWindowConfig({ isMac: true, preloadPath: "/x/preload/index.js" });
    expect(cfg.frame).toBe(false);
    expect(cfg.transparent).toBe(true);
    expect(cfg.skipTaskbar).toBe(true);
    expect(cfg.alwaysOnTop).toBe(true);
    expect(cfg.show).toBe(false); // shown only after did-finish-load
    expect(cfg.resizable).toBe(false);
    expect(cfg.webPreferences?.preload).toBe("/x/preload/index.js");
    expect(cfg.webPreferences?.partition).toBe("persist:rox");
  });

  it("uses panel type on macOS so it floats over fullscreen apps", () => {
    expect(buildOverlayWindowConfig({ isMac: true, preloadPath: "p" }).type).toBe("panel");
    expect(buildOverlayWindowConfig({ isMac: false, preloadPath: "p" }).type).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/desktop && bun run vitest run src/main/windows/overlay/overlayWindowConfig.test.ts`
Expected: FAIL — `buildOverlayWindowConfig is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/windows/overlay/overlayWindowConfig.ts
import type { BrowserWindowConstructorOptions } from "electron";

export interface OverlayWindowConfigInput {
  isMac: boolean;
  preloadPath: string;
}

/**
 * Pure factory for the overlay BrowserWindow options. Kept side-effect-free so
 * the stealth/positioning invariants are unit-testable without spawning Electron.
 * Runtime-only behaviour (setContentProtection, alwaysOnTop level,
 * setVisibleOnAllWorkspaces) is applied in OverlayWindowManager after creation.
 */
export function buildOverlayWindowConfig(
  input: OverlayWindowConfigInput,
): BrowserWindowConstructorOptions {
  const { isMac, preloadPath } = input;
  return {
    width: 720,
    height: 88, // collapsed bar height; renderer can request resize on expand
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    // macOS "panel" lets the window float above fullscreen apps without
    // activating/stealing Space focus. Non-mac: omit (undefined).
    ...(isMac ? { type: "panel" as const } : {}),
    webPreferences: {
      preload: preloadPath,
      partition: "persist:rox",
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/desktop && bun run vitest run src/main/windows/overlay/overlayWindowConfig.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/windows/overlay/overlayWindowConfig.ts apps/desktop/src/main/windows/overlay/overlayWindowConfig.test.ts
git commit -m "feat(desktop/overlay): pure overlay window config factory"
```

---

### Task 2: OverlayWindowManager (create / show / hide / stealth)

**Files:**
- Create: `src/main/windows/overlay/OverlayWindowManager.ts`, `src/main/windows/overlay/index.ts`
- Test: `src/main/windows/overlay/OverlayWindowManager.test.ts`

- [ ] **Step 1: Write the failing test** (inject a fake BrowserWindow so no real Electron window is spawned)

```ts
// src/main/windows/overlay/OverlayWindowManager.test.ts
import { describe, expect, it, vi } from "vitest";
import { OverlayWindowManager } from "./OverlayWindowManager";

function makeFakeWindow() {
  return {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => false),
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
    setContentProtection: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setVisibleOnAllWorkspaces: vi.fn(),
    webContents: { send: vi.fn(), on: vi.fn() },
    on: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    loadFile: vi.fn(() => Promise.resolve()),
  };
}

describe("OverlayWindowManager", () => {
  it("applies stealth + float invariants on create", async () => {
    const win = makeFakeWindow();
    const mgr = new OverlayWindowManager({
      createWindow: () => win as never,
      isMac: true,
      loadOverlay: vi.fn(() => Promise.resolve()),
    });
    await mgr.ensureCreated();
    expect(win.setContentProtection).toHaveBeenCalledWith(true);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, "screen-saver");
    expect(win.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
      visibleOnFullScreen: true,
    });
  });

  it("toggle() shows when hidden and hides when visible", async () => {
    const win = makeFakeWindow();
    const mgr = new OverlayWindowManager({
      createWindow: () => win as never,
      isMac: true,
      loadOverlay: vi.fn(() => Promise.resolve()),
    });
    win.isVisible.mockReturnValue(false);
    await mgr.toggle();
    expect(win.show).toHaveBeenCalledTimes(1);
    win.isVisible.mockReturnValue(true);
    await mgr.toggle();
    expect(win.hide).toHaveBeenCalledTimes(1);
  });

  it("setStealth(false) disables content protection", async () => {
    const win = makeFakeWindow();
    const mgr = new OverlayWindowManager({
      createWindow: () => win as never,
      isMac: true,
      loadOverlay: vi.fn(() => Promise.resolve()),
    });
    await mgr.ensureCreated();
    mgr.setStealth(false);
    expect(win.setContentProtection).toHaveBeenLastCalledWith(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/desktop && bun run vitest run src/main/windows/overlay/OverlayWindowManager.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/windows/overlay/OverlayWindowManager.ts
import type { BrowserWindow } from "electron";

export interface OverlayWindowManagerDeps {
  /** Factory that actually constructs the BrowserWindow (injected for tests). */
  createWindow: () => BrowserWindow;
  isMac: boolean;
  /** Loads the /overlay route into the window (dev URL vs prod file). */
  loadOverlay: (win: BrowserWindow) => Promise<void>;
}

/**
 * Owns the single overlay BrowserWindow lifecycle. Applies the stealth + float
 * invariants that can only be set at runtime (not via constructor options).
 */
export class OverlayWindowManager {
  private win: BrowserWindow | null = null;
  private stealth = true;

  constructor(private readonly deps: OverlayWindowManagerDeps) {}

  async ensureCreated(): Promise<BrowserWindow> {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const win = this.deps.createWindow();
    this.win = win;

    // Runtime-only stealth/float invariants:
    win.setContentProtection(this.stealth); // hide from screen-share/recording
    win.setAlwaysOnTop(true, "screen-saver"); // above normal + fullscreen layers
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    win.on("closed", () => {
      this.win = null;
    });

    await this.deps.loadOverlay(win);
    return win;
  }

  async show(): Promise<void> {
    const win = await this.ensureCreated();
    win.show();
    win.focus();
    win.webContents.send("overlay:summoned");
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed()) this.win.hide();
  }

  async toggle(): Promise<void> {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.hide();
      return;
    }
    await this.show();
  }

  setStealth(on: boolean): void {
    this.stealth = on;
    if (this.win && !this.win.isDestroyed()) this.win.setContentProtection(on);
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}
```

```ts
// src/main/windows/overlay/index.ts
export { OverlayWindowManager } from "./OverlayWindowManager";
export type { OverlayWindowManagerDeps } from "./OverlayWindowManager";
export { buildOverlayWindowConfig } from "./overlayWindowConfig";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/desktop && bun run vitest run src/main/windows/overlay/OverlayWindowManager.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/windows/overlay/
git commit -m "feat(desktop/overlay): OverlayWindowManager lifecycle + stealth invariants"
```

---

### Task 3: Real window wiring — createOverlayWindow + loadOverlay

**Files:**
- Modify: `src/main/windows/overlay/OverlayWindowManager.ts` (add a factory helper that uses the repo's `createWindow` + config)
- Create: `src/main/windows/overlay/createOverlayWindow.ts`

> Mirrors `src/main/windows/main.ts:115` (`createWindow({...})`) and the dev/prod load split used by the `lib/electron-app` factory. The renderer entry is the existing `src/renderer/index.html`; the overlay route is reached via hash `#/overlay`.

- [ ] **Step 1: Implement the real factory (no new test — exercised by Task 12 smoke)**

```ts
// src/main/windows/overlay/createOverlayWindow.ts
import { join } from "node:path";
import { BrowserWindow } from "electron";
import { PLATFORM } from "shared/constants";
import { buildOverlayWindowConfig } from "./overlayWindowConfig";

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL; // set by electron-vite in dev

export function createOverlayWindow(): BrowserWindow {
  const preloadPath = join(__dirname, "../preload/index.js");
  const win = new BrowserWindow(
    buildOverlayWindowConfig({ isMac: PLATFORM.IS_MAC, preloadPath }),
  );
  return win;
}

export async function loadOverlay(win: BrowserWindow): Promise<void> {
  if (DEV_SERVER_URL) {
    await win.loadURL(`${DEV_SERVER_URL}#/overlay`);
  } else {
    await win.loadFile(join(__dirname, "../renderer/index.html"), {
      hash: "/overlay",
    });
  }
}
```

> **Verify against docs:** confirm the dev URL env var name and prod renderer path against the existing `lib/electron-app/factories/windows/create` implementation — reuse that factory instead of raw `new BrowserWindow` if it already centralizes dev/prod loading. (Consult repo source; do not guess.)

- [ ] **Step 2: Typecheck**

Run: `cd apps/desktop && bun run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/windows/overlay/createOverlayWindow.ts
git commit -m "feat(desktop/overlay): real overlay window factory + /overlay route load"
```

---

### Task 4: Global shortcut (summon/hide) registration

**Files:**
- Create: `src/main/lib/overlay-shortcut/overlayShortcut.ts`, `.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/lib/overlay-shortcut/overlayShortcut.test.ts
import { describe, expect, it, vi } from "vitest";
import { registerOverlayShortcut, OVERLAY_SUMMON_ACCELERATOR } from "./overlayShortcut";

describe("registerOverlayShortcut", () => {
  it("registers the summon accelerator and calls onToggle", () => {
    const handlers: Record<string, () => void> = {};
    const globalShortcut = {
      register: vi.fn((accel: string, cb: () => void) => {
        handlers[accel] = cb;
        return true;
      }),
      unregister: vi.fn(),
    };
    const onToggle = vi.fn();
    const ok = registerOverlayShortcut({ globalShortcut: globalShortcut as never, onToggle });
    expect(ok).toBe(true);
    expect(globalShortcut.register).toHaveBeenCalledWith(
      OVERLAY_SUMMON_ACCELERATOR,
      expect.any(Function),
    );
    handlers[OVERLAY_SUMMON_ACCELERATOR]();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("returns false when the OS rejects the accelerator", () => {
    const globalShortcut = { register: vi.fn(() => false), unregister: vi.fn() };
    const ok = registerOverlayShortcut({ globalShortcut: globalShortcut as never, onToggle: vi.fn() });
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/desktop && bun run vitest run src/main/lib/overlay-shortcut/overlayShortcut.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/lib/overlay-shortcut/overlayShortcut.ts
import type { GlobalShortcut } from "electron";

/** Cmd/Ctrl + \  — summon/hide the overlay from any app. */
export const OVERLAY_SUMMON_ACCELERATOR = "CommandOrControl+\\";

export interface RegisterOverlayShortcutDeps {
  globalShortcut: GlobalShortcut;
  onToggle: () => void;
}

/** Returns true if the accelerator was claimed; false if the OS rejected it. */
export function registerOverlayShortcut(
  deps: RegisterOverlayShortcutDeps,
): boolean {
  const { globalShortcut, onToggle } = deps;
  return globalShortcut.register(OVERLAY_SUMMON_ACCELERATOR, onToggle);
}

export function unregisterOverlayShortcut(globalShortcut: GlobalShortcut): void {
  globalShortcut.unregister(OVERLAY_SUMMON_ACCELERATOR);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/desktop && bun run vitest run src/main/lib/overlay-shortcut/overlayShortcut.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/lib/overlay-shortcut/
git commit -m "feat(desktop/overlay): global summon shortcut (Cmd+\\) registration"
```

---

### Task 5: Wire manager + shortcut into main entry

**Files:**
- Modify: `src/main/index.ts` (after `await makeAppSetup(() => MainWindow());` ≈ line 488; and in `before-quit` cleanup ≈ line 286-296)

- [ ] **Step 1: Add imports near the other `./windows` / `./lib` imports (top of file)**

```ts
import { globalShortcut } from "electron"; // add to existing electron import group
import { OverlayWindowManager } from "./windows/overlay";
import { createOverlayWindow, loadOverlay } from "./windows/overlay/createOverlayWindow";
import {
  registerOverlayShortcut,
  unregisterOverlayShortcut,
} from "./lib/overlay-shortcut/overlayShortcut";
```

- [ ] **Step 2: After `await makeAppSetup(() => MainWindow());` add**

```ts
// Overlay assistant (Pluely-class). Created lazily on first summon; the shortcut
// works app-wide. Stealth (content protection) is applied inside the manager.
const overlayManager = new OverlayWindowManager({
  createWindow: createOverlayWindow,
  isMac: PLATFORM.IS_MAC,
  loadOverlay,
});
// Expose for the tRPC overlay router (Task 6).
setOverlayManager(overlayManager);

const overlayShortcutOk = registerOverlayShortcut({
  globalShortcut,
  onToggle: () => {
    void overlayManager.toggle();
  },
});
if (!overlayShortcutOk) {
  logger.warn(
    "[overlay] summon shortcut already in use; configure an alternative in Settings",
  );
}
```

- [ ] **Step 3: In the `before-quit` cleanup block (with `disposeTray()`), add**

```ts
unregisterOverlayShortcut(globalShortcut);
overlayManager.destroy();
```

> `setOverlayManager` is defined in Task 6 (`src/lib/trpc/routers/overlay/overlay.ts`). Import it here.

- [ ] **Step 4: Typecheck**

Run: `cd apps/desktop && bun run typecheck`
Expected: exit 0 (after Task 6 provides `setOverlayManager`). If implementing strictly in order, stub `setOverlayManager` as a no-op export first, then replace in Task 6.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/index.ts
git commit -m "feat(desktop/overlay): wire overlay manager + summon shortcut into main entry"
```

---

### Task 6: Screen capture (desktopCapturer wrapper)

**Files:**
- Create: `src/lib/trpc/routers/overlay/captureScreen.ts`, `captureScreen.test.ts`

- [ ] **Step 1: Write the failing test** (inject fake desktopCapturer + permission probe)

```ts
// src/lib/trpc/routers/overlay/captureScreen.test.ts
import { describe, expect, it, vi } from "vitest";
import { capturePrimaryScreenPng } from "./captureScreen";

describe("capturePrimaryScreenPng", () => {
  it("returns base64 PNG of the first screen source", async () => {
    const png = Buffer.from("fake-png");
    const deps = {
      getMediaAccessStatus: vi.fn(() => "granted" as const),
      getSources: vi.fn(async () => [
        { thumbnail: { toPNG: () => png, isEmpty: () => false } },
      ]),
    };
    const result = await capturePrimaryScreenPng(deps as never);
    expect(result.granted).toBe(true);
    expect(result.pngBase64).toBe(png.toString("base64"));
  });

  it("reports denied permission without throwing", async () => {
    const deps = {
      getMediaAccessStatus: vi.fn(() => "denied" as const),
      getSources: vi.fn(),
    };
    const result = await capturePrimaryScreenPng(deps as never);
    expect(result.granted).toBe(false);
    expect(result.pngBase64).toBeNull();
    expect(deps.getSources).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/desktop && bun run vitest run src/lib/trpc/routers/overlay/captureScreen.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/trpc/routers/overlay/captureScreen.ts
export interface CaptureDeps {
  getMediaAccessStatus: (
    mediaType: "screen",
  ) => "not-determined" | "granted" | "denied" | "restricted" | "unknown";
  getSources: (opts: {
    types: Array<"screen" | "window">;
    thumbnailSize: { width: number; height: number };
  }) => Promise<Array<{ thumbnail: { toPNG: () => Buffer; isEmpty: () => boolean } }>>;
}

export interface CaptureResult {
  granted: boolean;
  pngBase64: string | null;
}

/**
 * Capture the primary screen as a base64 PNG. macOS requires the "Screen
 * Recording" permission; when not granted we return granted:false instead of a
 * black frame so the overlay can prompt the user to enable it.
 */
export async function capturePrimaryScreenPng(
  deps: CaptureDeps,
): Promise<CaptureResult> {
  const status = deps.getMediaAccessStatus("screen");
  if (status !== "granted" && status !== "not-determined" && status !== "unknown") {
    return { granted: false, pngBase64: null };
  }
  const sources = await deps.getSources({
    types: ["screen"],
    thumbnailSize: { width: 1920, height: 1080 },
  });
  const first = sources[0];
  if (!first || first.thumbnail.isEmpty()) {
    return { granted: false, pngBase64: null };
  }
  return { granted: true, pngBase64: first.thumbnail.toPNG().toString("base64") };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/desktop && bun run vitest run src/lib/trpc/routers/overlay/captureScreen.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/trpc/routers/overlay/captureScreen.ts apps/desktop/src/lib/trpc/routers/overlay/captureScreen.test.ts
git commit -m "feat(desktop/overlay): screen capture wrapper with permission gating"
```

---

### Task 7: overlay tRPC router (setStealth, captureScreen, ask)

**Files:**
- Create: `src/lib/trpc/routers/overlay/overlay.ts`, `src/lib/trpc/routers/overlay/index.ts`
- Modify: `src/lib/trpc/routers/index.ts` (register `overlay` in `createAppRouter`)

> Follow the existing router style in `src/lib/trpc/routers/window.ts` and `notifications.ts`. Subscriptions MUST use `observable` (see `apps/desktop/AGENTS.md`). `ask` reuses the existing chat-runtime/chat-service stream — wire to the same function the renderer chat composer calls; do NOT add a second AI provider.

- [ ] **Step 1: Implement the router + manager handle**

```ts
// src/lib/trpc/routers/overlay/overlay.ts
import { desktopCapturer, systemPreferences } from "electron";
import { observable } from "@trpc/server/observable";
import { z } from "zod";
import { publicProcedure, router } from "../../trpc"; // match path used by sibling routers
import type { OverlayWindowManager } from "main/windows/overlay";
import { capturePrimaryScreenPng } from "./captureScreen";

// Module-level handle set from main/index.ts after the manager is constructed.
let overlayManager: OverlayWindowManager | null = null;
export function setOverlayManager(mgr: OverlayWindowManager): void {
  overlayManager = mgr;
}

export const createOverlayRouter = () =>
  router({
    setStealth: publicProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(({ input }) => {
        overlayManager?.setStealth(input.enabled);
        return { ok: true };
      }),

    hide: publicProcedure.mutation(() => {
      overlayManager?.hide();
      return { ok: true };
    }),

    captureScreen: publicProcedure.query(async () =>
      capturePrimaryScreenPng({
        getMediaAccessStatus: (t) => systemPreferences.getMediaAccessStatus(t),
        getSources: (opts) => desktopCapturer.getSources(opts),
      }),
    ),

    // Streams answer tokens. Replace the body with a call into the existing
    // chat-runtime stream (same one the renderer composer uses). Observable is
    // mandatory for trpc-electron.
    ask: publicProcedure
      .input(z.object({ prompt: z.string(), imagePngBase64: z.string().nullable() }))
      .subscription(({ input }) =>
        observable<{ type: "token" | "done"; text?: string }>((emit) => {
          const stream = startOverlayCompletion(input); // TODO: bind to chat-runtime
          stream.on("token", (t: string) => emit.next({ type: "token", text: t }));
          stream.on("done", () => emit.next({ type: "done" }));
          stream.on("error", (e: unknown) => emit.error(e as Error));
          return () => stream.dispose();
        }),
      ),
  });
```

> **Integration point (must resolve in repo):** `startOverlayCompletion` is a placeholder for the existing AI stream. Locate the chat completion entry the renderer already uses (search `src/lib/trpc/routers/chat-runtime-service` / `chat-service`) and call it with the overlay prompt (+ image as a vision message part). Keep provider selection on the existing zed gateway path. Add an `overlayCompletion.test.ts` around the adapter you write.

```ts
// src/lib/trpc/routers/overlay/index.ts
export { createOverlayRouter, setOverlayManager } from "./overlay";
```

- [ ] **Step 2: Register in the app router**

In `src/lib/trpc/routers/index.ts`, add `overlay: createOverlayRouter()` to the `createAppRouter` router map (alongside `window`, `notifications`, etc.), importing `createOverlayRouter` from `./overlay`.

- [ ] **Step 3: Typecheck**

Run: `cd apps/desktop && bun run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/lib/trpc/routers/overlay/ apps/desktop/src/lib/trpc/routers/index.ts
git commit -m "feat(desktop/overlay): overlay tRPC router (stealth, capture, ask stream)"
```

---

### Task 8: preload event channel for summon

**Files:**
- Modify: `src/preload/ipc-channels.ts`

- [ ] **Step 1: Add the typed channel**

```ts
export interface IpcEventChannels {
  "deep-link-navigate": [path: string];
  /** Fired by OverlayWindowManager.show() so the overlay route focuses input. */
  "overlay:summoned": [];
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/desktop && bun run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/preload/ipc-channels.ts
git commit -m "feat(desktop/overlay): typed overlay:summoned preload event channel"
```

---

### Task 9: Renderer overlay route + UI shell

**Files:**
- Create: `src/renderer/routes/overlay/route.tsx`
- Create: `src/renderer/routes/overlay/components/OverlayBar/OverlayBar.tsx` (+ `index.ts`, `OverlayBar.test.tsx`)

> Match the repo's TanStack Router file-route convention (see existing `src/renderer/routes/`). The overlay route must NOT mount the dashboard layout — it is a standalone, transparent, draggable bar. Reuse `@rox/ui` primitives and the existing trpc client (`window.ipcRenderer`/trpc-electron link already bootstrapped in `src/renderer`).

- [ ] **Step 1: Write a failing component test**

```tsx
// src/renderer/routes/overlay/components/OverlayBar/OverlayBar.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverlayBar } from "./OverlayBar";

describe("OverlayBar", () => {
  it("renders the prompt input and focuses on summon", () => {
    render(<OverlayBar onAsk={vi.fn()} onHide={vi.fn()} />);
    expect(screen.getByPlaceholderText(/спроси rox/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/desktop && bun run vitest run src/renderer/routes/overlay/components/OverlayBar/OverlayBar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the bar + route**

```tsx
// src/renderer/routes/overlay/components/OverlayBar/OverlayBar.tsx
import { useEffect, useRef, useState } from "react";

export interface OverlayBarProps {
  onAsk: (prompt: string, wantsScreen: boolean) => void;
  onHide: () => void;
}

/**
 * Compact, draggable (CSS -webkit-app-region: drag) overlay bar. Esc hides.
 * Token streaming/answer panel is added in Task 10's hook integration.
 */
export function OverlayBar({ onAsk, onHide }: OverlayBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    const onSummoned = () => inputRef.current?.focus();
    window.ipcRenderer.on("overlay:summoned", onSummoned);
    inputRef.current?.focus();
    return () => window.ipcRenderer.off("overlay:summoned", onSummoned);
  }, []);

  return (
    <div
      className="flex h-[88px] w-full items-center gap-2 rounded-2xl bg-black/60 px-4 backdrop-blur-xl"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onHide();
          if (e.key === "Enter" && value.trim()) {
            onAsk(value.trim(), e.metaKey); // Cmd+Enter = include screen
            setValue("");
          }
        }}
        placeholder="Спроси Rox… (Cmd+Enter — со скриншотом экрана)"
        className="flex-1 bg-transparent text-white outline-none select-text"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      />
    </div>
  );
}
```

```tsx
// src/renderer/routes/overlay/route.tsx
import { createFileRoute } from "@tanstack/react-router";
import { OverlayBar } from "./components/OverlayBar";
import { useOverlayAsk } from "./hooks/useOverlayAsk";

function OverlayScreen() {
  const { ask, hide } = useOverlayAsk();
  return <OverlayBar onAsk={ask} onHide={hide} />;
}

export const Route = createFileRoute("/overlay")({ component: OverlayScreen });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/desktop && bun run vitest run src/renderer/routes/overlay/components/OverlayBar/OverlayBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/routes/overlay/
git commit -m "feat(desktop/overlay): standalone /overlay route + compact bar UI"
```

---

### Task 10: useOverlayAsk hook — capture + stream wiring

**Files:**
- Create: `src/renderer/routes/overlay/hooks/useOverlayAsk/useOverlayAsk.ts` (+ `index.ts`, `.test.ts`)

> Calls the overlay tRPC router: `captureScreen` (when `wantsScreen`), then subscribes to `ask`. Use the same trpc-electron client the rest of the renderer uses (import the configured client; do not create a new link). Append tokens to local state; on `done`, stop.

- [ ] **Step 1: Write a failing test** (mock the trpc client)

```ts
// src/renderer/routes/overlay/hooks/useOverlayAsk/useOverlayAsk.test.ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("renderer/lib/trpc", () => ({
  trpcClient: {
    overlay: {
      captureScreen: { query: vi.fn(async () => ({ granted: true, pngBase64: "AAA" })) },
      hide: { mutate: vi.fn() },
      ask: { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) },
    },
  },
}));

import { useOverlayAsk } from "./useOverlayAsk";

describe("useOverlayAsk", () => {
  it("captures the screen when wantsScreen is true", async () => {
    const { trpcClient } = await import("renderer/lib/trpc");
    const { result } = renderHook(() => useOverlayAsk());
    await act(async () => result.current.ask("hi", true));
    expect(trpcClient.overlay.captureScreen.query).toHaveBeenCalled();
    expect(trpcClient.overlay.ask.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "hi", imagePngBase64: "AAA" }),
      expect.any(Object),
    );
  });
});
```

> Adjust the `vi.mock` path to the real trpc client module in this repo (find it under `src/renderer/lib` / `src/renderer/providers`). The test documents the contract; align the import to reality before running.

- [ ] **Step 2: Implement the hook**

```ts
// src/renderer/routes/overlay/hooks/useOverlayAsk/useOverlayAsk.ts
import { useCallback, useRef, useState } from "react";
import { trpcClient } from "renderer/lib/trpc"; // align to real path

export function useOverlayAsk() {
  const [answer, setAnswer] = useState("");
  const subRef = useRef<{ unsubscribe: () => void } | null>(null);

  const ask = useCallback(async (prompt: string, wantsScreen: boolean) => {
    setAnswer("");
    let imagePngBase64: string | null = null;
    if (wantsScreen) {
      const shot = await trpcClient.overlay.captureScreen.query();
      imagePngBase64 = shot.granted ? shot.pngBase64 : null;
    }
    subRef.current?.unsubscribe();
    subRef.current = trpcClient.overlay.ask.subscribe(
      { prompt, imagePngBase64 },
      {
        onData: (evt: { type: "token" | "done"; text?: string }) => {
          if (evt.type === "token" && evt.text) setAnswer((a) => a + evt.text);
        },
      },
    );
  }, []);

  const hide = useCallback(() => {
    void trpcClient.overlay.hide.mutate();
  }, []);

  return { ask, hide, answer };
}
```

- [ ] **Step 3: Run test → align mock path → PASS**

Run: `cd apps/desktop && bun run vitest run src/renderer/routes/overlay/hooks/useOverlayAsk/useOverlayAsk.test.ts`
Expected: PASS once the trpc client import path matches the repo.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/routes/overlay/hooks/
git commit -m "feat(desktop/overlay): useOverlayAsk — capture + stream answer wiring"
```

---

### Task 11: Push-to-talk (reuse useDictation)

**Files:**
- Modify: `src/renderer/routes/overlay/components/OverlayBar/OverlayBar.tsx`

> Reuse the existing `useDictation` hook (`src/renderer/lib/voice/useDictation/useDictation.ts`). Hold a mic button (or a key, e.g. hold `Cmd`) to record; on release, transcribe and feed the text into `onAsk`. Do NOT build a new STT.

- [ ] **Step 1: Add a mic affordance bound to useDictation**

```tsx
// inside OverlayBar.tsx — add near the input
import { useDictation } from "renderer/lib/voice/useDictation"; // align to real export

// const { isRecording, start, stop } = useDictation({ onText: (t) => onAsk(t, false) });
// <button onMouseDown={start} onMouseUp={stop} className="..." style={{ WebkitAppRegion: "no-drag" }}>🎙</button>
```

> Inspect `useDictation`'s real signature/return (it wraps `getUserMedia({audio:true})`) and bind its transcript callback to `onAsk`. Add a `OverlayBar` test asserting the mic button calls `start`/`stop`.

- [ ] **Step 2: Typecheck + test**

Run: `cd apps/desktop && bun run typecheck && bun run vitest run src/renderer/routes/overlay/`
Expected: exit 0 / PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/routes/overlay/
git commit -m "feat(desktop/overlay): push-to-talk via existing useDictation"
```

---

### Task 12: Settings toggle + permission gate + smoke/visual proof

**Files:**
- Modify: settings surface near `src/renderer/.../settings/permissions/PermissionsSettings.tsx`
- Manual: run desktop, summon overlay, verify stealth

- [ ] **Step 1: Add settings controls**

Add to the settings UI: (a) «Overlay-ассистент: вкл/выкл», (b) «Stealth (скрывать от записи экрана)» → calls `trpcClient.overlay.setStealth`, (c) summon hotkey display + a warning row when `overlayShortcutOk === false`, (d) a «Доступ к записи экрана» status/request button reusing the existing permission flow. RU labels (matches command-palette localization).

- [ ] **Step 2: Typecheck + lint (gate before any push)**

Run: `cd apps/desktop && bun run typecheck` then from repo root `bun run lint < /dev/null`
Expected: both exit 0. Fix all Biome warnings (CI treats warnings as errors — AGENTS.md rule 7).

- [ ] **Step 3: Manual smoke (macOS)**

```
bun run dev            # from repo root (launches desktop among others)
# 1. Press Cmd+\  → overlay bar appears on top, even over a fullscreen app.
# 2. Type a question, Enter → answer streams in.
# 3. Cmd+Enter → screenshot is included (grant Screen Recording if prompted).
# 4. Start a screen recording / Zoom share → overlay is NOT visible in the capture (stealth).
# 5. Esc or Cmd+\ → overlay hides.
```

- [ ] **Step 4: Visual proof**

Capture evidence per repo policy (Playwright/Peekaboo): screenshot of the overlay over a fullscreen app, and a screen-recording frame showing the overlay absent from the capture (proves `setContentProtection`). Save to the evidence path; attach to the PR.

- [ ] **Step 5: Final commit**

```bash
git add apps/desktop/src/renderer
git commit -m "feat(desktop/overlay): settings toggle, stealth + permission gating, smoke proof"
```

---

## Часть 3 — Риски, лицензия, этика

- **Лицензия:** не копировать код из `~/Projects/pluely` (GPL-3.0). Разрешено только смотреть UX/поведение и реализовывать с нуля на Electron API. Это держит desktop Rox под его текущей лицензией. Идеи провайдера zed уже воспроизведены независимо.
- **Этика/ToS (двойное назначение):** `setContentProtection(true)` прячет overlay от screen-share/записи — это явный «cloaking», отмеченный риском в roadmap (`plans/rox-superapp-roadmap-and-design.md:48`). Решение C1 (stealth по умолчанию) — осознанный выбор владельца; в настройках дать честную формулировку и тоггл. Не позиционировать как инструмент обмана на собеседованиях в маркетинге.
- **Производительность summon:** route-based overlay (A1) тянет общий бандл. Если холодный первый summon >300-500мс — вынести в отдельный renderer entry (A2) follow-up'ом.
- **Безопасность захвата экрана:** PNG экрана уходит в AI-gateway. Не логировать кадры, не писать на диск; передавать в памяти. Уважать `getMediaAccessStatus`.
- **Мульти-монитор:** MVP берёт первый screen source. Таргетинг активного дисплея — follow-up.

## Часть 4 — Verification gates (Done = всё зелёное + пруф)

1. `cd apps/desktop && bun run typecheck` → exit 0.
2. `cd apps/desktop && bun run vitest run src/main/windows/overlay src/main/lib/overlay-shortcut src/lib/trpc/routers/overlay src/renderer/routes/overlay` → все PASS.
3. `bun run lint < /dev/null` (repo root) → exit 0, ноль Biome-warnings.
4. Ручной smoke (Task 12 Step 3) пройден.
5. Visual proof: overlay поверх fullscreen + отсутствие в записи экрана — приложены к PR.

## Execution Handoff

Implement via `superpowers:subagent-driven-development` (fresh subagent per task, two-stage review) — recommended — or `superpowers:executing-plans` (inline, batch with checkpoints). Tasks 1-2, 4, 6 are pure/testable and can run first in parallel; Tasks 3, 5, 7-11 have ordering deps (manager → main wiring → router → renderer). Before any push: typecheck + lint green (AGENTS.md rule 7), plan moves to `plans/done/` once shipped (rule 6).
