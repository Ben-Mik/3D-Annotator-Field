import { err, ok } from "neverthrow";
import {
	getEmptyAnnotationsLUT,
	type AnnotationsLUT,
	type Label,
} from "~entity/Annotation";
import { wait } from "~util/Timeout";
import { type BufferedLineReader } from "~util/streams/BufferedLineReader";
import { ReadableStreamBufferedLineReader } from "~util/streams/ReadableStreamBufferedLineReader";
import { type Parser, type ParserResult } from "../Parser";

/**
 * UTF8 Parser
 */
export class ParserUtf8 implements Parser {
	private parser: ParserUtf8Helper;

	constructor(labels: Label[]) {
		this.parser = new ParserUtf8Helper(labels);
	}

	parse(data: ReadableStream<Uint8Array>): ParserResult {
		const reader = new ReadableStreamBufferedLineReader(data);
		return this.parser.parse(reader);
	}
}

export class ParserUtf8Helper {
	private readonly labels = new Map<
		number,
		{ used: boolean; label: Label }
	>();

	/**
	 * Constructs a new instance of AnnotationFileParserUTF8v1
	 *
	 * @param labels the label to parse
	 */
	constructor(labels: Label[]) {
		for (const label of labels) {
			this.labels.set(label.annotationClass, {
				used: false,
				label: label,
			});
		}
	}

	private resetLabelsMap() {
		for (const entry of this.labels.values()) {
			entry.used = false;
		}
	}

	/**
	 * Parses a ReadableStream
	 *
	 * @param data a ReadableStream
	 * @returns LabeledAnnotationData
	 */
	public async parse(reader: BufferedLineReader): ParserResult {
		this.resetLabelsMap();

		// the first three lines contain file type, version and number of indices which are all ignored
		await reader.nextLine();
		await reader.nextLine();

		const countLine = await reader.nextLine();
		const count = this.parseCountHeader(countLine);
		let lineNumber = 3;
		if (!countLine.startsWith("count") || isNaN(count)) {
			return err({
				code: "PARSING_ERROR",
				lineNumber: lineNumber,
				message: `Expected a count header but got: '${countLine}'.`,
			});
		}

		const annotationData: AnnotationsLUT = getEmptyAnnotationsLUT(count);

		while (await reader.hasNextLine()) {
			const line = reader.nextBufferedLine();
			lineNumber++;

			if (!line.startsWith("label")) {
				return err({
					code: "PARSING_ERROR",
					lineNumber: lineNumber,
					message: `Expected a label header but got: '${line}'.`,
				});
			}

			const { annotationClass, indicesCount } =
				this.parseLabelHeader(line);

			const entry = this.labels.get(annotationClass);
			if (!entry) {
				return err({
					code: "UNKNOWN_LABEL",
					lineNumber: lineNumber,
					message: `There is not label with the annotation class ${annotationClass}.`,
					payload: {
						annotationClass: annotationClass,
					},
				});
			}
			if (entry.used) {
				return err({
					code: "DUPLICATE_LABEL",
					lineNumber: lineNumber,
					message: `The label with the annotation class ${annotationClass} was already parsed.`,
					payload: {
						annotationClass: annotationClass,
					},
				});
			}

			for (let i = 0; i < indicesCount; i++) {
				let indexLine: string;
				if (reader.hasBufferedNextLine()) {
					indexLine = reader.nextBufferedLine();
				} else {
					// reduce the chance of blocking the main thread with wait
					await wait();
					indexLine = await reader.nextLine();
				}

				const index = +indexLine;
				if (isNaN(index)) {
					return err({
						code: "PARSING_ERROR",
						lineNumber: lineNumber,
						message: `Expected a number but got: '${index}'.`,
					});
				}

				if (index < 0 || index >= count) {
					return err({
						code: "PARSING_ERROR",
						lineNumber: lineNumber,
						message: `Expected an face/point index but got: '${index}'. (out of bound)`,
					});
				}

				annotationData[+index] = annotationClass;
				lineNumber++;
			}

			entry.used = true;
		}

		return ok(annotationData);
	}

	/**
	 * Parses the Label header
	 *
	 * @param line the line to parse
	 * @returns the parsed header information
	 */
	private parseLabelHeader(line: string) {
		const [, annotationClass, indicesCount] = line.split(" ", 3);
		return {
			annotationClass: +annotationClass,
			indicesCount: +indicesCount,
		};
	}

	private parseCountHeader(line: string) {
		const [, count] = line.split(" ", 2);
		return +count;
	}
}
