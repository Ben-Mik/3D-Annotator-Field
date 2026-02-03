import {
	MAX_ANNOTATION_CLASS,
	NEUTRAL_LABEL,
	type AnnotationsLUT,
	type Label,
} from "~entity/Annotation";
import { Color } from "~entity/Color";
import { ModelType } from "~entity/ModelInformation";
import { assertUnreachable, type Prettify } from "~util/TypeScript";
import type { Serializer, SerializerData, Writer } from "../../Serializer";

/**
 * The base options, applying to all output modes.
 */
export interface SerializerPngBaseOptions {
	/**
	 * If `true`, annotations for labels where `annotationVisible`
	 * is `false` will be treated as neutral (un-annotated).
	 * @default false
	 */
	respectLabelVisibility?: boolean;
}

/**
 * Configuration for the "annotationClass" output mode.
 * R, G, and B values are all set to the `annotationClass`, resulting
 * in a grayscale image.
 */
export interface SerializerPngAnnotationClassOptions
	extends SerializerPngBaseOptions {
	/** The "annotationClass" output mode. */
	mode: "annotationClass";

	/**
	 * The `Uint8` (0-255) value to use for the neutral (un-annotated) class.
	 * @default NEUTRAL_LABEL.annotationClass
	 */
	neutralValue?: number;
}

/**
 * Configuration for the "color" output mode.
 * R, G, and B are set to the `Label.color`.
 */
export interface SerializerPngColorOptions extends SerializerPngBaseOptions {
	/** Specifies the "color" output mode. */
	mode: "color";

	/**
	 * The {@link Color} value to use for the neutral (un-annotated) class.
	 * @default white (r=g=b=255)
	 */
	neutralColor?: Color;
}

/**
 * Configuration for the "blended" output mode.
 * `Label.color` is alpha-blended on top of the `originalTexture`.
 */
export interface SerializerPngBlendedOptions extends SerializerPngBaseOptions {
	/** Specifies the "blended" output mode. */
	mode: "blended";

	/**
	 * The data attribute of the `ImageData` of the original texture.
	 * This is **required** for the "blended" mode.
	 */
	originalColors: Uint8ClampedArray;

	/**
	 * The opacity (0.0 to 1.0) of the annotation color
	 * when blended with the original texture.
	 * @default 1.0
	 */
	opacity?: number;
}

/**
 * The PNG Serializer options.
 * The `mode` property determines which other options are valid.
 */
export type SerializerPngOptions =
	| SerializerPngAnnotationClassOptions
	| SerializerPngColorOptions
	| SerializerPngBlendedOptions;

/**
 * The *internal* resolved options, as a discriminated union.
 * All properties are guaranteed to be defined.
 */
type ResolvedOptions = Prettify<
	| Required<SerializerPngAnnotationClassOptions>
	| Required<SerializerPngColorOptions>
	| Required<SerializerPngBlendedOptions>
>;

/**
 * A serializer for the "anno3d" PNG file format.
 *
 * This implementation relies on browser canvas APIs.
 * It only supports `ModelType.TEXTURE_MESH`.
 */
export class SerializerPng implements Serializer {
	private readonly _options: ResolvedOptions;

	private readonly _visibleLUT: Uint8Array;
	private readonly _labelColorsR: Uint8Array;
	private readonly _labelColorsG: Uint8Array;
	private readonly _labelColorsB: Uint8Array;

	/**
	 * Constructs a new `SerializerPng`.
	 *
	 * @param options Optional configuration for the serializer.
	 */
	constructor(options?: SerializerPngOptions) {
		const resolvedOptions = options ?? { mode: "annotationClass" };

		switch (resolvedOptions.mode) {
			case "annotationClass":
				this._options = {
					mode: "annotationClass",
					respectLabelVisibility:
						resolvedOptions.respectLabelVisibility ?? false,
					neutralValue:
						resolvedOptions.neutralValue ??
						NEUTRAL_LABEL.annotationClass,
				};
				break;

			case "color":
				this._options = {
					mode: "color",
					respectLabelVisibility:
						resolvedOptions.respectLabelVisibility ?? false,
					neutralColor:
						resolvedOptions.neutralColor ??
						new Color(255, 255, 255),
				};
				break;

			case "blended":
				this._options = {
					mode: "blended",
					respectLabelVisibility:
						resolvedOptions.respectLabelVisibility ?? false,
					originalColors: resolvedOptions.originalColors,
					opacity: resolvedOptions.opacity ?? 1.0,
				};
				break;

			default:
				assertUnreachable(resolvedOptions);
		}

		const numClasses = MAX_ANNOTATION_CLASS + 1;
		this._visibleLUT = new Uint8Array(numClasses);
		this._labelColorsR = new Uint8Array(numClasses);
		this._labelColorsG = new Uint8Array(numClasses);
		this._labelColorsB = new Uint8Array(numClasses);
	}

	/**
	 * Serializes the annotation data into a new `ArrayBuffer`.
	 *
	 * @param data The in-memory annotation data to serialize.
	 * @returns A Promise that resolves with an `ArrayBuffer` of the PNG file.
	 */
	public async serialize(data: SerializerData): Promise<ArrayBuffer>;
	/**
	 * Serializes `data` using a `Writer`.
	 *
	 * @param data The in-memory annotation data to serialize.
	 * @param writer The `Writer` instance to write data to.
	 * @returns A Promise that resolves with the total number of bytes written.
	 */
	public async serialize(
		data: SerializerData,
		writer: Writer
	): Promise<number>;
	public async serialize(
		data: SerializerData,
		writer?: Writer
	): Promise<number | ArrayBuffer> {
		this._validateNeutralLabel(data.labels);

		const buffer = await this._serializeToBuffer(data);

		if (writer) {
			// This implementation does not support streaming the output.
			return writer.write(buffer);
		} else {
			return buffer;
		}
	}

	/**
	 * Validates that no label in the list uses the same annotation
	 * class as the designated neutral class.
	 *
	 * @param labels The list of active labels.
	 */
	private _validateNeutralLabel(labels: Label[]): void {
		if (this._options.mode !== "annotationClass") {
			return;
		}

		const { neutralValue } = this._options;
		for (const label of labels) {
			if (label.annotationClass !== neutralValue) {
				continue;
			}

			throw new Error(
				`Annotation class collision. Neutral class: ${neutralValue}, ` +
					`Label: ${label.name} (${label.annotationClass}) `
			);
		}
	}

	/**
	 * Internal implementation for `serialize(data)`.
	 *
	 * @param data The annotation data.
	 * @returns A Promise resolving with an `ArrayBuffer` of the PNG file.
	 */
	private async _serializeToBuffer(
		data: SerializerData
	): Promise<ArrayBuffer> {
		if (data.modelType !== ModelType.TEXTURE_MESH) {
			throw new Error(
				"SerializerPng: Serialization is only supported for ModelType.TEXTURE_MESH."
			);
		}

		const { width, height, annotations, labels } = data;

		if (width * height !== annotations.length) {
			throw new Error(
				`Data mismatch: Texture dimensions (${width}x${height}) do not match annotations length (${annotations.length}).`
			);
		}

		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext("2d");
		if (!context) {
			throw new Error("Failed to get OffscreenCanvas 2D context.");
		}
		const imageData = context.createImageData(width, height);

		this._updateVisibleLUT(labels);
		this._updateColorLUTs(labels);

		this._writePixelData(imageData, annotations);

		context.putImageData(imageData, 0, 0);
		const blob = await canvas.convertToBlob({ type: "image/png" });
		return blob.arrayBuffer();
	}

	/**
	 * Fills the `_visibleLUT` based on the current options and
	 * the label visibility flags.
	 *
	 * @param labels The application's list of labels.
	 */
	private _updateVisibleLUT(labels: Label[]): void {
		const visibleLUT = this._visibleLUT;
		visibleLUT.fill(1); // default to visible
		visibleLUT[NEUTRAL_LABEL.annotationClass] = 0;

		if (!this._options.respectLabelVisibility) {
			return;
		}

		for (const label of labels) {
			if (!label.annotationVisible || label.isNeutral) {
				visibleLUT[label.annotationClass] = 0; // not visible
			}
		}
	}

	/**
	 * Fills the R, G, and B color LUTs based on serialization options.
	 *
	 * @param labels The application's list of labels.
	 */
	private _updateColorLUTs(labels: Label[]): void {
		const colorsR = this._labelColorsR;
		const colorsG = this._labelColorsG;
		const colorsB = this._labelColorsB;

		for (const label of labels) {
			const annotationClass = label.annotationClass;
			const color = label.color.intRGBValues;

			switch (this._options.mode) {
				case "annotationClass":
					colorsR[annotationClass] = annotationClass;
					colorsG[annotationClass] = annotationClass;
					colorsB[annotationClass] = annotationClass;
					break;

				case "color":
				case "blended":
					colorsR[annotationClass] = color[0];
					colorsG[annotationClass] = color[1];
					colorsB[annotationClass] = color[2];
					break;

				default:
					assertUnreachable(this._options);
			}
		}
	}

	/**
	 * Writes the final pixel data into the `ImageData` object.
	 *
	 * This is the main, high-performance rendering loop. It iterates through
	 * every annotation and, based on the serializer options, writes the
	 * correct pixel (grayscale, color, or blended) into the
	 * `targetImage.data` buffer.
	 *
	 * @param targetImage The `ImageData` object to write into.
	 * @param annotations The `AnnotationsLUT`.
	 */
	private _writePixelData(
		targetImage: ImageData,
		annotations: AnnotationsLUT
	): void {
		const visibleLUT = this._visibleLUT;
		const labelColorsR = this._labelColorsR;
		const labelColorsG = this._labelColorsG;
		const labelColorsB = this._labelColorsB;

		const target = targetImage.data;
		const n = annotations.length;

		switch (this._options.mode) {
			case "annotationClass": {
				const { neutralValue } = this._options;

				for (let i = 0, p = 0; i < n; i++, p += 4) {
					const annotationClass = annotations[i];

					if (visibleLUT[annotationClass]) {
						target[p] = labelColorsR[annotationClass];
						target[p + 1] = labelColorsG[annotationClass];
						target[p + 2] = labelColorsB[annotationClass];
					} else {
						target[p] = neutralValue;
						target[p + 1] = neutralValue;
						target[p + 2] = neutralValue;
					}
					target[p + 3] = 255; // alpha
				}
				break;
			}

			case "color": {
				const { neutralColor } = this._options;
				const neutralR = neutralColor.red;
				const neutralG = neutralColor.green;
				const neutralB = neutralColor.blue;

				for (let i = 0, p = 0; i < n; i++, p += 4) {
					const annotationClass = annotations[i];

					if (visibleLUT[annotationClass]) {
						target[p] = labelColorsR[annotationClass];
						target[p + 1] = labelColorsG[annotationClass];
						target[p + 2] = labelColorsB[annotationClass];
					} else {
						target[p] = neutralR;
						target[p + 1] = neutralG;
						target[p + 2] = neutralB;
					}
					target[p + 3] = 255; // alpha
				}
				break;
			}

			case "blended": {
				const { opacity, originalColors } = this._options;
				const oneMinusOpacity = 1.0 - opacity;

				for (let i = 0, p = 0; i < n; i++, p += 4) {
					const annotationClass = annotations[i];

					if (visibleLUT[annotationClass]) {
						// blend
						target[p] =
							opacity * labelColorsR[annotationClass] +
							oneMinusOpacity * originalColors[p];
						target[p + 1] =
							opacity * labelColorsG[annotationClass] +
							oneMinusOpacity * originalColors[p + 1];
						target[p + 2] =
							opacity * labelColorsB[annotationClass] +
							oneMinusOpacity * originalColors[p + 2];
					} else {
						// show original
						target[p] = originalColors[p];
						target[p + 1] = originalColors[p + 1];
						target[p + 2] = originalColors[p + 2];
					}
					target[p + 3] = 255; // alpha
				}
				break;
			}

			default:
				assertUnreachable(this._options);
		}
	}
}
