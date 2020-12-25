import React, {PropsWithChildren, Provider, useCallback, useEffect, useMemo, useState} from "react";
import {ComponentPhase} from "../ComponentPhase";

type Action<LoggedType> = {
  login: (logged: LoggedType) => Promise<void>;
  logout: () => void;
};

export type AuthContext<LoggedType, ContextType> = {
  actions: Action<LoggedType>;
  logged: LoggedType | null;
  context: ContextType;
  mounted: boolean;
};

export type LoggedAuthContext<LoggedType, ContextType> = AuthContext<LoggedType, ContextType> & {
  logged: LoggedType;
};

export type AuthFC<LoggedType, ContextType, Props> = React.FC<
  {auth: AuthContext<LoggedType, ContextType>} & Props
>;
export type LoggedAuthFC<LoggedType, ContextType, Props> = React.FC<
  {auth: LoggedAuthContext<LoggedType, ContextType>} & Props
>;

export const AuthProvider = <LoggedType, ContextType>(
  props: PropsWithChildren<{
    BaseAuthProvider: Provider<AuthContext<LoggedType, ContextType> | undefined>;
    getSavedLogged: () => Promise<LoggedType | null>;
    saveLogged: (logged: LoggedType) => Promise<void>;
    onError?: (err: unknown) => void;
    getContext: (logged: LoggedType | null) => ContextType;
  }>,
) => {
  const [logged, setLogged] = useState<LoggedType | null>(null);
  const [mounted, setMounted] = useState(false);

  const login = useCallback(
    async (logged: LoggedType) => {
      await props.saveLogged(logged);
      setLogged(logged);
    },
    [props],
  );

  const logout = useCallback(() => {
    setLogged(null);
  }, []);

  useEffect(() => {
    let unmounted = false;

    (async () => {
      try {
        const retrievedLogged = await props.getSavedLogged();
        if (unmounted) {
          return;
        }
        setLogged(retrievedLogged);
      } catch (err: unknown) {
        if (unmounted) {
          return;
        }
        logout();
      }
      setMounted(true);
    })();

    return () => {
      unmounted = true;
    };
  }, [logout, props]);

  const contextInstance = useMemo(() => props.getContext(logged), [logged, props]);

  const actions: Action<LoggedType> = {login, logout};
  const context: AuthContext<LoggedType, ContextType> = {
    actions,
    logged,
    context: contextInstance,
    mounted,
  };

  return <props.BaseAuthProvider value={context}>{props.children}</props.BaseAuthProvider>;
};

export const createWithAuthContextWrapper = <LoggedType, ContextType>(
  phase: ComponentPhase,
  useAuthContext: () => AuthContext<LoggedType, ContextType> | undefined,
) => <Props,>(Component: AuthFC<LoggedType, ContextType, Props>): React.FC<Props> => (props) => {
  const authContext = useAuthContext();

  const [comp] = phase.useAsync(async () => {
    if (!authContext?.mounted) {
      return null;
    }
    return <Component auth={authContext} {...props} />;
  }, [authContext]);

  return comp;
};

export const createWithLoggedAuthContextWrapper = <LoggedType, ContextType>(
  phase: ComponentPhase,
  useAuthContext: () => AuthContext<LoggedType, ContextType> | undefined,
  onNotLogged: () => Promise<void>,
) => <Props,>(Component: LoggedAuthFC<LoggedType, ContextType, Props>): React.FC<Props> => (
  props,
) => {
  const authContext = useAuthContext();

  const [comp] = phase.useAsync(async () => {
    if (!authContext?.mounted) {
      return null;
    }
    const {logged} = authContext;
    if (!logged) {
      // TODO Change to useSync and without await
      await onNotLogged();
      return null;
    }
    return <Component auth={{...authContext, logged}} {...props} />;
  }, [authContext]);

  return comp;
};
