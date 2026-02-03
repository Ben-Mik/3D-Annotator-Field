import { useI18nContext } from "i18n/i18n-react";
import { useState } from "react";
import Back from "~assets/icons/perspective/back.png";
import Bottom from "~assets/icons/perspective/bottom.png";
import Front from "~assets/icons/perspective/front.png";
import Left from "~assets/icons/perspective/left.png";
import Right from "~assets/icons/perspective/right.png";
import Top from "~assets/icons/perspective/top.png";
import { type Perspective } from "~entity/Perspective";
import { useAnnotator } from "~ui/annotator/contexts/AnnotatorContext";
import { StandardContainer } from "~ui/components/StandardContainer";

export function CameraPerspective() {
	const [collapsed, setCollapsed] = useState(false);
	const { LL } = useI18nContext();
	const annotator = useAnnotator();

	function selectCameraPerspective(perspective: Perspective) {
		if (!annotator) return;

		annotator.sceneManager
			.getCameraControls()
			.setCameraPerspective(perspective);
	}

	return (
		<StandardContainer
			styling={`select-none p-5 ${collapsed ? "pb-2" : ""}`}
		>
			<h1
				className="-mt-2 mb-2 text-center text-xl hover:cursor-pointer"
				onClick={() => {
					setCollapsed((currentState) => !currentState);
				}}
			>
				{LL.VIEWS()}
			</h1>
			<div
				className={`grid grid-cols-2 grid-rows-3 gap-2 ${
					collapsed ? "hidden" : ""
				}`}
			>
				<div
					className="tooltip h-10 w-10 cursor-pointer"
					data-tip={LL.TOP()}
				>
					<img
						src={Top}
						alt={LL.TOP()}
						onClick={() => {
							selectCameraPerspective("TOP");
						}}
					/>
				</div>
				<div
					className="tooltip h-10 w-10 cursor-pointer"
					data-tip={LL.BOTTOM()}
				>
					<img
						src={Bottom}
						alt={LL.BOTTOM()}
						onClick={() => {
							selectCameraPerspective("BOTTOM");
						}}
					/>
				</div>
				<div
					className="tooltip h-10 w-10 cursor-pointer "
					data-tip={LL.LEFT()}
				>
					<img
						src={Left}
						alt={LL.LEFT()}
						onClick={() => {
							selectCameraPerspective("LEFT");
						}}
					/>
				</div>
				<div
					className="tooltip h-10 w-10 cursor-pointer "
					data-tip={LL.RIGHT()}
				>
					<img
						src={Right}
						alt={LL.RIGHT()}
						onClick={() => {
							selectCameraPerspective("RIGHT");
						}}
					/>
				</div>
				<div
					className="tooltip h-10 w-10 cursor-pointer "
					data-tip={LL.FRONT()}
				>
					<img
						src={Front}
						alt={LL.FRONT()}
						onClick={() => {
							selectCameraPerspective("FRONT");
						}}
					/>
				</div>
				<div
					className="tooltip h-10 w-10 cursor-pointer "
					data-tip={LL.BACK()}
				>
					<img
						src={Back}
						alt={LL.BACK()}
						onClick={() => {
							selectCameraPerspective("BACK");
						}}
					/>
				</div>
			</div>
		</StandardContainer>
	);
}
