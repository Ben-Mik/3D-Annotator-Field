import { useEffect, useRef, useState } from "react";
import { createMainThreadCacheRuntime, type CacheRuntime } from "~cache/index";
import { useAnnotator } from "../contexts/AnnotatorContext";

export function useCache() {
	const runtimeRef = useRef<CacheRuntime | null>(null);
	const [usage, setUsage] = useState({ usage: 0, quota: 0 });
	const annotator = useAnnotator();

	useEffect(() => {
		createMainThreadCacheRuntime().then((runtime) => {
			runtimeRef.current = runtime;
			queryUsage();
		});
	}, []);

	const queryUsage = () => {
		runtimeRef.current!.manager.getUsageEstimate().then((estimate) => {
			setUsage(estimate);
		});
	};

	const getRuntime = () => {
		if (!runtimeRef.current) {
			throw new Error("Runtime is not initialized");
		}
		return runtimeRef.current;
	};

	return {
		getRuntime,
		scope: annotator?.cacheScope,
		usage,
		queryUsage,
	};
}
