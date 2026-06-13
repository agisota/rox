import {
	PromptInputButton,
	usePromptInputAttachments,
} from "@rox/ui/ai-elements/prompt-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { HiMiniPaperClip } from "react-icons/hi2";
import { PILL_BUTTON_CLASS } from "../../styles";

export function PlusMenu() {
	const attachments = usePromptInputAttachments();

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<PromptInputButton
					aria-label="Добавить вложение"
					className={`${PILL_BUTTON_CLASS} w-[23px]`}
					onClick={() => attachments.openFileDialog()}
				>
					<HiMiniPaperClip className="size-3.5" />
				</PromptInputButton>
			</TooltipTrigger>
			<TooltipContent side="top">Добавить вложение</TooltipContent>
		</Tooltip>
	);
}
