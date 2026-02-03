import { useI18nContext } from "i18n/i18n-react";
import { SphereSettingsView } from "~annotator/tools/common/elements/sphere/SphereSettingsView";
import { ToolHeading } from "~ui/annotator/components/settings/SettingView";
import { MESH_BRUSH_3D_SETTINGS } from "./MeshBrush3D";

/**
 * The button component to access the quick setting oft the MeshBrush
 *
 * @param props the component props
 * @returns the settings component
 */
export function MeshBrush3DSettingsView() {
	const { LL } = useI18nContext();

	return (
		<>
			<ToolHeading
				toolName={LL.BRUSH_3D()}
				annotationMode={LL.TRIANGLE_MESH()}
			></ToolHeading>
			<SphereSettingsView
				sphereSettings={MESH_BRUSH_3D_SETTINGS.sphere}
			/>
		</>
	);
}
