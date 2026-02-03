import { err, ok, type Err, type Result } from "neverthrow";
import { type Label } from "~entity/Annotation";
import { ReadableStreamBufferedLineReader } from "~util/streams/ReadableStreamBufferedLineReader";
import { assertSoftUnreachable } from "~util/TypeScript";
import * as AnnotationFileV1 from ".";

/**
 * The file information
 */
interface FileInformation {
	format: string;
	version: string;
}

/**
 * A generic AnnotationFileParser which reads the file format and version of
 * the file and selects the appropriate AnnotationFileParser.
 */
export class GenericAnnotationFileParser implements AnnotationFileV1.Parser {
	private readonly labels: Label[];

	constructor(labels: Label[]) {
		this.labels = labels;
	}

	/**
	 * Parses the file using a dynamically selected AnnotationFileParser.
	 *
	 * @param data a ReadAbleStream streaming the file's content
	 * @returns AnnotationData
	 * @throws an Error if the file's format and version are not supported
	 */
	public async parse(
		data: ReadableStream<Uint8Array>
	): AnnotationFileV1.ParserResult {
		/*
		 * Tee the Stream to get one stream for determineFileFormatAndVersion()
		 * and one Stream for the parse() method of the specific Parser.
		 */
		const [fileInfoStream, parserStream] = data.tee();
		const { format, version } = await this.determineFileInformation(
			fileInfoStream // will be canceled by the function
		);

		const result = this.getParser({ format, version });

		if (result.isErr()) {
			return err(result.error);
		}

		const parser = result.value;
		return parser.parse(parserStream);
	}

	/**
	 * Extracts information about the format and the version of the file
	 * then closes the stream.
	 *
	 * @param stream a ReadableStream streaming the file's content
	 * @returns format and version
	 */
	private async determineFileInformation(
		stream: ReadableStream
	): Promise<FileInformation> {
		const reader = new ReadableStreamBufferedLineReader(stream);
		const formatLine = await reader.nextLine();
		const versionLine = await reader.nextLine();
		void reader.cancel();
		return {
			format: formatLine.substring(7, 11),
			version: versionLine.substring(8, 11),
		};
	}

	/**
	 * Selects the appropriate AnnotationFileParse by the file's format and version.
	 *
	 * @param info the file's format and version
	 * @returns the appropriate AnnotationFileParser
	 */
	private getParser(
		info: FileInformation
	): Result<AnnotationFileV1.Parser, AnnotationFileV1.UnsupportedError> {
		const format = info.format as AnnotationFileV1.Format;
		switch (format) {
			case AnnotationFileV1.Format.UTF8:
				return this.getUTF8Parser(info);
			default:
				assertSoftUnreachable(format);
				return this.getUnsupportedError(info);
		}
	}

	/**
	 * Selects the appropriate AnnotationFileParse for UTF8 files by it's version.
	 *
	 * @param info the file's format and version
	 * @returns the appropriate AnnotationFileParser
	 */
	private getUTF8Parser(
		info: FileInformation
	): Result<AnnotationFileV1.Parser, AnnotationFileV1.UnsupportedError> {
		const version = info.version as AnnotationFileV1.Version;
		switch (version) {
			case AnnotationFileV1.Version.ONE:
				return ok(new AnnotationFileV1.ParserUtf8(this.labels));
			default:
				assertSoftUnreachable(version);
				return this.getUnsupportedError(info);
		}
	}

	private getUnsupportedError(
		info: FileInformation
	): Err<AnnotationFileV1.Parser, AnnotationFileV1.UnsupportedError> {
		return err({
			code: "UNSUPPORTED",
			lineNumber: 1,
			message: `The file format '${info.format}' version '${info.version}' is not supported.`,
			payload: {
				format: info.format,
				version: info.version,
			},
		});
	}
}
