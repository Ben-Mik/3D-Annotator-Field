import type { Label } from "~entity/Annotation";
import { MutableLabel } from "~entity/Annotation"; // Or a simpler POJO implementation
import {
	boolean,
	map,
	number,
	string,
	struct,
} from "~workers/combinators/Combinators";
import { COLOR_WORKER_CODEC } from "./Color";

const labelStruct = struct({
	id: number,
	annotationClass: number,
	name: string,
	color: COLOR_WORKER_CODEC,
	annotationVisible: boolean,
	locked: boolean,
	isNeutral: boolean,
});

export const LABEL_WORKER_CODEC = map(
	labelStruct,
	(dto) => {
		const label = new MutableLabel(
			dto.id,
			dto.annotationClass,
			dto.name,
			dto.color
		);
		label.annotationVisible = dto.annotationVisible;
		label.locked = dto.locked;
		return label as Label;
	},
	(label: Label) => ({
		id: label.id,
		annotationClass: label.annotationClass,
		name: label.name,
		color: label.color,
		annotationVisible: label.annotationVisible,
		locked: label.locked,
		isNeutral: label.isNeutral,
	})
);
