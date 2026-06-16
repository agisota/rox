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
  - `types.ts` — `AppearanceSettings` (расширение текущего `appearanceState`):
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
  - `WallpaperLayer` — фиксированный фон z-index под контентом, crossfade при смене `src`.
    Принимает текущий `wallpaperId` + список, сам гоняет таймер ротации (через проп-интервал).

### Desktop (слайс №1)

- **Ассеты:** `apps/desktop/src/renderer/assets/wallpapers/` (+ оптимизированные webp/jpg).
- **Persist:** расширить `appState.data.appearanceState` новыми полями; добавить
  мутации `window.setWallpaper` / расширить `setGlass` или единый `setAppearance`.
- **Boot:** в `index.tsx` после `getAppearance` применять обои (рендер `WallpaperLayer`)
  и стекло (уже есть).
- **Глобальный фон:** смонтировать `WallpaperLayer` в authenticated-layout, чтобы
  обои были общим фоном; ключевые поверхности (sidebar, карточки, хедер, диалоги)
  перевести на `glass-panel`, чтобы фон просвечивал.
- **Экран-цитата:**
  - *Старт:* показать `QuoteScreen` поверх до готовности роутера/первых данных.
  - *Переходы:* подключить к pending-состоянию TanStack Router (порог ~300–400 мс,
    чтобы не мигало на быстрых переходах).
  - *Режим «фокуса»:* команда в Command Palette + хоткей — полноэкранный `QuoteScreen`
    с авто-сменой цитат, закрытие по Esc/клику.
- **Настройки:** новые секции в `AppearanceSettings`:
  - `WallpaperSection` — выбор обоев (превью-сетка), тумблер авто-смены, интервал.
  - `LoadingScreenSection` — тумблер экрана-цитаты, предпросмотр.
  - (стекло — уже есть `GlassSection`).
- **Пресет «Glass»:** кнопка/пресет, который разом включает стекло + обои + цитаты.

### Web (слайс №2)

- Аналог `applyGlass` на web + провайдер настроек (tRPC `user.appearanceSettings`,
  таблица в `packages/db`, см. `profiles.ts`).
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

## Открытые вопросы

- Финальный набор цитат и изображений (нужны лицензионно-чистые ассеты/исходники).
- Точные пороги показа на переходах, чтобы не было мигания.
- Нужна ли синхронизация выбора между устройствами (web↔desktop) с первого слайса
  или достаточно локального persist на desktop.
