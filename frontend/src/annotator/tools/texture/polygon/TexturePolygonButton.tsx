import { useI18nContext } from "i18n/i18n-react";
import { Waypoints } from "lucide-react";
import type { ToolButtonProps } from "~annotator/tools/Tool";
import { ToolButton } from "~ui/components/ToolButton";

/**
 * The button component to select the TexturePolygon tool
 *
 * @param props the component props
 * @returns the button component
 */
export function TexturePolygonButton({ onClick, selected }: ToolButtonProps) {
	const { LL } = useI18nContext();
	return (
		<ToolButton
			icon={<Waypoints size={48} strokeWidth={1} />}
			toolAlt={LL.POLYGON()}
			toolFunc={onClick}
			selected={selected}
		/>
	);
}
