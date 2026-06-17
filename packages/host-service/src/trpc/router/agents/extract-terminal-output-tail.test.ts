import { describe, expect, test } from "bun:test";
import {
	DEFAULT_MAX_TAIL_LINES,
	decodeTerminalBuffer,
	extractTerminalOutputTail,
	stripAnsi,
} from "./extract-terminal-output-tail";

const ESC = "\x1b";
const BEL = "\x07";

describe("decodeTerminalBuffer", () => {
	test("ETO-D1: returns a string body unchanged", () => {
		expect(decodeTerminalBuffer("already text")).toBe("already text");
	});

	test("ETO-D2: decodes a single Uint8Array as UTF-8", () => {
		const bytes = new TextEncoder().encode("héllo ✓");
		expect(decodeTerminalBuffer(bytes)).toBe("héllo ✓");
	});

	test("ETO-D3: concatenates a chunk array before decoding (multibyte across boundary)", () => {
		// "✓" is 0xE2 0x9C 0x93 — split it across two chunks to prove we merge
		// before decoding rather than decoding per-chunk (which would yield U+FFFD).
		const full = new TextEncoder().encode("ok ✓ done");
		const splitAt = full.indexOf(0xe2) + 1; // mid-codepoint
		const a = full.slice(0, splitAt);
		const b = full.slice(splitAt);
		expect(decodeTerminalBuffer([a, b])).toBe("ok ✓ done");
	});

	test("ETO-D4: empty chunk array decodes to empty string", () => {
		expect(decodeTerminalBuffer([])).toBe("");
	});
});

describe("stripAnsi", () => {
	test("ETO-S1: removes SGR colour CSI sequences", () => {
		const input = `${ESC}[31mred${ESC}[0m text`;
		expect(stripAnsi(input)).toBe("red text");
	});

	test("ETO-S2: removes cursor-move CSI sequences", () => {
		const input = `line1${ESC}[2K${ESC}[1Gline2`;
		expect(stripAnsi(input)).toBe("line1line2");
	});

	test("ETO-S3: removes OSC window-title sequences (BEL-terminated)", () => {
		const input = `${ESC}]0;my title${BEL}content`;
		expect(stripAnsi(input)).toBe("content");
	});

	test("ETO-S4: removes OSC 133 semantic-prompt sequences (ST-terminated)", () => {
		const input = `${ESC}]133;A${ESC}\\prompt body`;
		expect(stripAnsi(input)).toBe("prompt body");
	});

	test("ETO-S5: removes lone ESC single-char escapes and residual control bytes", () => {
		const input = `a${ESC}=b${ESC}>c\x00d`;
		expect(stripAnsi(input)).toBe("abcd");
	});

	test("ETO-S6: preserves tabs and newlines", () => {
		const input = "col1\tcol2\nrow2";
		expect(stripAnsi(input)).toBe("col1\tcol2\nrow2");
	});
});

describe("extractTerminalOutputTail", () => {
	test("ETO-01: empty buffer yields empty string", () => {
		expect(extractTerminalOutputTail("")).toBe("");
		expect(extractTerminalOutputTail([])).toBe("");
		expect(extractTerminalOutputTail(new Uint8Array())).toBe("");
	});

	test("ETO-02: whitespace/escape-only buffer yields empty string", () => {
		const input = `${ESC}[0m\n   \n${ESC}[2K\n`;
		expect(extractTerminalOutputTail(input)).toBe("");
	});

	test("ETO-03: strips ANSI and returns clean trailing content", () => {
		const input = `${ESC}[32mBuild succeeded${ESC}[0m\n${ESC}[36mAll tests passed${ESC}[0m\n`;
		expect(
			extractTerminalOutputTail(input, { dropTrailingPrompt: false }),
		).toBe("Build succeeded\nAll tests passed");
	});

	test("ETO-04: drops the echoed command line (prompt-prefixed) the shell printed back", () => {
		const command = "claude --print 'summarize the diff'";
		const input = [
			"user@host:~/repo$ claude --print 'summarize the diff'",
			"The diff adds a pure helper and wires capture.",
			"",
		].join("\n");
		// The whole `prompt$ <command>` line is dropped (only a prompt prefix
		// remains once the command is removed), leaving just the agent's output.
		expect(
			extractTerminalOutputTail(input, {
				echoedCommand: command,
				dropTrailingPrompt: false,
			}),
		).toBe("The diff adds a pure helper and wires capture.");
	});

	test("ETO-04c: keeps real text that trails the echoed command on the same line", () => {
		const command = "echo hi";
		const input = ["$ echo hi then more", "next line"].join("\n");
		expect(
			extractTerminalOutputTail(input, {
				echoedCommand: command,
				dropTrailingPrompt: false,
			}),
		).toBe("$ echo hi then more\nnext line");
	});

	test("ETO-04b: drops a multi-line heredoc echoed command", () => {
		const command = "codex <<'ROX_PROMPT'\nReview the code\nROX_PROMPT";
		const input = [
			"codex <<'ROX_PROMPT'",
			"Review the code",
			"ROX_PROMPT",
			"Looks good to me.",
		].join("\n");
		expect(
			extractTerminalOutputTail(input, {
				echoedCommand: command,
				dropTrailingPrompt: false,
			}),
		).toBe("Looks good to me.");
	});

	test("ETO-05: drops a trailing shell-prompt line left after exit", () => {
		const input = ["Operation complete.", "", "user@host:~/repo$ "].join("\n");
		expect(extractTerminalOutputTail(input)).toBe("Operation complete.");
	});

	test("ETO-05b: drops a bare prompt sigil left after exit", () => {
		const input = ["final answer", "❯"].join("\n");
		expect(extractTerminalOutputTail(input)).toBe("final answer");
	});

	test("ETO-05c: keeps trailing prompt when dropTrailingPrompt is false", () => {
		const input = ["answer", "$"].join("\n");
		expect(
			extractTerminalOutputTail(input, { dropTrailingPrompt: false }),
		).toBe("answer\n$");
	});

	test("ETO-06: collapses carriage-return progress overwrites to the final segment", () => {
		const input = "Downloading 10%\rDownloading 55%\rDownloading 100%\nDone";
		expect(
			extractTerminalOutputTail(input, { dropTrailingPrompt: false }),
		).toBe("Downloading 100%\nDone");
	});

	test("ETO-07: bounds output to the last maxLines meaningful lines", () => {
		const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
		const input = lines.join("\n");
		expect(
			extractTerminalOutputTail(input, {
				maxLines: 3,
				dropTrailingPrompt: false,
			}),
		).toBe("line 8\nline 9\nline 10");
	});

	test("ETO-07b: maxLines < 1 is clamped to 1", () => {
		const input = "first\nsecond\nthird";
		expect(
			extractTerminalOutputTail(input, {
				maxLines: 0,
				dropTrailingPrompt: false,
			}),
		).toBe("third");
	});

	test("ETO-08: trims leading and trailing blank lines but keeps interior blanks", () => {
		const input = "\n\nparagraph one\n\nparagraph two\n\n";
		expect(
			extractTerminalOutputTail(input, { dropTrailingPrompt: false }),
		).toBe("paragraph one\n\nparagraph two");
	});

	test("ETO-09: decodes a raw byte ring buffer then extracts", () => {
		const chunks = [
			new TextEncoder().encode(`${ESC}[32mhello from pty${ESC}[0m\n`),
			new TextEncoder().encode("second line\n"),
		];
		expect(
			extractTerminalOutputTail(chunks, { dropTrailingPrompt: false }),
		).toBe("hello from pty\nsecond line");
	});

	test("ETO-10: full realistic scrollback — echo + ANSI + output + trailing prompt", () => {
		const command = "claude --print 'what is 2+2?'";
		const input = [
			// Line 1: OSC window title, then prompt + echoed command on one line.
			`${ESC}]0;claude${BEL}user@host:~/work$ claude --print 'what is 2+2?'`,
			// Line 2: a cleared-line spinner — ANSI is stripped, prose text remains.
			`${ESC}[2K${ESC}[36mThinking...${ESC}[0m`,
			"The answer is 4.",
			"",
			// Line 5: OSC 133 prompt marker, then a residual trailing shell prompt.
			`${ESC}]133;A${ESC}\\user@host:~/work$ `,
		].join("\n");
		const out = extractTerminalOutputTail(input, { echoedCommand: command });
		// OSC title, OSC 133 marker, CSI codes, the echoed command line, and the
		// trailing prompt are all gone. The spinner's plain text + the answer stay.
		expect(out).toBe("Thinking...\nThe answer is 4.");
		expect(out).not.toContain("133");
		expect(out).not.toContain(ESC);
		expect(out).not.toContain("claude --print");
	});

	test("ETO-11: DEFAULT_MAX_TAIL_LINES is a sane positive bound", () => {
		expect(DEFAULT_MAX_TAIL_LINES).toBeGreaterThan(0);
		expect(Number.isInteger(DEFAULT_MAX_TAIL_LINES)).toBe(true);
	});
});
