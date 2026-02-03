import { useI18nContext } from "i18n/i18n-react";
import { RadioButtonGroup } from "~annotator/tools/common/components/RadioButtonGroup";
import { useSetting } from "~ui/annotator/hooks/Settings";
import { MESH_LASSO_SETTINGS, SELECTION_MODES } from "./MeshLasso";

/**
 * The component to access the quick setting of the LassoTool
 */
export function MeshLassoQuickSettingsView() {
	const { LL } = useI18nContext();
	const [selectionMode, setSelectionMode] = useSetting(
		MESH_LASSO_SETTINGS.selectionMode
	);
	return (
		<div className="flex">
			<RadioButtonGroup
				label={LL.SELECTION_MODE() + ":"}
				onChange={(mode) => {
					setSelectionMode(mode);
				}}
				choices={SELECTION_MODES}
				value={selectionMode}
			/>
		</div>
	);
}
