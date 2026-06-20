# Aerial Video Wallpapers — Provenance & License Manifest (WS-N / N5)

This file records the legal provenance of the aerial video wallpapers shipped in
the Rox desktop wallpaper pack. Each clip is referenced from
`packages/shared/src/appearance/wallpapers.ts` as a `kind: "video"`
`WallpaperSource` and rendered by `packages/ui/src/components/WallpaperLayer`.

## How wallpapers are sourced

- The `WallpaperSource` union supports `{ kind: "video"; src; poster? }`. `src`
  is a bundled path or a remote URL to a **muted, seamless loop** (mp4/webm);
  `poster` is the still shown before load and as the reduced-motion fallback.
- Chosen clips are downloaded, transcoded to web-friendly H.264 (+ optional 10–20s
  seamless loop), and hosted in the private artifact store under
  `s3://agent-artifacts/media/rox-aerials/...`, then referenced via `kind: "video"`.
  A small subset may instead be bundled.
- Record the **per-clip license at download time** here — do not trust only the
  source-level summary. Keep the `credit` field on each `Wallpaper` even when
  attribution is not strictly required.

## License key

| Source | Terms | Attribution | Safe to ship? |
|---|---|---|---|
| Pixabay Content License | Free commercial + personal; no resale as-is | No | Yes (CC0-like) |
| Pexels License | Free commercial/personal; no selling unmodified; some clips tagged CC0 | No | Yes |
| Mixkit Free Stock Video | Free commercial/personal; no standalone redistribution | No | Yes (embedded OK) |
| Coverr License | Royalty-free, no watermark, commercial OK; pick human-shot, not AI | No | Yes |
| Internet Archive | Per-item — only PD / CC0 / CC-BY items | Varies | Only if verified per-item |
| Dareful | CC-BY 4.0 | **Required** | Backup only (prefer no-attribution) |

> Pexels License also forbids identifying depicted people and selling unmodified
> copies — fine for embedded wallpaper. Internet Archive "nature film" items are
> frequently still copyrighted (e.g. `archive.org/details/castiacr_000004` =
> "Rights are owned by Deborah Anderson-Phillips" — DO NOT USE); verify each.

## Curated catalog (researched live 2026-06-20)

Rows 16–19 are **collection landing pages** — pick 3–5 human-shot clips from each
(skip clearly AI-labeled ones). Internet Archive is intentionally excluded from
the shortlist; Dareful is a CC-BY backup only.

| # | Title | Source URL | License | Max res |
|---|-------|-----------|---------|---------|
| 1 | Drone Pullback Over Lake | https://mixkit.co/free-stock-video/drone-pullback-over-lake-101513/ | Mixkit Free | 4K |
| 2 | Drone Shot Over Hills and Dock | https://mixkit.co/free-stock-video/drone-shot-over-hills-and-dock-101506/ | Mixkit Free | 4K |
| 3 | Aerial Zoom Over Cloudy Hills | https://mixkit.co/free-stock-video/aerial-zoom-over-cloudy-hills-101508/ | Mixkit Free | 4K |
| 4 | Majestic Hills and Sky Reflections | https://mixkit.co/free-stock-video/majestic-hills-and-sky-reflections-101510/ | Mixkit Free | 4K |
| 5 | Dynamic Drone Ride Over an Isthmus | https://mixkit.co/free-stock-video/dynamic-drone-ride-over-an-isthmus-44401/ | Mixkit Free | 1080p |
| 6 | Drone, Nature, Landscape | https://pixabay.com/videos/drone-nature-landscape-air-photo-23334/ | Pixabay | 1080p |
| 7 | Mountains, Peaks, Clouds (sunset sky) | https://pixabay.com/videos/mountains-peaks-clouds-sunset-sky-347325/ | Pixabay | 4K |
| 8 | Mountains, Clouds, Mountain Landscape | https://pixabay.com/videos/mountains-clouds-mountain-landscape-138276/ | Pixabay | 4K |
| 9 | Aerial View, Cloudscape, Flying | https://pixabay.com/videos/aerial-view-cloudscape-flying-110911/ | Pixabay | 4K |
| 10 | Sunrise, Drone Footage, Cinematic Nature | https://pixabay.com/videos/sunrise-drone-footage-286424/ | Pixabay | 1080×1920 |
| 11 | Africa, South Africa, Nature (Cape Town drone) | https://pixabay.com/videos/africa-south-africa-nature-capetown-302173/ | Pixabay | 4K |
| 12 | Aerial View, Beach, Blue Water (Porto Santo) | https://pixabay.com/videos/aerial-view-beach-blue-water-carbon-344382/ | Pixabay | 4K |
| 13 | Mountain Valley Landscape | https://coverr.co/videos/mountain-valley-landscape-mni5sqk3vo | Coverr | 4K-ready |
| 14 | Lush Green Mountain Pathway | https://coverr.co/videos/lush-green-mountain-pathway | Coverr | 16:9 |
| 15 | A View of Nature (aerial trees) | https://coverr.co/videos/a-view-of-nature-sjf7wllzip | Coverr | 16:9 |
| 16 | Coverr — Aerial Videography collection | https://coverr.co/stock-video-footage/aerial | Coverr | 4K |
| 17 | Coverr — Drone Footage collection | https://coverr.co/stock-video-footage/drone-footage | Coverr | 4K |
| 18 | Coverr — Natural Landscape collection | https://coverr.co/stock-video-footage/natural-landscape | Coverr | 4K |
| 19 | Coverr — Loopable backgrounds collection | https://coverr.co/stock-video-footage/loopable | Coverr | 4K |
| 20 | Drone Footage of a Verdant Countryside (sunrise) | https://www.pexels.com/video/drone-footage-of-a-verdant-countryside-10433807/ | Pexels | 4K |
| 21 | Serene Aerial View of Lush Forest with Lake | https://www.pexels.com/video/serene-aerial-view-of-lush-forest-with-lake-30924280/ | Pexels | 4K |
| 22 | Aerial Drone Sunset Over Serene Lake | https://www.pexels.com/video/aerial-drone-sunset-over-serene-lake-31646048/ | Pexels | 4K |
| 23 | Aerial Video of Coastline (fog-covered isle) | https://www.pexels.com/video/aerial-video-of-coastline-854752/ | Pexels — CC0 (tagged) | 4K |
| 24 | Tranquil Aerial View of Evening Ocean Waves | https://www.pexels.com/video/tranquil-aerial-view-of-evening-ocean-waves-30322747/ | Pexels | 4K |
| 25 | Drone View of Serene Ocean Coastline at Sunset | https://www.pexels.com/video/drone-view-of-serene-ocean-coastline-at-sunset-37534879/ | Pexels | 4K |
| 26 | Cox's Bazar Ocean Waves Aerial View 4K | https://www.pexels.com/video/cox-s-bazar-ocean-waves-aerial-view-4k-36141533/ | Pexels | 4K |
| 27 | Aerial Sunrise over California Coastal Bay | https://www.pexels.com/video/aerial-sunrise-over-california-coastal-bay-36316920/ | Pexels | 4K |
| 28 | Serene Aerial View of Tranquil Beach (twilight) | https://www.pexels.com/video/serene-aerial-view-of-tranquil-beach-34627920/ | Pexels | 4K |
| 29 | Drone Footage of a Desert | https://www.pexels.com/video/drone-footage-of-a-desert-7895580/ | Pexels — "Free to use" | 4K |
| 30 | Expansive Aerial View of Desert Dunes in Peru (Huacachina) | https://www.pexels.com/video/expansive-aerial-view-of-desert-dunes-in-peru-35296751/ | Pexels | 4K |
| 31 | Aerial Footage of a City (skyline sunset) | https://www.pexels.com/video/aerial-footage-of-a-city-5879459/ | Pexels | 4K |
| 32 | Aerial Cape Town Cityscape at Sunset | https://www.pexels.com/video/city-landscape-mountains-sunset-4873247/ | Pexels | 4K |

## Shipped clips (filled in at transcode time)

| Wallpaper id | Title | Source URL | License | S3 URI |
|---|---|---|---|---|
| `aerial-demo-loop` | Видео-петля · демо | https://test-videos.co.uk/vids/bigbuckbunny/ (Big Buck Bunny) | CC-BY 3.0 (Blender Foundation) — **demo only, replace before ship** | — (remote demo) |

> The `aerial-demo-loop` entry in `wallpapers.ts` is a placeholder proving the
> `video` source renders end to end. Replace its `src` with a licensed,
> self-hosted seamless aerial loop (and record the row above) before shipping.
