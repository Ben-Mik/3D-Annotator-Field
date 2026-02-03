import { err, ok } from "neverthrow";
import { NEUTRAL_LABEL, type Label } from "~entity/Annotation";
import { ModelType } from "~entity/ModelInformation";
import type { Parser, ParserData, ParserResult } from "../../Parser";

/**
 * Options for the png parser.
 */
export interface ParserPngOptions {
	/**
	 * The `Uint8` (0-255) value to interpret as the neutral (un-annotated) class.
	 * @default NEUTRAL_LABEL.annotationClass
	 */
	neutralValue?: number;
}

/**
 * A parser for the "anno3d" PNG file format.
 *
 * This implementation relies on browser image decoding APIs.
 * It *only* supports grayscale images, where the annotation class
 * is stored in the R, G, and B channels.
 *
 * It will fail to parse color-mapped images, as they
 * are ambiguous and do not contain the raw annotation class data.
 */
export class ParserPng implements Parser {
	private readonly _neutralValue: number;

	/**
	 * Constructs a new `ParserPng`.
	 */
	constructor(options?: ParserPngOptions) {
		this._neutralValue =
			options?.neutralValue === undefined
				? NEUTRAL_LABEL.annotationClass
				: options.neutralValue;
	}

	/**
	 * Parses the contents of a PNG file and validates it against the
	 * application's known labels.
	 *
	 * @param data The contents of the file.
	 * @param labels The application's current list of labels to validate against.
	 * @returns A Promise resolving with a ParserResult.
	 */
	public async parse(
		data: Uint8Array,
		labels: Label[]
	): Promise<ParserResult> {
		for (const label of labels) {
			if (label.annotationClass !== this._neutralValue) {
				continue;
			}

			return err({
				code: "INVALID_NEUTRAL_LABEL",
				position: 0, // Not tied to a specific offset
				message: `The neutral annotation class (${this._neutralValue}) is also used by the known labels.`,
				payload: { annotationClass: this._neutralValue },
			});
		}

		try {
			return this._parse(data, labels);
		} catch (error: unknown) {
			const message =
				error instanceof Error
					? error.message
					: "An unknown error occurred.";

			// DOMException is thrown by createImageBitmap for invalid images
			if (message.includes("DOMException")) {
				return err({
					code: "UNKNOWN_FILE_TYPE",
					position: 0,
					message: "File is not a valid or supported PNG image.",
				});
			}
			return err({
				code: "PARSING_ERROR",
				position: 0,
				message: `Unexpected parser failure: ${message}`,
			});
		}
	}

	/**
	 * Internal parsing logic, wrapped by the public `parse` method.
	 *
	 * @param data The raw file data.
	 * @param labels The list of known labels.
	 * @returns A Promise resolving with a ParserResult.
	 */
	private async _parse(
		data: Uint8Array,
		labels: Label[]
	): Promise<ParserResult> {
		const blob = new Blob([data], { type: "image/png" });
		const imageBitmap = await createImageBitmap(blob);
		const { width, height } = imageBitmap;

		if (width === 0 || height === 0) {
			return err({
				code: "PARSING_ERROR",
				position: 0,
				message: "Image has zero width or height.",
			});
		}

		const canvas = new OffscreenCanvas(width, height);
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			throw new Error("Failed to get OffscreenCanvas 2D context.");
		}

		ctx.drawImage(imageBitmap, 0, 0);
		const imageData = ctx.getImageData(0, 0, width, height);
		const pixelData = imageData.data; // Uint8ClampedArray

		const totalElements = width * height;
		const annotations = new Uint8Array(totalElements);
		const knownLabels = new Set<number>(
			labels.map((label) => label.annotationClass)
		);

		for (let i = 0, p = 0; i < totalElements; i++, p += 4) {
			const r = pixelData[p];
			const g = pixelData[p + 1];
			const b = pixelData[p + 2];

			if (r !== g || r !== b) {
				return err({
					code: "PARSING_ERROR",
					position: i, // pixel index
					message:
						`Image is not a parsable grayscale annotation file. ` +
						`Found color pixel (${r},${g},${b}) at index ${i}. ` +
						`Only grayscale images can be parsed.`,
				});
			}

			const annotationClass = r;

			if (annotationClass === this._neutralValue) {
				annotations[i] = NEUTRAL_LABEL.annotationClass;
				continue;
			}

			annotations[i] = annotationClass;

			if (!knownLabels.has(annotationClass)) {
				return err({
					code: "UNKNOWN_LABEL",
					position: 0, // Not tied to a specific pixel
					message:
						`Image contains annotation class ${annotationClass} ` +
						`which is not in the list of known labels.`,
					payload: { annotationClass },
				});
			}
		}

		const parserData: ParserData = {
			modelType: ModelType.TEXTURE_MESH,
			width,
			height,
			annotations,
		};
		return ok(parserData);
	}
}
