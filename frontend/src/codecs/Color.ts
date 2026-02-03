import { Color } from "~entity/Color";
import { map, number, struct } from "~workers/combinators/Combinators";

const colorStruct = struct({
	red: number,
	green: number,
	blue: number,
});

export const COLOR_WORKER_CODEC = map(
	colorStruct,
	(dto) => new Color(dto.red, dto.green, dto.blue),
	(color) => ({ red: color.red, green: color.green, blue: color.blue })
);
