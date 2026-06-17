/**
 * Pure terminal-output extraction for the Agent Pipelines capture path.
 *
 * A terminal/CLI agent runs in a pty. Its raw scrollback is a byte ring buffer
 * (`Uint8Array[]`) carrying everything the shell painted: ANSI colour/cursor
 * escapes, OSC title/semantic-prompt sequences, the echoed command line, the
 * agent's actual output, and a trailing shell prompt. To thread a CLI agent's
 * answer into a pipeline's accumulating context we need the *meaningful tail* —
 * the agent's final output — as clean plain text.
 *
 * {@link extractTerminalOutputTail} is the pure core of that read-back: given a
 * raw buffer (bytes or already-decoded string) it
 *
 *   1. decodes bytes to UTF-8 (tolerant — never throws on partial codepoints),
 *   2. strips ANSI CSI / OSC / SS2-SS3 / single-char control escapes,
 *   3. drops the echoed prompt/command line(s) the shell printed back,
 *   4. trims trailing blank lines + a final shell-prompt line, and
 *   5. returns the last `maxLines` of meaningful content (bounded).
 *
 * It has no I/O and no host dependencies, so it is exhaustively unit-tested.
 * The live wiring (waiting for the `terminal:lifecycle` exit event, then
 * reading the session ring buffer) lives in `agent-run-capture.ts` behind a
 * typed port and feeds its bytes through this helper.
 */

export interface ExtractTerminalOutputTailOptions {
	/**
	 * The exact command string the host queued into the pty (see
	 * `buildAgentCommandString`). The shell echoes this back before running it;
	 * we strip those echoed line(s) so they don't leak into the captured output.
	 * Matching is whitespace-tolerant and line-oriented.
	 */
	echoedCommand?: string;
	/**
	 * Maximum number of meaningful (non-blank) trailing lines to return. Guards
	 * against threading a huge build log into the pipeline context. Defaults to
	 * {@link DEFAULT_MAX_TAIL_LINES}. Values < 1 are treated as 1.
	 */
	maxLines?: number;
	/**
	 * Drop a trailing shell-prompt line (e.g. `user@host:~/dir$`, `❯`, `$`, `%`,
	 * `#`) left painted after the agent process exited. Defaults to `true`.
	 */
	dropTrailingPrompt?: boolean;
}

/** Default cap on returned trailing lines. */
export const DEFAULT_MAX_TAIL_LINES = 40;

// ── ANSI / control-sequence stripping ──────────────────────────────────────
//
// Hand-rolled (the repo has no strip-ansi dep and hand-rolls its OSC 133 and
// mode-tracker scanners the same way). We cover the escape families a CLI agent
// realistically emits:
//
//   - CSI:  ESC [ … <final 0x40–0x7E>            (colours, cursor moves, SGR)
//   - OSC:  ESC ] … (BEL | ESC \)                (window title, OSC 133 prompts,
//                                                  hyperlinks)
//   - SS2/SS3 + other ESC-<single char> escapes  (charset, keypad, RIS, etc.)
//   - DCS/SOS/PM/APC: ESC (P|X|^|_) … ESC \       (rare; strip the whole string)
//   - lone C0 control bytes except \t and \n      (\r handled via CR collapse)

// biome-ignore lint/suspicious/noControlCharactersInRegex: terminal escape stripping requires matching C0/ESC control bytes by design.
const CSI_SEQUENCE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: OSC sequences are delimited by BEL or ST (ESC \) control bytes.
const OSC_SEQUENCE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: DCS/SOS/PM/APC strings are delimited by ST (ESC \).
const STRING_SEQUENCE = /\x1b[PX^_][^\x1b]*(?:\x1b\\)?/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matches ESC followed by a single intermediate/final byte (SS2/SS3, charset selects, RIS…).
const ESC_SINGLE = /\x1b[ -/]*[0-~]/g;
// Remaining lone C0 control bytes we don't want, excluding \t (0x09) and \n (0x0A).
// biome-ignore lint/suspicious/noControlCharactersInRegex: deliberately strips residual C0 control bytes from PTY output.
const RESIDUAL_C0 = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

/**
 * Decode a raw PTY buffer to a UTF-8 string. Accepts the byte ring buffer
 * (`Uint8Array[]`), a single `Uint8Array`, or an already-decoded string.
 * Tolerant: a partial trailing codepoint becomes U+FFFD rather than throwing.
 */
export function decodeTerminalBuffer(
	buffer: string | Uint8Array | readonly Uint8Array[],
): string {
	if (typeof buffer === "string") return buffer;
	const decoder = new TextDecoder("utf-8", { fatal: false });
	if (buffer instanceof Uint8Array) return decoder.decode(buffer);

	// Uint8Array[] — concatenate then decode once so multi-byte codepoints that
	// straddle chunk boundaries decode correctly.
	let total = 0;
	for (const chunk of buffer) total += chunk.byteLength;
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const chunk of buffer) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return decoder.decode(merged);
}

/** Strip ANSI / OSC / control escape sequences from already-decoded text. */
export function stripAnsi(text: string): string {
	return text
		.replace(OSC_SEQUENCE, "")
		.replace(STRING_SEQUENCE, "")
		.replace(CSI_SEQUENCE, "")
		.replace(ESC_SINGLE, "")
		.replace(RESIDUAL_C0, "");
}

/**
 * Collapse carriage-return overwrites. A pty progress line like
 * `10%\r50%\r100%` paints in place; on the wire each `\r` resets the column.
 * We keep only the final segment of each physical line so spinners/progress
 * bars don't smear into the captured text.
 */
function collapseCarriageReturns(line: string): string {
	if (!line.includes("\r")) return line;
	const segments = line.split("\r");
	// The last non-empty segment is what the user would see painted.
	for (let i = segments.length - 1; i >= 0; i--) {
		const segment = segments[i];
		if (segment !== undefined && segment !== "") return segment;
	}
	return "";
}

/** Normalise a command string to its comparable echoed lines (trimmed, non-empty). */
function commandEchoLines(command: string): string[] {
	const lines: string[] = [];
	for (const raw of command.split("\n")) {
		const normalized = raw.trim();
		if (normalized) lines.push(normalized);
	}
	return lines;
}

// A prompt prefix the shell paints before the command, e.g. `user@host:~/dir$ `,
// `➜  repo `, `❯ `, `$ `. Used to recognise — and strip — the prompt sigil that
// precedes an echoed command on the same physical line. Anchored to the start.
const PROMPT_PREFIX = /^[^\n]*?[$%#❯➜›»>]\s+$/;

// A residual shell prompt LINE left painted after the process exits. Two forms:
//   - a bare sigil:                      `$`  `%`  `#`  `❯`  `➜`  `>`
//   - a `…path$` / `…dir %` style line ending in a sigil with no real output.
// The sigil may abut a path with no space (`~/repo$`) or follow whitespace
// (`➜  dir`). Kept narrow + length-bounded so we never eat real agent prose.
const TRAILING_PROMPT = /[$%#❯➜›»>]\s*\S*\s*$/;

function looksLikePromptLine(line: string): boolean {
	const trimmed = line.trim();
	if (trimmed === "") return false;
	if (/^[$%#❯➜›»>]$/.test(trimmed)) return true;
	// `user@host…$` / `…dir %` style: short, no spaces in a way that reads as
	// prose, and ends in a prompt sigil (optionally + an unterminated token).
	if (trimmed.length <= 200 && TRAILING_PROMPT.test(trimmed)) return true;
	return false;
}

/**
 * Strip an echoed command from a single scrollback line. The shell echoes the
 * queued command back, either on its own line or appended to a prompt on the
 * SAME physical line (`user@host:~/repo$ claude --print '…'`); the agent's
 * output then starts on the NEXT line. So we only treat the command as echoed
 * when the line *ends with* it (suffix match) — mid-line matches are
 * coincidental and left alone. We:
 *   - return `null` when the prefix before the echoed command is empty or only
 *     a prompt (drop the whole echoed-command line), or
 *   - return the residual prefix text when other content precedes it (rare).
 * Returns the line unchanged when it does not end with an echoed command.
 */
function stripEchoedCommand(line: string, echoLines: string[]): string | null {
	const trimmedEnd = line.replace(/[ \t]+$/, "");
	for (const cmd of echoLines) {
		if (!trimmedEnd.endsWith(cmd)) continue;
		const before = trimmedEnd.slice(0, trimmedEnd.length - cmd.length);
		// Prefix is blank or only a prompt → the line was just the echoed command.
		if (before.trim() === "" || PROMPT_PREFIX.test(before)) return null;
		// Other content precedes the echoed command — keep it.
		return before.replace(/[ \t]+$/, "");
	}
	return line;
}

/**
 * Extract the meaningful tail of a terminal/CLI agent's pty scrollback.
 *
 * Pure: no I/O. See the module docstring for the pipeline. Returns "" when the
 * buffer is empty or contains no meaningful content after stripping — the
 * caller maps that to an `AGENT_NO_OUTPUT` outcome.
 */
export function extractTerminalOutputTail(
	buffer: string | Uint8Array | readonly Uint8Array[],
	options: ExtractTerminalOutputTailOptions = {},
): string {
	const decoded = decodeTerminalBuffer(buffer);
	if (decoded === "") return "";

	const stripped = stripAnsi(decoded);

	const echoLines =
		options.echoedCommand !== undefined
			? commandEchoLines(options.echoedCommand)
			: null;
	const dropTrailingPrompt = options.dropTrailingPrompt ?? true;
	const maxLines = Math.max(1, options.maxLines ?? DEFAULT_MAX_TAIL_LINES);

	// Normalise line endings, collapse CR overwrites, and right-trim each line.
	const rawLines = stripped.replace(/\r\n/g, "\n").split("\n");
	const cleaned: string[] = [];
	for (const raw of rawLines) {
		const collapsed = collapseCarriageReturns(raw);
		// Right-trim trailing whitespace the pty pads with; keep left indentation.
		cleaned.push(collapsed.replace(/[ \t]+$/, ""));
	}

	// Drop / clean echoed command line(s) the shell printed back before running.
	const withoutEcho: string[] = [];
	for (const line of cleaned) {
		if (!echoLines) {
			withoutEcho.push(line);
			continue;
		}
		const residual = stripEchoedCommand(line, echoLines);
		if (residual !== null) withoutEcho.push(residual);
	}

	const at = (i: number): string => withoutEcho[i] ?? "";

	// Trim trailing blank lines.
	let end = withoutEcho.length;
	while (end > 0 && at(end - 1).trim() === "") end--;

	// Optionally drop a single trailing shell-prompt line, then re-trim blanks.
	if (dropTrailingPrompt && end > 0 && looksLikePromptLine(at(end - 1))) {
		end--;
		while (end > 0 && at(end - 1).trim() === "") end--;
	}

	// Trim leading blank lines.
	let start = 0;
	while (start < end && at(start).trim() === "") start++;

	if (start >= end) return "";

	// Bound to the last `maxLines` meaningful lines.
	const meaningful = withoutEcho.slice(start, end);
	const tail =
		meaningful.length > maxLines
			? meaningful.slice(meaningful.length - maxLines)
			: meaningful;

	return tail.join("\n").trim();
}
