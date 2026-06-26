/**
 * CodeMirror 6 editor for a skill file — replaces the raw <Textarea>.
 *
 * Controlled value/onChange, language by file extension, Victor Mono via the
 * Rox dark-glass theme, line numbers + soft wrap. Read-only mode reuses the
 * same chrome for the binary/too-large fallbacks' siblings.
 */

import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { useMemo } from "react";
import {
	languageExtension,
	roxEditorTheme,
} from "../../../../../lib/codemirror-theme";
import {
	languageForFile,
	type SkillFileLanguage,
} from "../../../../../lib/file-kind";

interface SkillCodeEditorProps {
	relativePath: string;
	value: string;
	onChange: (next: string) => void;
	readOnly?: boolean;
}

const baseExtensions = [EditorView.lineWrapping];

export function SkillCodeEditor({
	relativePath,
	value,
	onChange,
	readOnly = false,
}: SkillCodeEditorProps) {
	const kind: SkillFileLanguage = useMemo(
		() => languageForFile(relativePath),
		[relativePath],
	);

	const extensions = useMemo(
		() => [...baseExtensions, ...languageExtension(kind)],
		[kind],
	);

	return (
		<CodeMirror
			value={value}
			onChange={onChange}
			theme={roxEditorTheme}
			extensions={extensions}
			readOnly={readOnly}
			height="100%"
			className="h-full min-h-0 text-xs"
			basicSetup={{
				lineNumbers: true,
				foldGutter: false,
				highlightActiveLine: !readOnly,
				highlightActiveLineGutter: !readOnly,
				autocompletion: false,
				bracketMatching: true,
				closeBrackets: !readOnly,
				indentOnInput: !readOnly,
			}}
		/>
	);
}
