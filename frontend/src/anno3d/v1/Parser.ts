import { type Result } from "neverthrow";
import { type AnnotationsLUT } from "~entity/Annotation";

/**
 * A Parser for Annotation Files
 */
export interface Parser {
	/**
	 * Parses a ReadableStream to AnnotationData
	 *
	 * @param data a ReadableStream streaming the content of the file
	 * @returns AnnotationData
	 */
	parse(data: ReadableStream<Uint8Array>): ParserResult;
}

export type ParserResult = Promise<Result<AnnotationsLUT, ParserError>>;

export type ParserError =
	| UnknownLabelError
	| DuplicateLabelError
	| UnsupportedError
	| ParsingError;

interface ParserErrorShape {
	code: string;
	lineNumber: number;
	message: string;
	payload?: object;
}

interface UnknownLabelError extends ParserErrorShape {
	code: "UNKNOWN_LABEL";
	payload: {
		annotationClass: number;
	};
}

export interface DuplicateLabelError extends ParserErrorShape {
	code: "DUPLICATE_LABEL";
	payload: {
		annotationClass: number;
	};
}

export interface UnsupportedError extends ParserErrorShape {
	code: "UNSUPPORTED";
	payload: {
		format: string;
		version: string;
	};
}

export interface ParsingError extends ParserErrorShape {
	code: "PARSING_ERROR";
	lineNumber: number;
	message: string;
}
