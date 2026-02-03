export interface Updatable<T = void> {
	update(data: T): void;
}

export interface Destroyable<T = void> {
	destroy(data: T): void;
}

export interface Nameable {
	name: string;
}

export interface Sizable {
	size: number;
}

export interface NameableData<T> extends Nameable {
	data: T;
}

export interface SizeableData<T> extends Sizable {
	data: T;
}

export interface NameableSizableData<T> extends Nameable, Sizable {
	data: T;
}

export type NameableStream<
	T extends
		| ReadableStream<Uint8Array>
		| WritableStream<Uint8Array> = ReadableStream<Uint8Array>
> = NameableData<T>;

export type SizeableStream<
	T extends
		| ReadableStream<Uint8Array>
		| WritableStream<Uint8Array> = ReadableStream<Uint8Array>
> = SizeableData<T>;

export type NameableSizableStream<
	T extends
		| ReadableStream<Uint8Array>
		| WritableStream<Uint8Array> = ReadableStream<Uint8Array>
> = NameableSizableData<T>;

export type FileData = NameableData<Uint8Array>;
