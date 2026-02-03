import { SphereQuickSettingsView } from "~annotator/tools/common/elements/sphere/SphereQuickSettingsView";
import { TEXTURE_BRUSH_3D_SETTINGS } from "./TextureBrush3D";

/**
 * The button component to access the quick setting oft the MeshBrush
 *
 * @param props the component props
 * @returns the settings component
 */
export function TextureBrush3DQuickSettingsView() {
	return (
		<SphereQuickSettingsView
			sizeSetting={TEXTURE_BRUSH_3D_SETTINGS.scale}
		/>
	);
}
