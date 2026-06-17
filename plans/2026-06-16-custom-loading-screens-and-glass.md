# Кастомные экраны ожидания, обои и «стеклянная» тема

> Статус: draft / design — собираем по вертикальным слайсам. Платформа №1 — **desktop** (Electron).

## Цель

Заменить стандартные крутящиеся спиннеры на кинематографичные экраны ожидания с
мотивационными цитатами, добавить фон-обои с авто-сменой (~каждые N минут) и
свести всё в опциональную **«стеклянную» тему** (glassmorphism / liquid glass),
сквозь панели которой просвечивают обои.

Референсы пользователя: тёмные кадры с цитатами («Success is a decision»,
«Make progress or make excuses») как заставки; стеклянный UI поверх обоев
(FlowHire / Linda Agent / Wix / Perplexity Comet).

## Решения (из обсуждения)

- **Платформа:** desktop в первую очередь, затем перенос общего слоя на web/mobile.
- **Контент:** курируемый пак цитат и изображений, хранится в репозитории.
- **Триггеры экрана-цитаты:** старт приложения, переходы между страницами, отдельный режим «фокуса».
- **Стекло:** опциональная тема (вкл/выкл), тёмный вид по умолчанию не меняется.

## Что уже есть (переиспользуем)

- **Стекло на desktop полностью подключено:**
  - CSS: `.glass` / `.glass-panel` на переменных `--surface-opacity` / `--backdrop-blur`
    (`packages/ui/src/globals.css`, зеркало в `apps/desktop/src/renderer/globals.css`).
  - Применение: `apps/desktop/src/renderer/stores/theme/utils/glass.ts` (`applyGlass`).
  - Persist: `appState.data.appearanceState = { glassEnabled, windowOpacity }`
    через `window.getAppearance` / `window.setGlass`
    (`apps/desktop/src/lib/trpc/routers/window.ts`), нативная вибрация окна —
    `main/lib/glass-window.ts` (`applyGlassToWindow`).
  - Boot-синхронизация: `apps/desktop/src/renderer/index.tsx`.
  - UI: `…/settings/appearance/components/AppearanceSettings/components/GlassSection`.
- Анимации: `framer-motion` уже в зависимостях (плавные fade/crossfade).
- Запасной фон без фото: `packages/ui/src/components/mesh-gradient.tsx`.
- Тема forced-dark на web; на desktop — богатый theme store
  (`apps/desktop/src/renderer/stores/theme/store.ts`).

Вывод: «стекло» делать заново не нужно. Не хватает **обоев** (фоновый слой) и
**экранов-цитат**. Тема «Glass» = существующее стекло + новый слой обоев.

## Архитектура (мультиплатформенно)

Общее ядро кладём в shared-пакеты, платформенную обвязку — в приложения.

### Общий слой (переиспользуется всеми платформами)

- `packages/shared/src/appearance/`
  - `quotes.ts` — курируемый массив `{ id, text, author?, emphasis? }`.
  - `wallpapers.ts` — манифест `{ id, name, src, thumb, tone: "dark"|"light", credit? }`.
  - `types.ts` — `AppearanceSettings` (расширение текущего `appearanceState`). Для
    слайса №1 **все поля локальны** (вариант 2a, desktop `appState`); граница
    «локальное ↔ синкаемое» фиксируется при выборе 2b (см. раздел Web). Форма:

    ```ts
    interface AppearanceSettings {
      glassEnabled: boolean;
      windowOpacity: number;           // уже есть
      wallpaperId: string | null;      // null = нет обоев
      wallpaperAutoRotate: boolean;
      wallpaperRotateSeconds: number;  // дефолт 120
      quoteLoaderEnabled: boolean;
    }
    ```

  - `selectQuote.ts` / `selectWallpaper.ts` — детерминированный/случайный выбор без повтора подряд.

- `packages/ui/src/components/` (чистые презентационные, без платформенных API)
  - `QuoteScreen` — полноэкранный кадр: фон (обои или градиент) + затемнение + цитата,
    `framer-motion` crossfade между цитатами. Пропсы: `quote`, `backgroundSrc?`, `variant`.
  - `WallpaperLayer` — **чистый** фиксированный фон z-index под контентом, crossfade при
    смене `src`. Принимает только `currentSrc` (и опц. `prevSrc` для перехода) — **никакого
    собственного таймера/состояния**. Таймер ротации и текущий индекс живут в глобальном
    сторе (см. ниже `wallpaperStore`), иначе обои сбрасывались бы на каждом ремоунте
    (навигация, React StrictMode double-mount, HMR).

### Desktop (слайс №1)

- **Доставка ассетов (решение):** для слайса №1 — **Option A, бандл** небольшого
  стартового пака (3–5 webp) в `apps/desktop/src/renderer/assets/wallpapers/`: просто,
  работает офлайн, предсказуемо. НО манифест `wallpapers.ts` сразу проектируем с полем
  `src: { kind: "bundled" | "remote"; path | url }`, чтобы позже без переписывания
  перейти на **Option B — ленивую докачку** по образцу существующего
  `apps/desktop/src/main/lib/preinstall-catalog/` (скачивание из GitHub Release/CDN в
  `~/rox/wallpapers/` при первом запуске). Это снимает раздувание инсталлятора при росте
  пака и добавление обоев без релиза. Option C (только CDN-URL) отклонён для desktop из-за
  оффлайна и CORS/CSP в рендерере.
  - *Tradeoff:* бандл добавляет ~единицы–десятки МБ к инсталлятору при 2–4 МБ/изображение —
    поэтому пак на старте маленький, дальше — preinstall-паттерн.
- **`wallpaperStore` (глобальный):** в `apps/desktop/src/renderer/stores/theme/` — владеет
  `currentWallpaperId`, индексом ротации и таймером (`setInterval` на
  `wallpaperRotateSeconds`), переживает навигацию. `WallpaperLayer` лишь читает `currentSrc`.
- **Persist:** расширить `appState.data.appearanceState` новыми полями; добавить
  мутации `window.setWallpaper` / расширить `setGlass` или единый `setAppearance`.
- **Boot:** в `index.tsx` после `getAppearance` применять обои (рендер `WallpaperLayer`)
  и стекло (уже есть).
- **Глобальный фон:** смонтировать `WallpaperLayer` в authenticated-layout, чтобы
  обои были общим фоном; ключевые поверхности (sidebar, карточки, хедер, диалоги)
  перевести на `glass-panel`, чтобы фон просвечивал.
- **Экран-цитата:**
  - *Старт:* показать `QuoteScreen` поверх до готовности роутера/первых данных.
  - *Переходы:* подключить к pending-состоянию TanStack Router, но **дебаунсить видимость,
    а не рендер** — иначе на медленном соединении (router «висит» 5+ с) экран мелькнёт.
    Паттерн:

    ```tsx
    const [showQuote, setShowQuote] = useState(false);
    useEffect(() => {
      if (!isPending) { setShowQuote(false); return; }
      const id = setTimeout(() => setShowQuote(true), 350);
      return () => clearTimeout(id);
    }, [isPending]);
    ```

    Так быстрые переходы (<350 мс) не показывают цитату вовсе, а долгие — показывают.
  - *Режим «фокуса»:* команда в Command Palette + хоткей — полноэкранный `QuoteScreen`
    с авто-сменой цитат, закрытие по Esc/клику.
- **Настройки:** новые секции в `AppearanceSettings`:
  - `WallpaperSection` — выбор обоев (превью-сетка), тумблер авто-смены, интервал.
  - `LoadingScreenSection` — тумблер экрана-цитаты, предпросмотр.
  - (стекло — уже есть `GlassSection`).
- **Пресет «Glass»:** кнопка/пресет, который разом включает стекло + обои + цитаты.

### Web (слайс №2)

> **Блокер до старта слайса №2 (продуктовое решение):** сейчас desktop хранит
> appearance локально в Electron-`appState` (JSON, `window.ts`), а web потребует
> облако. Нужно явно выбрать ДО реализации web:
> - **2a (рекомендую для старта):** appearance **локально на каждой платформе** —
>   desktop = `appState`, web = `localStorage`/per-user. Быстро, без синка; обои
>   между web и desktop могут различаться (осознанно).
> - **2b:** единый источник правды — новая таблица `user_appearance_settings` в
>   `packages/db` + tRPC `user.appearanceSettings` + Electric-sync, desktop тоже
>   читает из облака. Даёт единый выбор на всех устройствах, но это отдельная работа.
>
> Важно: форма `AppearanceSettings` из `packages/shared` единая в обоих вариантах —
> это позволяет начать с 2a и перейти на 2b без переписывания компонентов.
> (NB: расширять Electric-синкаемый `user_profile` из `0072_add_user_profile.sql`
> не стоит — для appearance заводим отдельную таблицу, чтобы не раздувать общий профиль.)

- Аналог `applyGlass` на web + провайдер настроек (источник — по решению 2a/2b выше).
- `WallpaperLayer` в корневом `apps/web/src/app/layout.tsx` за `{children}`.
- `QuoteScreen` через `app/loading.tsx` + Suspense fallback.
- Ассеты: `apps/web/public/wallpapers/` (или CDN через `NEXT_PUBLIC_*`).

### Mobile (слайс №3, опционально)

- RN: `expo-blur` для стекла, `Image` фон, `react-native-reanimated` для crossfade.
- Те же `quotes.ts` / `wallpapers.ts` из `packages/shared`.

## Порядок работ

1. Общий слой: `quotes.ts`, `wallpapers.ts`, `types.ts`, выборка — `packages/shared`.
2. Презентация: `QuoteScreen`, `WallpaperLayer` — `packages/ui`.
3. Desktop persist: расширить `appearanceState` + tRPC + boot-применение.
4. Desktop фон + перевод поверхностей на `glass-panel`.
5. Desktop экран-цитата: старт → переходы → режим «фокуса».
6. Desktop настройки: `WallpaperSection`, `LoadingScreenSection`, пресет «Glass».
7. Web-перенос, затем mobile.

## Cinematic-обои без бинарных ассетов (реализовано)

Вместо ожидания лицензионно-чистого фотопака `gradient`-обои теперь рендерятся
как **кинематографичные сцены**, а не плоский mesh. `CinematicGradient`
(`packages/ui/src/components/CinematicGradient/`) слоит поверх базового mesh:
сцену света (`aurora` / `nebula` / `dunes` / `horizon` / `calm`, поле
`Wallpaper.scene`), плёночное зерно (overlay-blend, inline SVG) и виньетку.
Полностью офлайн, нулевой вес инсталлятора, никакого лицензионного риска;
анимации — только transform/opacity и выключаются при `prefers-reduced-motion`.
Манифест `bundled` / `remote` остаётся для будущего фотопака без изменений
потребителей. Тема «liquid glass» углублена: `saturate()` бэкдропа в glass-режиме
+ зеркальная кромка панелей (`.glass .glass-panel`, зеркало в desktop globals).

## Открытые вопросы

- Опциональный лицензионно-чистый фотопак поверх процедурных сцен (если захотим
  реальные фотографии в дополнение к cinematic-градиентам).
- Какой из вариантов синхронизации (2a локально / 2b облако+Electric) выбираем —
  решение нужно до старта слайса №2 (см. раздел Web). Для слайса №1 (desktop) это
  не блокер: используем локальный `appState`.
