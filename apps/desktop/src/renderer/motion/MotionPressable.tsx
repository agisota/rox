import { Pressable, type PressableProps } from "./Pressable";

/**
 * Button-flavored alias of the case-001 `Pressable` primitive (case 007 / PR-07).
 *
 * The shared `@rox/ui` Button is a framer-motion-free Radix-Slot/cva component,
 * so the hover/tap/focus motion for shell controls lives here in the desktop
 * layer. `Pressable` already exposes the exact contract this case needs —
 * gated `whileHover` / `whileTap` / `whileFocus`, a calm branch when motion or
 * the button is disabled, `forwardRef` so Radix `asChild`/`TooltipTrigger` can
 * attach refs and handlers — so `MotionPressable` specializes it for buttons
 * instead of re-deriving the animation (GUARDRAIL: reusable component, not a
 * scattered one-off). Use directly, or through `<Button asChild>` so Button's
 * `<Slot>` merges its cva classes onto the motion element.
 */
export type MotionPressableProps = PressableProps;

export const MotionPressable = Pressable;
