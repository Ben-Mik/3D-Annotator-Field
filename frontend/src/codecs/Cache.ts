import { type CacheResource, type CacheScope } from "~cache/index";
import { identity } from "~workers/combinators/Combinators";
import { type WorkerCodec } from "~workers/index";

export interface CacheAccess {
	scope: CacheScope;
	resource: CacheResource<CacheScope>;
}

export const CACHE_ACCESS_WORKER_CODEC: WorkerCodec<CacheAccess, CacheAccess> =
	identity<CacheAccess>();
