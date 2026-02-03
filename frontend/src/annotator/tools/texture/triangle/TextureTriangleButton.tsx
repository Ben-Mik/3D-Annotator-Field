import { useI18nContext } from "i18n/i18n-react";
import { TriangleRight } from "lucide-react";
import type { ToolButtonProps } from "~annotator/tools/Tool";
import { ToolButton } from "~ui/components/ToolButton";

/**
 * The button component to select the TextureNeedle
 *
 * @param props the component props
 * @returns the button component
 */
export function TextureTriangleButton({ onClick, selected }: ToolButtonProps) {
	const { LL } = useI18nContext();
	return (
		<ToolButton
			icon={<TriangleRight size={48} strokeWidth={1} />}
			toolAlt={LL.TRIANGLE()}
			toolFunc={onClick}
			selected={selected}
		/>
	);
}
