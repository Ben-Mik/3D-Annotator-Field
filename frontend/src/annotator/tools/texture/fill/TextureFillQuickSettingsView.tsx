import { useI18nContext } from "i18n/i18n-react";
import { Button } from "~annotator/tools/common/components/Button";
import type { ToolQuickSettingsProps } from "~annotator/tools/Tool";
import type { TextureFill } from "./TextureFill";

export function TextureFillQuickSettingsView(props: ToolQuickSettingsProps) {
	const tool = props.tool as TextureFill;

	const { LL } = useI18nContext();

	return (
		<div className="flex">
			<Button
				disabled={false}
				onClick={() => {
					tool.fill();
				}}
				toolTip={LL.FILL_TOOLTIP()}
			>
				{LL.FILL()}
			</Button>
		</div>
	);
}
