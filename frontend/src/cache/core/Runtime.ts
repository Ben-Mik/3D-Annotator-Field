import type { Manager } from "./Manager";
import type { Scope } from "./Scope";
import type { Session } from "./Session";

/**
 * Serializable description of a cache session.
 *
 * A SessionToken captures the scope that a cache session should operate in and
 * can be passed across process/thread boundaries (e.g. main thread <-> workers).
 *
 * The token does not contain any environment-specific references such as
 * Store, Manager, or Session instances. It is purely a logical description.
 *
 * @typeParam S - The scope type encoded in this token.
 */
export interface SessionToken<S extends Scope = Scope> {
	/**
	 * Scope this session should operate within.
	 */
	readonly scope: S;
}

/**
 * Environment-specific facade for using the cache.
 *
 * A Runtime wraps a {@link Manager} that has been configured with a
 * concrete {@link Store} (for example, `OpfsAsyncStore` in the main thread or
 * `OpfsSyncStore` in a worker).
 *
 * Application code should generally depend on Runtime and SessionToken
 * rather than on Store or Manager directly.
 */
export interface Runtime {
	/**
	 * Underlying Manager used by this runtime.
	 *
	 * @returns The Manager backing this runtime.
	 */
	get manager(): Manager;

	/**
	 * Get or create a Session for the given scope.
	 *
	 * The returned Session is bound to this runtime's environment-specific
	 * configuration (for example, using synchronous OPFS access in a worker).
	 *
	 * @typeParam S - The scope type for the session.
	 * @param scope - The scope the session should operate within.
	 * @returns A Session bound to the given scope.
	 */
	getSession<S extends Scope>(scope: S): Session<S>;

	/**
	 * Get or create a Session for a previously issued SessionToken.
	 *
	 * This is typically used when a SessionToken has been created in one
	 * environment (e.g. main thread) and passed into another (e.g. a worker)
	 * via `postMessage`.
	 *
	 * @typeParam S - The scope type encoded in the token.
	 * @param token - The token describing the desired session.
	 * @returns A Session bound to the token's scope.
	 */
	getSessionForToken<S extends Scope>(token: SessionToken<S>): Session<S>;
}
