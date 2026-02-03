import { useI18nContext } from "i18n/i18n-react";
import { Brush } from "lucide-react";
import { type ToolButtonProps } from "~annotator/tools/Tool";
import { ToolButton } from "~ui/components/ToolButton";

/**
 * The button component to select the MeshBrush
 *
 * @param props the component props
 * @returns the button component
 */
export function MeshBrush3DButton({ onClick, selected }: ToolButtonProps) {
	const { LL } = useI18nContext();

	return (
		<ToolButton
			icon={<Brush size={48} strokeWidth={1} />}
			toolAlt={LL.BRUSH_3D()}
			toolFunc={onClick}
			selected={selected}
		/>
	);
}
