import type { Codec } from "./core/Codec";
import type { Manager } from "./core/Manager";
import type { Resource, TypedResource } from "./core/Resource";
import type { Runtime, SessionToken } from "./core/Runtime";
import type {
	Global,
	Model,
	ModelUser,
	Project,
	Scope,
	User,
} from "./core/Scope";
import type { Session } from "./core/Session";
import type { Store } from "./core/Store";
import { StoreBackedManager } from "./engine/StoreBackedManager";
import { StoreBackedMetadataIndex } from "./engine/StoreBackedMetadataIndex";
import { AsyncOpfsStore } from "./engine/stores/AsyncOpfs";
import { SyncOpfsStore } from "./engine/stores/SyncOpfs";

/**
 * Creates a new Cache Manager instance backed by the provided store.
 *
 * This initializes the metadata index and prepares the manager for use.
 *
 * @param store - The storage implementation (e.g., `OpfsAsyncStore` or `OpfsSyncStore`).
 * @returns A promise that resolves to an initialized Cache Manager.
 */
export async function createManager(store: Store): Promise<Manager> {
	const index = new StoreBackedMetadataIndex(store);
	await index.load();
	return new StoreBackedManager(store, index);
}

/**
 * Create a Cache Runtime from an existing Manager.
 *
 * This function does not perform any caching of sessions by scope; it simply
 * forwards to {@link Manager.createSession | Manager#createSession} on each
 * call.
 *
 * @param manager - The Manager configured with an appropriate Store.
 * @returns A CacheRuntime that creates sessions via the given manager.
 */
export function createRuntime(manager: Manager): Runtime {
	return {
		get manager(): Manager {
			return manager;
		},

		getSession<S extends Scope>(scope: S): Session<S> {
			return manager.createSession(scope);
		},

		getSessionForToken<S extends Scope>(
			token: SessionToken<S>
		): Session<S> {
			return manager.createSession(token.scope);
		},
	};
}

/**
 * Create a Cache Runtime for use on the main thread.
 *
 * This runtime is backed by an asynchronous OPFS store (`OpfsAsyncStore`),
 * which uses `FileSystemFileHandle.createWritable()` under the hood.
 *
 * Most main-thread code should obtain a Cache Runtime via this function and
 * then work exclusively with `Runtime`, `SessionToken`, and `Session`
 * rather than interacting with `Manager` or `Store` directly.
 *
 * Typical usage:
 * ```ts
 * const runtime = await createMainThreadCacheRuntime();
 * const session = runtime.getSession(scope);
 * ```
 *
 * @returns A promise resolving to a CacheRuntime suitable for the main thread.
 */
export async function createMainThreadRuntime(): Promise<Runtime> {
	const store = new AsyncOpfsStore();
	const manager = await createManager(store);
	return createRuntime(manager);
}

/**
 * Create a Cache Runtime for use inside a Web Worker.
 *
 * This runtime is backed by a synchronous OPFS store (`OpfsSyncStore`),
 * which uses `FileSystemFileHandle.createSyncAccessHandle()` for
 * high-throughput, low-latency access.
 *
 * Most worker code should obtain a Cache Runtime via this function and then
 * work exclusively with `Runtime`, `SessionToken`, and `Session`.
 *
 * Typical usage inside a worker:
 * ```ts
 * const runtime = await createWorkerCacheRuntime();
 * const session = runtime.getSessionForToken(token);
 * ```
 *
 * @returns A promise resolving to a Cache Runtime suitable for worker contexts.
 */
export async function createWorkerRuntime(): Promise<Runtime> {
	const store = new SyncOpfsStore();
	const manager = await createManager(store);
	return createRuntime(manager);
}

/**
 * Define a globally scoped cache resource.
 *
 * The resulting data is shared across all users, projects, and models
 * regardless of the session scope it is accessed from.
 *
 * @param id - Unique resource identifier.
 * @returns - A global resource descriptor.
 */
export function defineGlobalResource(id: string): Resource<Global> {
	return {
		id,
		scopeKind: "global",
	};
}

/**
 * Define a globally scoped, typed cache resource.
 *
 * @param id - Unique resource identifier.
 * @param codec - The codec used to encode/decode the data.
 * @returns A global typed resource descriptor.
 */
export function defineTypedGlobalResource<Output, Input = Output>(
	id: string,
	codec: Codec<Output, Input>
): TypedResource<Global, Output, Input> {
	return {
		...defineGlobalResource(id),
		codec,
	};
}

/**
 * Define a user-scoped cache resource.
 *
 * The resulting data is keyed only by `userId` and shared across all
 * projects and models for that user.
 *
 * @param id - Unique resource identifier.
 * @returns A user-scoped resource descriptor.
 */
export function defineUserResource(id: string): Resource<User> {
	return {
		id,
		scopeKind: "user",
	};
}

/**
 * Define a user-scoped, typed cache resource.
 *
 * @param id - Unique resource identifier.
 * @param codec - The codec used to encode/decode the data.
 * @returns A user-scoped typed resource descriptor.
 */
export function defineTypedUserResource<Output, Input = Output>(
	id: string,
	codec: Codec<Output, Input>
): TypedResource<User, Output, Input> {
	return {
		...defineUserResource(id),
		codec,
	};
}

/**
 * Define a project-scoped cache resource.
 *
 * The resulting data is keyed only by `projectId` and shared across all
 * models within that project.
 *
 * @param id - Unique resource identifier.
 * @returns A project-scoped resource descriptor.
 */
export function defineProjectResource(id: string): Resource<Project> {
	return {
		id,
		scopeKind: "project",
	};
}

/**
 * Define a project-scoped, typed cache resource.
 *
 * @param id - Unique resource identifier.
 * @param codec - The codec used to encode/decode the data.
 * @returns A project-scoped typed resource descriptor.
 */
export function defineTypedProjectResource<Output, Input = Output>(
	id: string,
	codec: Codec<Output, Input>
): TypedResource<Project, Output, Input> {
	return {
		...defineProjectResource(id),
		codec,
	};
}

/**
 * Define a model-scoped cache resource.
 *
 * The resulting data is keyed by `projectId` + `modelId` and shared across
 * all users working with that model.
 *
 * @param id - Unique resource identifier.
 * @returns A model-scoped resource descriptor.
 */
export function defineModelResource(id: string): Resource<Model> {
	return {
		id,
		scopeKind: "model",
	};
}

/**
 * Define a model-scoped, typed cache resource.
 *
 * @param id - Unique resource identifier.
 * @param codec - The codec used to encode/decode the data.
 * @returns A model-scoped typed resource descriptor.
 */
export function defineTypedModelResource<Output, Input = Output>(
	id: string,
	codec: Codec<Output, Input>
): TypedResource<Model, Output, Input> {
	return {
		...defineModelResource(id),
		codec,
	};
}

/**
 * Define a model+user-scoped cache resource.
 *
 * The resulting data is keyed by `userId` + `projectId` + `modelId` and
 * is specific to a single user/model combination.
 *
 * @param id - Unique resource identifier.
 * @returns A model-user-scoped resource descriptor.
 */
export function defineModelUserResource(id: string): Resource<ModelUser> {
	return {
		id,
		scopeKind: "modelUser",
	};
}

/**
 * Define a model+user-scoped, typed cache resource.
 *
 * @param id - Unique resource identifier.
 * @param codec - The codec used to encode/decode the data.
 * @returns A model-user-scoped typed resource descriptor.
 */
export function defineTypedModelUserResource<Output, Input = Output>(
	id: string,
	codec: Codec<Output, Input>
): TypedResource<ModelUser, Output, Input> {
	return {
		...defineModelUserResource(id),
		codec,
	};
}

/**
 * Create a new SessionToken from a scope.
 *
 * This helper is primarily a convenience to avoid manually constructing
 * token objects in application code.
 *
 * @typeParam S - The scope type for the session.
 * @param scope - The scope the session should operate within.
 * @returns A SessionToken that can be passed around and later resolved to a Session.
 */
export function createSessionToken<S extends Scope>(scope: S): SessionToken<S> {
	return { scope };
}
