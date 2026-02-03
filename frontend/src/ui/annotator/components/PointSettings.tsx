import { useI18nContext } from "i18n/i18n-react";
import { useState } from "react";
import { POINT_CLOUD_SETTINGS } from "~annotator/scene/model/PointCloud";
import { ModelType } from "~entity/ModelInformation";
import {
	useAnnotator,
	useModelInformation,
} from "~ui/annotator/contexts/AnnotatorContext";
import { StandardContainer } from "~ui/components/StandardContainer";
import { useSetting } from "../hooks/Settings";

export function PointSettings() {
	const annotator = useAnnotator();
	const modelInformation = useModelInformation();
	const { LL } = useI18nContext();

	const [collapsed, setCollapsed] = useState(true);
	const [pointSize, setPointSize] = useSetting(POINT_CLOUD_SETTINGS.size);

	return modelInformation?.modelType === ModelType.POINT_CLOUD ? (
		<StandardContainer styling="select-none p-5 pb-2">
			<h1
				className={`-mt-2 mb-2 text-center text-xl ${
					annotator ? "hover:cursor-pointer" : ""
				}`}
				onClick={() => {
					if (!annotator) return;

					setCollapsed((currentState) => !currentState);
				}}
			>
				{LL.POINTS()}
			</h1>
			<div className={collapsed ? "hidden" : ""}>
				<div className="mt-3 flex place-content-between">
					<div>
						<p>{LL.POINT_SIZE()}</p>
					</div>
					<div>{pointSize}</div>
				</div>
				<div className="mt-2">
					<input
						type="range"
						className="range range-primary range-xs"
						min={POINT_CLOUD_SETTINGS.size.min}
						max={POINT_CLOUD_SETTINGS.size.max}
						step={0.005}
						value={pointSize}
						onChange={({ target }) => {
							setPointSize(+target.value);
						}}
					/>
				</div>
			</div>
		</StandardContainer>
	) : (
		<></>
	);
}
