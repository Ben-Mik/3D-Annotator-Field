import {
	createContext,
	useContext,
	useEffect,
	useState,
	type PropsWithChildren,
} from "react";
import { type FullUser } from "~entity/User";
import { useAPI } from "./APIContext";

const AUTH_CONTEXT = createContext<FullUser | null>(null);

export function useAuth() {
	return useContext(AUTH_CONTEXT);
}

export function AuthProvider({ children }: PropsWithChildren) {
	const api = useAPI();
	const [currentUser, setCurrentUser] = useState<FullUser | null>(
		api.auth.getCurrentUser()
	);

	useEffect(() => {
		const unsubscribe = api.auth.on("authStateChange", (user) => {
			setCurrentUser(user);
		});
		return unsubscribe;
	}, [api]);

	return (
		<AUTH_CONTEXT.Provider value={currentUser}>
			{children}
		</AUTH_CONTEXT.Provider>
	);
}
