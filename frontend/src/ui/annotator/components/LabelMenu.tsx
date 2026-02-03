import { useI18nContext } from "i18n/i18n-react";
import { useState } from "react";
import { VISUALIZER_SETTINGS } from "~annotator/scene/visualizer/AnnotationVisualizer";
import { LockClosed } from "~assets/icons/LockClosed";
import { LockOpen } from "~assets/icons/LockOpen";
import { type Label } from "~entity/Annotation";
import { useLabels } from "~ui/annotator/hooks/Labels";
import { StandardContainer } from "~ui/components/StandardContainer";
import { useSetting } from "../hooks/Settings";

export function LabelMenu() {
	const { LL } = useI18nContext();
	const {
		labels,
		currentLabel,
		isEraserSelected,
		selectLabel,
		toggleLock,
		toggleVisibility,
	} = useLabels();

	const [opacity, setOpacity] = useSetting(VISUALIZER_SETTINGS.opacity);

	const [collapsed, setCollapsed] = useState(true);

	const labelElements = labels.map((element) => (
		<LabelMenuItem
			label={element}
			selectLabel={selectLabel}
			toggleLock={toggleLock}
			toggleVisibility={toggleVisibility}
			key={element.id}
		/>
	));

	return (
		<div className={`absolute right-8 top-24 h-fit w-60 rounded-3xl`}>
			<StandardContainer
				styling={`border-2 ${
					isEraserSelected ? "border-base-300" : "border-info"
				}`}
			>
				<div className={`p-2 `}>
					<div
						onClick={() => {
							if (!isEraserSelected) {
								setCollapsed((currentState) => !currentState);
							}
						}}
					>
						{currentLabel && (
							<div className="select-none">
								<LabelMenuItem
									label={currentLabel}
									selectLabel={selectLabel}
									toggleLock={toggleLock}
									toggleVisibility={toggleVisibility}
									key={currentLabel.id}
								/>
							</div>
						)}
					</div>

					<div className={collapsed ? "hidden" : ""}>
						<div className="divider my-0" />

						<ul className="">{labelElements}</ul>

						<div className="divider my-0" />

						<div className="flex place-content-between p-2">
							<div>
								<p>{LL.OPACITY()}</p>
							</div>
							<div>{Math.trunc(opacity * 100)}%</div>
						</div>
						<div className="px-2">
							<input
								type="range"
								min={VISUALIZER_SETTINGS.opacity.min * 100}
								max={VISUALIZER_SETTINGS.opacity.max * 100}
								step={1}
								value={opacity * 100}
								className="range range-primary range-xs"
								onChange={({ target }) => {
									setOpacity(+target.value / 100);
								}}
							/>
						</div>
					</div>
				</div>
			</StandardContainer>
		</div>
	);
}

export interface LabelMenuItemProps {
	label: Label;
	selectLabel: (label: Label) => void;
	toggleLock: (label: Label) => void;
	toggleVisibility: (label: Label) => void;
}

export function LabelMenuItem({
	label,
	selectLabel,
	toggleLock,
	toggleVisibility,
}: LabelMenuItemProps) {
	const { LL } = useI18nContext();

	const labelCircleStyles = {
		backgroundColor: label.annotationVisible
			? label.color.asHTMLCode()
			: undefined,
		borderColor: label.color.asHTMLCode(),
	};

	return (
		<div
			className="flex cursor-pointer items-center gap-4 p-2"
			onClick={() => {
				selectLabel(label);
			}}
		>
			<div
				className={
					"text-ne tooltip tooltip-left h-6 w-6 shrink-0 rounded-full border-2 border-solid"
				}
				data-tip={LL.SHOW_HIDE()}
				style={labelCircleStyles}
				onClick={(e) => {
					e.stopPropagation();
					toggleVisibility(label);
				}}
			></div>
			<div className="w-24 grow">{label.name}</div>
			<div
				className="h-6 w-6 shrink-0 select-none text-base-content"
				onClick={(e) => {
					e.stopPropagation();
					toggleLock(label);
				}}
			>
				{label.locked ? <LockClosed /> : <LockOpen />}
			</div>
		</div>
	);
}
