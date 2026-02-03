import { useI18nContext } from "i18n/i18n-react";
import { Lasso } from "lucide-react";
import { type ToolButtonProps } from "~annotator/tools/Tool";
import { ToolButton } from "~ui/components/ToolButton";

/**
 * The button component to select the LassoTool
 *
 * @param props the component props
 * @returns the button component
 */
export function PointCloudLassoButton({ onClick, selected }: ToolButtonProps) {
	const { LL } = useI18nContext();
	return (
		<ToolButton
			icon={<Lasso size={48} strokeWidth={1} />}
			toolAlt={LL.LASSO()}
			toolFunc={onClick}
			selected={selected}
		/>
	);
}
