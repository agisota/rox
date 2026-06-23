/**
 * Helpers for the desktop push-to-talk GLOBAL shortcut accelerator.
 *
 * Unlike the in-app hotkey registry (which matches `event.code` / `event.key`
 * chords inside the focused window), push-to-talk uses an Electron
 * `globalShortcut`, whose accelerators are a distinct, OS-level string format
 * (e.g. "CommandOrControl+Shift+M"). These helpers translate a recorded
 * keystroke into that native format and back into a readable label, so the
 * Settings surface can record + display it without going through the
 * window-scoped chord pipeline.
 *
 * @see https://www.electronjs.org/docs/latest/api/accelerator
 */

/** Modifier keys that may not stand alone as an accelerator's final key. */
const MODIFIER_KEYS = new Set([
	"Control",
	"Meta",
	"Alt",
	"Shift",
	"AltGraph",
	"CapsLock",
	"Fn",
	"FnLock",
	"Hyper",
	"Super",
	"OS",
]);

/**
 * Map a `KeyboardEvent.key` to an Electron accelerator key token. Returns null
 * for keys that cannot be the final key of an accelerator (bare modifiers,
 * dead keys, etc.).
 */
function toAcceleratorKeyToken(event: KeyboardEvent): string | null {
	const { key, code } = event;

	if (MODIFIER_KEYS.has(key)) return null;

	// Letters / digits: prefer the physical code so the binding is layout-stable
	// and matches what Electron registers regardless of the active layout.
	const letter = /^Key([A-Z])$/.exec(code);
	if (letter) return letter[1];
	const digit = /^Digit([0-9])$/.exec(code);
	if (digit) return digit[1];

	// Function keys.
	if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key;

	switch (key) {
		case " ":
			return "Space";
		case "ArrowUp":
			return "Up";
		case "ArrowDown":
			return "Down";
		case "ArrowLeft":
			return "Left";
		case "ArrowRight":
			return "Right";
		case "Escape":
			return "Esc";
		case "Enter":
			return "Return";
		case "Tab":
			return "Tab";
		case "Backspace":
			return "Backspace";
		case "Delete":
			return "Delete";
		case "+":
			return "Plus";
		default:
			break;
	}

	// Single printable character (punctuation, etc.).
	if (key.length === 1) return key.toUpperCase();

	return null;
}

/**
 * Build an Electron accelerator string from a recorded keystroke, or null when
 * the keystroke is not a valid accelerator (e.g. a bare modifier, or a key
 * pressed with no modifier — a global shortcut without a modifier is rejected
 * to avoid hijacking ordinary typing system-wide).
 */
export function eventToPushToTalkAccelerator(
	event: KeyboardEvent,
): string | null {
	const keyToken = toAcceleratorKeyToken(event);
	if (!keyToken) return null;

	const parts: string[] = [];
	// `CommandOrControl` maps to ⌘ on macOS and Ctrl elsewhere — the portable
	// primary modifier.
	if (event.metaKey || event.ctrlKey) parts.push("CommandOrControl");
	if (event.altKey) parts.push("Alt");
	if (event.shiftKey) parts.push("Shift");

	// Require at least one modifier for a global shortcut.
	if (parts.length === 0) return null;

	parts.push(keyToken);
	return parts.join("+");
}

const ACCELERATOR_TOKEN_LABELS: Record<string, string> = {
	CommandOrControl: "⌘/Ctrl",
	CmdOrCtrl: "⌘/Ctrl",
	Command: "⌘",
	Cmd: "⌘",
	Control: "Ctrl",
	Ctrl: "Ctrl",
	Alt: "Alt",
	Option: "⌥",
	Shift: "⇧",
	Super: "Super",
	Meta: "Meta",
	Return: "↵",
	Esc: "Esc",
	Space: "Space",
	Up: "↑",
	Down: "↓",
	Left: "←",
	Right: "→",
};

/** Human-readable label for an accelerator string, for display in the UI. */
export function formatPushToTalkAccelerator(accelerator: string): string[] {
	return accelerator
		.split("+")
		.map((token) => ACCELERATOR_TOKEN_LABELS[token] ?? token);
}
