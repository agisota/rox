# UI Polish — Motion / Animation Notes (2026-06-08)

Notes on where Motion.dev-style animation applies in the `ui-polish` epic, what
animation already exists, and a recommendation for keeping it consistent.

## Existing animation usage

- **Dialogs** (`packages/ui/src/components/ui/dialog.tsx`): overlay and content
  already animate via `tailwindcss-animate` data-state utilities
  (`data-[state=open]:animate-in`, `fade-in-0`, `zoom-in-95`). The new opt-in
  `blur` prop adds `backdrop-blur-sm` to the overlay; the existing fade applies
  to the blur automatically (the overlay fades in/out as a unit).
- **Automations dialog** (`CreateAutomationDialog.tsx:213`): the compose ↔
  gallery view swap already animates height via a CSS `transition-[height]`.
  No JS animation library is involved.

## Where motion applies in this epic

1. **Automations compose ↔ gallery height transition** — already a CSS
   `transition-[height]`. Leave as-is; it is cheap and jank-free. Do **not**
   replace with a JS spring unless we need gesture-driven resizing.
2. **Template scroll-row (new)** — entrance + hover on the horizontal
   `TemplateScrollRow` cards. Subtle: a short fade/slide-in on mount and a
   `hover:scale-[1.02]` / shadow lift on hover. Stagger is optional and should
   stay under ~200ms total so the row feels responsive.
3. **Workspace preset card selection (new)** — selected state should animate the
   check/border with a quick (~120ms) transition rather than snapping, so
   multi-select feels tactile.
4. **Dialog overlay fade/blur** — covered by the existing data-state fade plus
   the new `backdrop-blur-sm`. No extra work needed.

## Recommendation

Prefer **one** approach rather than ad-hoc per-component imports:

- For simple state transitions (hover, selection, height, fade) keep using
  **Tailwind transitions + `tailwindcss-animate`** data-state utilities. They are
  already in the design system, add zero bundle weight, and match the dialog
  primitives.
- If/when we need orchestrated, interruptible, or gesture-driven motion (e.g.
  draggable cards, shared-element transitions), introduce a **single shared
  wrapper** (e.g. a `Motion`/`AnimatedPresence` component in `packages/ui`)
  around `motion`/`framer-motion` and import it from there. Avoid scattering
  `motion.div` imports across feature code — it fragments the motion vocabulary
  and bloats bundles.

Net: this epic needs **no new animation dependency**. The template scroll-row and
preset cards can ship with Tailwind transitions; reserve a shared Motion wrapper
for a future epic that genuinely needs spring/gesture physics.
