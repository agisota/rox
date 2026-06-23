# Wallpapers & video backgrounds

Wallpapers are defined in `wallpapers.ts` as a static catalog (`WALLPAPERS`).
Each entry has an `id`, `name`, `tone` (`"light" | "dark"`, used to pick legible
foreground/quote colors), an optional `scene` (for `gradient` sources), and a
`source`.

## Source kinds (`WallpaperSource`, `types.ts`)

- `gradient` — zero-asset animated mesh gradient (`colors`: a 4-tuple). Works
  offline, no installer weight. Layered with a cinematic `scene`.
- `bundled` — an image shipped with the app (`path`).
- `remote` — an image fetched at runtime (`url`).
- `video` — a **looping background video** (Apple-TV-aerial style):
  `{ kind: "video"; src: string; poster?: string }`.

## Adding a video wallpaper

The `video` infrastructure is fully wired: the desktop `WallpaperLayer` renders
`<video autoPlay loop muted playsInline>`, the settings preview uses the poster
(or a neutral still), and reduced-motion users get the `poster` (or the paused
first frame). To add one:

```ts
{
  id: "coastline-aerial",
  name: "Побережье · аэросъёмка",
  source: {
    kind: "video",
    // App-served bundled asset OR a self-hosted/CDN URL:
    src: "/wallpapers/coastline-aerial.mp4",   // bundled
    // src: "https://cdn.example.com/aerials/coastline.mp4", // remote
    poster: "/wallpapers/coastline-aerial.jpg", // still shown before load + reduced-motion
  },
  tone: "dark",
},
```

### Assets

- **Bundled** videos go in `apps/desktop/src/resources/public/wallpapers/` and are
  referenced as `/wallpapers/<name>.mp4`. Use H.264 MP4 (broad support) or VP9
  WebM, **muted**, seamless loop, ideally ≤ ~15 s and reasonably compressed to
  keep installer weight down.
- **Remote** videos can live on a CDN you control.
- Always provide a `poster` still for a graceful first paint and a
  reduced-motion fallback.

### Licensing note

Apple's aerial screensavers are **copyrighted** — they can't be bundled or
hotlinked. Source loops from a license you hold (e.g. Pexels / Coverr free-for-
commercial, or your own footage) and either bundle them or self-host.

The shipped `aerial-demo-loop` entry points at a public CC-BY test clip purely to
demonstrate the feature end-to-end; replace it with licensed aerial loops.
