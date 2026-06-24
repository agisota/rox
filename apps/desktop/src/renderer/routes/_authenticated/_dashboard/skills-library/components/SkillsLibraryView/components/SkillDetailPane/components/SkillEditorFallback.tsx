/**
 * Non-editable fallback shown in place of CodeMirror for files the editor can't
 * open: binary/non-text blobs and files over the 512KB read limit
 * (PAYLOAD_TOO_LARGE). Offers "Открыть в Finder" so the user can still get to
 * the file on disk.
 */

import { Button } from "@rox/ui/button";
import { motionSpring, useShouldAnimate } from "@rox/ui/motion";
import { motion } from "motion/react";
import { LuExternalLink, LuFileWarning } from "react-icons/lu";
import { formatBytes } from "../../../../../lib/file-kind";

type FallbackKind = "binary" | "too-large" | "read-error";

interface SkillEditorFallbackProps {
	kind: FallbackKind;
	sizeBytes?: number;
	onReveal?: () => void;
}

const COPY: Record<FallbackKind, { title: string; hint: string }> = {
	binary: {
		title: "Предпросмотр недоступен",
		hint: "Этот файл не текстовый — его нельзя открыть в редакторе.",
	},
	"too-large": {
		title: "Файл слишком большой для редактирования",
		hint: "Размер превышает лимит 512 КБ. Откройте его во внешнем редакторе.",
	},
	"read-error": {
		title: "Не удалось прочитать файл",
		hint: "Файл недоступен или был перемещён.",
	},
};

export function SkillEditorFallback({
	kind,
	sizeBytes,
	onReveal,
}: SkillEditorFallbackProps) {
	const shouldAnimate = useShouldAnimate("essential");
	const copy = COPY[kind];

	return (
		<div className="flex flex-1 items-center justify-center p-6">
			<motion.div
				className="flex max-w-sm flex-col items-center gap-3 text-center"
				initial={shouldAnimate ? { opacity: 0, scale: 0.96 } : false}
				animate={{ opacity: 1, scale: 1 }}
				transition={motionSpring.bouncy}
			>
				<div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
					<LuFileWarning className="size-5" />
				</div>
				<div className="space-y-1">
					<p className="text-sm font-medium text-foreground">{copy.title}</p>
					<p className="text-xs text-muted-foreground">{copy.hint}</p>
					{typeof sizeBytes === "number" && (
						<p className="font-mono text-xs text-muted-foreground/70">
							{formatBytes(sizeBytes)}
						</p>
					)}
				</div>
				{onReveal && (
					<Button size="sm" variant="outline" onClick={onReveal}>
						<LuExternalLink className="size-4" />
						Открыть в Finder
					</Button>
				)}
			</motion.div>
		</div>
	);
}
