import { Vector3 } from "three";

export const PERSPECTIVES = [
	"TOP",
	"BOTTOM",
	"LEFT",
	"RIGHT",
	"FRONT",
	"BACK",
] as const;

/**
 * The static camera Perspectives
 */
export type Perspective = (typeof PERSPECTIVES)[number];

export const PERSPECTIVE_TO_VECTOR3: { [key in Perspective]: Vector3 } = {
	TOP: new Vector3(0, 0, 1),
	BOTTOM: new Vector3(0, 0, -1),
	FRONT: new Vector3(0, 1, 0),
	BACK: new Vector3(0, -1, 0),
	LEFT: new Vector3(1, 0, 0),
	RIGHT: new Vector3(-1, 0, 0),
};
