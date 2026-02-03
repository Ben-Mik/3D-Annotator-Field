import { type AnnotationsLUT, type Label } from "~entity/Annotation";
import { type BufferedWriter } from "~util/streams/BufferedWriter";
import { WritableStreamBufferedWriter } from "~util/streams/WritableStreamBufferedWriter";
import {
	Format,
	Version,
	formatFileHeader,
	type Serializer,
} from "../Serializer";

/**
 * An {@link Serializer} creating UTF-8 encoded files for anno3d
 * {@link Version.ONE}.
 */
export class SerializerUtf8 implements Serializer {
	private serializer: SerializerUtf8Helper;

	constructor(labels: Label[]) {
		this.serializer = new SerializerUtf8Helper(labels);
	}

	/**
	 * Serializes data to a ReadableStream
	 *
	 * @param data the data
	 * @returns the ReadableStream
	 */
	public serialize(data: AnnotationsLUT): ReadableStream<Uint8Array> {
		const { readable, writable } = new TransformStream<
			AnnotationsLUT,
			Uint8Array
		>();
		const writer = new WritableStreamBufferedWriter(writable);
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		this.serializer.serializeData(data, writer);
		return readable;
	}
}

export class SerializerUtf8Helper {
	private readonly encoder: TextEncoder = new TextEncoder();
	private readonly labels: Label[];
	private writer?: BufferedWriter;

	/**
	 * Constructs a new Serializer.
	 *
	 * @param labels an array of all {@link Label Labels} that will be
	 *               referenced by the `data` array passed to
	 *               {@link serialize()}
	 */
	constructor(labels: Label[]) {
		this.labels = labels;
	}

	/**
	 * Serializes buffered Annotation data
	 *
	 * @param data a the buffered data
	 */
	public async serializeData(
		data: AnnotationsLUT,
		writer: BufferedWriter
	): Promise<void> {
		this.writer = writer;

		const fileHeader = formatFileHeader(Format.UTF8, Version.ONE);
		await this.writeLine(fileHeader);
		await this.writeLine(`count ${data.length}`);

		for (const label of this.labels) {
			const indices = this.getIndices(label.annotationClass, data);
			await this.writeLine(
				`label ${label.annotationClass} ${indices.length}`
			);

			for (const index of indices) {
				const promise = this.writeLineSync(`${index}`);
				if (promise) {
					await promise;
				}
			}
		}
		await this.writer.close();
	}

	/**
	 * Writes a Line async
	 *
	 * @param string the string to write
	 * @returns the promise
	 */
	private async writeLine(string: string): Promise<void> {
		const promise = this.writeLineSync(string);
		if (promise) {
			return promise;
		}
	}

	/**
	 * Writes a Line in sync
	 *
	 * @param string the string to write
	 */
	private writeLineSync(string: string) {
		const encoded = this.encoder.encode(string + "\n");
		return this.writer!.writeSync(encoded);
	}

	/**
	 * Returns the indices that have been annotated with the given annotationClass.
	 *
	 * @param annotationClass the annotationClass
	 * @param data an array representing a map of index => annotationClass
	 * @returns the indices annotated with the given annotationClass
	 */
	private getIndices(
		annotationClass: number,
		data: AnnotationsLUT
	): number[] {
		const indices: number[] = [];
		for (let i = 0; i < data.length; i++) {
			if (data[i] === annotationClass) {
				indices.push(i);
			}
		}
		return indices;
	}
}
