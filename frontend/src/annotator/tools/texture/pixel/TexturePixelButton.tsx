import { useI18nContext } from "i18n/i18n-react";
import { Grid3x3 } from "lucide-react";
import type { ToolButtonProps } from "~annotator/tools/Tool";
import { ToolButton } from "~ui/components/ToolButton";

/**
 * The button component to select the TexturePixel
 *
 * @param props the component props
 * @returns the button component
 */
export function TexturePixelButton({ onClick, selected }: ToolButtonProps) {
	const { LL } = useI18nContext();
	return (
		<ToolButton
			icon={<Grid3x3 size={48} strokeWidth={1} />}
			toolAlt={LL.PIXEL()}
			toolFunc={onClick}
			selected={selected}
		/>
	);
}
