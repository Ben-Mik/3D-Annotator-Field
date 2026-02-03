/**
 * A standard tuple for returning a serializable payload and
 * a list of transferable objects.
 *
 * The first element (`Payload`) is the serializable data to send.
 * The second element (`Transferable[]`) is the list of objects
 * (like `ArrayBuffer`s) to transfer. This list is intended to be
 * passed as the second argument (the `transfer` list) to
 * `postMessage` (e.g., `worker.postMessage(payload, transferList)`),
 * enabling a zero-copy transfer.
 *
 * @typeParam Payload - The serializable data object.
 */
export type TransferData<Payload> = readonly [Payload, Transferable[]];
