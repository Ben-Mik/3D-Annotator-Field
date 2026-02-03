import { useI18nContext } from "i18n/i18n-react";
import { LucideEraser } from "lucide-react";
import { useLabels } from "~ui/annotator/hooks/Labels";
import { ToolButton } from "~ui/components/ToolButton";

export function Eraser() {
	const { LL } = useI18nContext();
	const { isEraserSelected, toggleEraser } = useLabels();

	return (
		<ToolButton
			icon={<LucideEraser size={48} strokeWidth={1} />}
			toolAlt={LL.ERASER()}
			toolFunc={toggleEraser}
			selected={isEraserSelected}
		/>
	);
}
