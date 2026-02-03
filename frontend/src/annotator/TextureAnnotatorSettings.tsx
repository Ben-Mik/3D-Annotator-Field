import { useI18nContext } from "i18n/i18n-react";
import { Fragment } from "react/jsx-runtime";
import { NumberSettingView } from "~ui/annotator/components/settings/NumberSettingView";
import {
	SettingsDescription,
	SettingsHeading,
	SettingsSubHeading,
} from "~ui/annotator/components/settings/SettingView";
import { TEXTURE_VISUALIZER_SETTINGS } from "./scene/visualizer/TextureAnnotationVisualizer";

export function TextureAnnotatorSettingsView() {
	const { LL } = useI18nContext();

	return (
		<Fragment>
			<SettingsHeading>{LL.MESH_TEXTURE_ANNOTATOR()}</SettingsHeading>
			<SettingsSubHeading>
				{LL.TEXTURE_VISUALIZER_HEADING()}
			</SettingsSubHeading>
			<SettingsDescription
				description={LL.TEXTURE_VISUALIZER_DESC()}
			></SettingsDescription>
			<NumberSettingView
				name={LL.TEXTURE_VISUALIZER_BUFFER()}
				description={LL.TEXTURE_VISUALIZER_BUFFER_DESC()}
				setting={TEXTURE_VISUALIZER_SETTINGS.bufferThreshold}
			></NumberSettingView>
			<NumberSettingView
				name={LL.TEXTURE_VISUALIZER_BUFFER_ALL()}
				description={LL.TEXTURE_VISUALIZER_BUFFER_ALL_DESC()}
				setting={TEXTURE_VISUALIZER_SETTINGS.bufferAllThreshold}
			></NumberSettingView>
		</Fragment>
	);
}
