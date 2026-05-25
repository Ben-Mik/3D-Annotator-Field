import { useI18nContext } from "i18n/i18n-react";
import { SlidersHorizontal } from "lucide-react";
import {
	createElement,
	Fragment,
	useState,
	type PropsWithChildren,
} from "react";
import { GLOBAL_LIGHTING_SETTINGS } from "~annotator/scene/lighting/global/GlobalLighting";
import { SUN_LIGHTING_SETTINGS } from "~annotator/scene/lighting/sun/SunLighting";
import { TEXTURE_RENDERING_SETTINGS } from "~annotator/scene/model/TextureRenderingSettings";
import { SCENE_SETTINGS } from "~annotator/scene/Scene";
import { humanReadableDataSize } from "~util/fileSystem/FileUtils";
import {
	getOpfsOverview,
	resetOpfs,
} from "~util/fileSystem/OriginPrivateFileSystem";
import { wait } from "~util/Timeout";
import { useAnnotator } from "../contexts/AnnotatorContext";
import { useCache } from "../hooks/Cache";
import { useTools } from "../hooks/Tools";
import { ColorSettingView } from "./settings/ColorSettingView";
import { SettingsHeading, SettingsSubHeading } from "./settings/SettingView";
import { ToggleSettingView } from "./settings/ToggleSettingView";
import { STATS_SETTING } from "./Stats";

export function SettingsModalButton() {
	const { LL } = useI18nContext();
	return (
		<div className="tooltip tooltip-right" data-tip={LL.SETTINGS()}>
			<label
				htmlFor="settings-modal"
				className="modal-button btn btn-ghost m-1 h-14 w-14 px-3"
			>
				<SlidersHorizontal strokeWidth={1} size={48} />
			</label>
		</div>
	);
}

function SettingsSection({ children }: PropsWithChildren) {
	return <div className="space-y-4">{children}</div>;
}

export function SettingsModal() {
	const { LL } = useI18nContext();
	const annotator = useAnnotator();
	const { tools } = useTools();
	const { usage, queryUsage } = useCache();

	const [contentButtonDisabled, setContentButtonDisabled] = useState(false);
	const [cacheContent, setCacheContent] = useState("");

	async function showCacheContent() {
		setContentButtonDisabled(true);
		const content = await getOpfsOverview();
		setCacheContent(content);
	}

	async function deleteCache() {
		const confirmed = window.confirm(
			"Do you really want to delete all cached files?"
		);
		if (confirmed) {
			resetOpfs();
			setCacheContent("");
			setContentButtonDisabled(false);
			await wait(500);
			queryUsage();
		}
	}

	const annotatorSettings = annotator
		? createElement(annotator.getSettingsComponent())
		: null;

	const toolsWithSettings = tools.filter(
		(tool) => tool.getSettingsComponent() !== null
	);

	const toolSettings = toolsWithSettings.map((tool, index) => {
		const component = tool.getSettingsComponent();
		if (component) {
			return (
				<Fragment key={index}>
					{index !== 0 ? <div className="divider"></div> : null}
					{createElement(component)}
				</Fragment>
			);
		} else {
			return null;
		}
	});

	return (
		<>
			<input
				type="checkbox"
				id="settings-modal"
				className="modal-toggle"
			/>
			<label className="modal" htmlFor="settings-modal">
				<label
					className="modal-box max-w-3xl p-0 scrollbar-thin scrollbar-track-base-100 scrollbar-thumb-base-content/20"
					htmlFor=""
				>
					<div className="sticky top-0 z-10 flex items-center justify-between bg-base-100 p-6 ">
						<h1 className="text-2xl font-bold text-accent-content">
							{LL.SETTINGS()}
						</h1>
						<label
							htmlFor="settings-modal"
							className="btn btn-circle btn-accent btn-sm"
						>
							✕
						</label>
					</div>

					<div className="space-y-10 px-6 pb-6">
						<SettingsSection>
							<SettingsHeading>{LL.ANNOTATOR()}</SettingsHeading>
							<ColorSettingView
								setting={SCENE_SETTINGS.backgroundColor}
								name={LL.SETTING_BACKGROUND_COLOR()}
								description={LL.SETTING_BACKGROUND_COLOR_DESC()}
							></ColorSettingView>
							<ToggleSettingView
								setting={STATS_SETTING}
								name={LL.SETTING_STATS()}
								description={LL.SETTING_STATS_DESC()}
							></ToggleSettingView>
							<ColorSettingView
								setting={GLOBAL_LIGHTING_SETTINGS.lightColor}
								name={LL.SETTING_GLOBAL_LIGHT_COLOR()}
								description={LL.SETTING_GLOBAL_LIGHT_COLOR_DESC()}
							></ColorSettingView>
							<ColorSettingView
								setting={SUN_LIGHTING_SETTINGS.lightColor}
								name={LL.SETTING_SUN_LIGHT_COLOR()}
								description={LL.SETTING_SUN_LIGHT_COLOR_DESC()}
							></ColorSettingView>
						</SettingsSection>

						<SettingsSection>{annotatorSettings}</SettingsSection>

						<SettingsSection>
							<SettingsHeading>
								{LL.SETTINGS_ADVANCED()}
							</SettingsHeading>
							<ToggleSettingView
								setting={
									TEXTURE_RENDERING_SETTINGS.mipmapsEnabled
								}
								name={LL.SETTING_MIPMAPS()}
								description={LL.SETTING_MIPMAPS_DESC()}
								needsReload
							></ToggleSettingView>
						</SettingsSection>

						<SettingsSection>
							<SettingsHeading>{LL.TOOLS()}</SettingsHeading>

							{toolSettings}
						</SettingsSection>

						<SettingsSection>
							<SettingsHeading>{LL.CACHE()}</SettingsHeading>
							<SettingsSubHeading>
								{LL.USAGE()}
							</SettingsSubHeading>
							<p className="mt-1 text-pretty">
								{LL.USAGE_NUMBERS({
									usage: humanReadableDataSize(usage.usage),
									quota: humanReadableDataSize(usage.quota),
								})}
							</p>
							<div className="flex space-x-4">
								<button
									className="btn btn-outline btn-sm"
									onClick={queryUsage}
								>
									{LL.REFRESH()}
								</button>
								<button
									className="btn btn-outline btn-sm"
									onClick={showCacheContent}
									disabled={contentButtonDisabled}
								>
									{LL.SHOW_CONTENT()}
								</button>
								<button
									className="btn btn-error btn-sm"
									onClick={deleteCache}
								>
									{LL.DELETE_CACHE()}
								</button>
							</div>
							<pre className="text-sm">{cacheContent}</pre>
						</SettingsSection>
					</div>
				</label>
			</label>
		</>
	);
}
