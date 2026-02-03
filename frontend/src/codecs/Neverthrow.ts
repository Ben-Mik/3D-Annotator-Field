import { err, ok, type Result } from "neverthrow";
import type { WorkerCodec } from "~workers/index";

/**
 * Wire format for a Result type.
 */
type ResultWire<S, E> = { type: "ok"; value: S } | { type: "err"; error: E };

/**
 * Creates a Codec for the `neverthrow` Result type.
 *
 * It automatically handles:
 * - **Packing**: Checking `.isOk()` and converting to a tagged union `{ type: "ok" | "err" }`.
 * - **Unpacking**: Reading the tag and reconstructing the `Result` via `ok()` or `err()`.
 *
 * @param successCodec - Codec for the Success value.
 * @param errorCodec - Codec for the Error value.
 */
export function result<SR, SW, ER, EW>(codecs: {
	ok: WorkerCodec<SR, SW>;
	err: WorkerCodec<ER, EW>;
}): WorkerCodec<Result<SR, ER>, ResultWire<SW, EW>> {
	return {
		pack(input) {
			if (input.isOk()) {
				const packed = codecs.ok.pack(input.value);
				return {
					payload: { type: "ok", value: packed.payload },
					transfer: packed.transfer,
				};
			} else {
				const packed = codecs.err.pack(input.error);
				return {
					payload: { type: "err", error: packed.payload },
					transfer: packed.transfer,
				};
			}
		},

		unpack(wire) {
			if (wire.type === "ok") {
				const value = codecs.ok.unpack(wire.value);
				return ok(value);
			} else {
				const error = codecs.err.unpack(wire.error);
				return err(error);
			}
		},
	};
}
