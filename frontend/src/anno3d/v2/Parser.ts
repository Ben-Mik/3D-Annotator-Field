import { type Result } from "neverthrow";
import type { AnnotationsLUT, Label } from "~entity/Annotation";
import type { ModelType } from "~entity/ModelInformation";
import type { Prettify } from "~util/TypeScript";

/**
 * A Parser for anno3d file data.
 */
export interface Parser {
	/**
	 * Parses the contents of a file and validates it against the
	 * application's known labels.
	 *
	 * @param data The content of the file.
	 * @param labels The application's current list of labels to validate against.
	 * @returns A Result object containing the parsed data or a ParserError.
	 */
	parse(data: Uint8Array, labels: Label[]): Promise<ParserResult>;
}

interface ParserDataBase {
	annotations: AnnotationsLUT;
}

type ParserDataModelType =
	| {
			modelType: ModelType.MESH | ModelType.POINT_CLOUD | "UNKNOWN";
	  }
	| { modelType: ModelType.TEXTURE_MESH; width: number; height: number };

export type ParserData = Prettify<ParserDataBase & ParserDataModelType>;

export type ParserResult = Result<ParserData, ParserError>;

/**
 * A union of all possible errors that can occur during file parsing.
 */
export type ParserError =
	| UnknownLabelError
	| DuplicateLabelError
	| InconsistentLabelsError
	| InvalidNeutralLabelError
	| UnknownModelTypeError
	| UnknownFileTypeError
	| UnsupportedError
	| ParsingError;

/**
 * The base shape for all parser errors.
 */
interface ParserErrorShape {
	/** A unique error code identifying the type of error. */
	code: string;
	/**
	 * The byte offset (for binary) or line number (for text) where
	 * the error was detected. 0 if not applicable.
	 */
	position: number;
	/** A human-readable error message. */
	message: string;
	/** An optional object containing error-specific context. */
	payload?: object;
}

/**
 * Error: An annotation class in the file is not known to the application.
 *
 * This error is thrown when an annotation class listed in the file (e.g, in
 * the binary `CLST` chunk, the binary `DATA` chunk or a text `label` directive)
 * is not found in the `Labels` array provided to the parser.
 *
 * Thrown by: `ParserBinary`, `ParserUtf8`.
 */
export interface UnknownLabelError extends ParserErrorShape {
	code: "UNKNOWN_LABEL";
	payload: {
		/** The annotation class that was not found in `Labels`. */
		annotationClass: number;
	};
}

/**
 * Error: A `label` directive is defined more than once.
 *
 * This error is thrown by the UTF-8 parser when it encounters a
 * `label <annotation_class> ...` directive for an annotation class
 * that has already been defined earlier in the file.
 *
 * Thrown by: `ParserUtf8`.
 */
export interface DuplicateLabelError extends ParserErrorShape {
	code: "DUPLICATE_LABEL";
	payload: {
		/** The annotation class that was defined multiple times. */
		annotationClass: number;
	};
}

/**
 * Error: The `DATA` chunk contains an undeclared annotation class.
 *
 * This error is thrown by the binary parser if an annotation class
 * is found in the main `DATA` payload that was *not* declared in the
 * `CLST` (class list) chunk. This indicates a corrupt or malformed file.
 *
 * Thrown by: `ParserBinary`.
 */
export interface InconsistentLabelsError extends ParserErrorShape {
	code: "INCONSISTENT_LABELS";
	payload: {
		/** The annotation class found in `DATA` but missing from `CLST`. */
		annotationClass: number;
	};
}

/**
 * Error: The file's neutral class is also listed as an active class.
 *
 * This error is thrown by the binary parser and png parser if the desired
 * `neutralClass` (specified in the `HEAD` chunk or given as an option),
 * is *also* present in the active label list given to the parser.
 * This indicates an user error, as a class cannot be both neutral and
 * active.
 *
 * Thrown by: `ParserBinary` and `ParserPNG`.
 */
export interface InvalidNeutralLabelError extends ParserErrorShape {
	code: "INVALID_NEUTRAL_LABEL";
	payload: {
		/** The conflicting annotation class. */
		annotationClass: number;
	};
}

/**
 * Error: The file specifies an unknown model type.
 *
 * This error is thrown if the `mode` field (e.g., `HEAD.Mode` in binary
 * or `mode:` in text) contains a value that is not recognized
 * by the parser.
 *
 * Thrown by: `ParserBinary`, `ParserUtf8`.
 */
export interface UnknownModelTypeError extends ParserErrorShape {
	code: "UNKNOWN_MODEL_TYPE";
	payload: {
		/** The unknown model type value read from the file. */
		modelType: number | string;
	};
}

/**
 * Error: The file is not a recognizable format.
 *
 * This error is thrown if the file's magic identifier (the first few
 * bytes) is incorrect.
 * - For binary, the `ANNO3D_B` magic number is wrong.
 * - For text, the `# ANNO3D-UTF-8` magic comment is missing or wrong.
 * - For png, the file could not be converted into a image bitmap.
 *
 * Thrown by: `ParserBinary`, `ParserUtf8`, `ParserPng`.
 */
export interface UnknownFileTypeError extends ParserErrorShape {
	code: "UNKNOWN_FILE_TYPE";
}

/**
 * Error: The file format version is not supported by this parser.
 *
 * This error is thrown if the file's `version` field is valid but
 * represents a version that the parser is not designed to handle
 * (e.g., a future v3.0 file).
 *
 * Thrown by: `ParserBinary`, `ParserUtf8`.
 */
export interface UnsupportedError extends ParserErrorShape {
	code: "UNSUPPORTED";
	payload: {
		/** The format identifier (e.g., "anno3d binary"). */
		format: string;
		/** The unsupported version string (e.g., "3.0"). */
		version: string;
		/** The expected version string (e.g., "2.0"). */
		expectedVersion: string;
	};
}

/**
 * Error: A generic syntax or structural error occurred.
 *
 * This is a catch-all for file integrity errors not covered by
 * other specific types, such as:
 * - A chunk's declared length mismatches its actual size.
 * - The file is truncated unexpectedly.
 * - A text file is missing the `data_start` separator.
 * - A text file contains an invalid number.
 *
 * Thrown by: `ParserBinary`, `ParserUtf8`.
 */
export interface ParsingError extends ParserErrorShape {
	code: "PARSING_ERROR";
}
