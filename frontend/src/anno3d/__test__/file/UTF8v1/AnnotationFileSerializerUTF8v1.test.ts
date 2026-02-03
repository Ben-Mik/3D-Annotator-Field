import { TextDecoder, TextEncoder } from "util";
import { SerializerUtf8Helper } from "~anno3d/v1/utf8/SerializerUtf8";
import { type Label } from "~entity/Annotation";
import { createLabels } from "~entity/__test__/Annotation.test";
import { type BufferedWriter } from "~util/streams/BufferedWriter";

global.TextEncoder = TextEncoder;

describe("AnnotationFileSerializerUTF8v1", () => {
	let labels: Label[];
	let writer: TestBufferedWriter;
	let serializer: SerializerUtf8Helper;

	beforeEach(() => {
		labels = createLabels(3);
		writer = new TestBufferedWriter(5);
		serializer = new SerializerUtf8Helper(labels);
	});

	test("serialize simple data", async () => {
		const data = new Uint8Array(10);

		data[0] = 255;
		data[1] = 1;
		data[2] = 0;
		data[3] = 1;
		data[4] = 0;
		data[5] = 255;
		data[6] = 0;
		data[7] = 255;
		data[8] = 0;
		data[9] = 255;

		await serializer.serializeData(data, writer);

		expect(writer.res).toEqual(
			"format UTF8\nversion 1.0\ncount 10\nlabel 0 4\n2\n4\n6\n8\nlabel 1 2\n1\n3\nlabel 2 0\n"
		);
	});

	test("serializer data with split buffer", async () => {
		const data = new Uint8Array(4);

		data[0] = 255;
		data[1] = 1;
		data[2] = 0;
		data[3] = 1;

		await serializer.serializeData(data, writer);

		expect(writer.res).toEqual(
			"format UTF8\nversion 1.0\ncount 4\nlabel 0 1\n2\nlabel 1 2\n1\n3\nlabel 2 0\n"
		);
	});
});

class TestBufferedWriter implements BufferedWriter {
	public res = "";

	private decoder = new TextDecoder();
	private maxBufferSize: number;
	private currentBufferSize = 1;

	constructor(bufferSize: number) {
		this.maxBufferSize = bufferSize;
	}

	write(data: Uint8Array): Promise<void> {
		this.res += this.decoder.decode(data);

		this.nextBufferSize();
		return Promise.resolve();
	}

	private nextBufferSize() {
		this.currentBufferSize =
			this.currentBufferSize < this.maxBufferSize
				? this.currentBufferSize++
				: 1;
	}

	writeSync(data: Uint8Array): Promise<void> | null {
		this.res += this.decoder.decode(data);

		if (this.currentBufferSize < this.maxBufferSize) {
			this.currentBufferSize++;
			return null;
		}

		this.currentBufferSize = 1;
		return Promise.resolve();
	}

	close(): Promise<void> {
		return Promise.resolve();
	}
}
