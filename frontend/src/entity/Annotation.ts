import { Color } from "./Color";

/**
 * Array of values that each identify an entity that is annotated.
 *
 * In case of triangle meshes/point clouds, this is the index of the
 * triangle or point.
 * In case of textures, this is the index of a pixel (e.g., y * width + x).
 *
 */
export type AnnotationData = ArrayLike<number>;
export type AnnotationDataArray = number[];

/**
 * Maps a single label to AnnotationData
 */
export interface LabeledAnnotationData<
	T extends AnnotationData | AnnotationDataArray = AnnotationData
> {
	label: Label;
	data: T;
}

const UINT8_MAX = Math.pow(2, 8) - 1;
const RESERVED_ANNOTATION_CLASS_COUNT = 5;

export const MIN_ANNOTATION_CLASS = 0;
export const MAX_ANNOTATION_CLASS = UINT8_MAX - RESERVED_ANNOTATION_CLASS_COUNT;

/**
 * Maps AnnotationData to annotation classes.
 * Must have the length of max(AnnotationData), where
 * AnnotationData is filled with every possible value.
 */
export type AnnotationsLUT = Uint8Array;

export function isAnnotationsLUT(obj: unknown): obj is AnnotationsLUT {
	return obj instanceof Uint8Array;
}

export function getEmptyAnnotationsLUT(
	length: number,
	shared = false
): AnnotationsLUT {
	const buffer = shared
		? new SharedArrayBuffer(length)
		: new ArrayBuffer(length);
	const annotations = new Uint8Array(buffer);
	annotations.fill(NEUTRAL_ANNOTATION_CLASS);
	return annotations;
}

/**
 * Maps Labels to AnnotationData.
 */
export type AnnotationsMap = Map<Label, AnnotationData>;

/**
 * The neutral annotation class.
 * set to the max int in Uint6 (2^8 - 1)
 */
const NEUTRAL_ANNOTATION_CLASS = UINT8_MAX;

/**
 * An annotation label.
 */
export interface Label {
	readonly id: number;
	readonly annotationClass: number;
	readonly name: string;
	readonly color: Color;
	readonly annotationVisible: boolean;
	readonly locked: boolean;
	readonly isNeutral: boolean;
}

/**
 * A concrete label that allows state mutation (`annotationVisible` and `locked`).
 */
export class MutableLabel implements Label {
	public readonly id: number;
	public readonly annotationClass: number;
	public readonly name: string;
	public readonly color: Color;

	public readonly isNeutral: boolean;

	public annotationVisible = true;
	public locked = false;

	constructor(
		id: number,
		annotationClass: number,
		name: string,
		color: Color
	) {
		this.id = id;

		if (
			annotationClass < MIN_ANNOTATION_CLASS ||
			annotationClass > NEUTRAL_ANNOTATION_CLASS
		) {
			throw new Error("'annotationClass' is out of bounds.");
		}
		this.annotationClass = annotationClass;

		this.name = name;
		this.color = color;

		this.isNeutral = annotationClass === NEUTRAL_ANNOTATION_CLASS;
	}
}

/**
 * The neutral label
 */
export const NEUTRAL_LABEL: Label = new MutableLabel(
	0,
	NEUTRAL_ANNOTATION_CLASS,
	"neutralLabel",
	new Color(0, 0, 0)
);

/**
 * Maps annotation classes to labels.
 *
 * TODO: Deprecate
 */
export type LabelMap = Map<number, Label>;

/**
 * Maps annotation classes to labels.
 */
export type LabelLUT = readonly (Label | undefined)[];

/**
 * Maps annotation classes to mutable labels.
 */
export type MutableLabelLUT = (MutableLabel | undefined)[];
