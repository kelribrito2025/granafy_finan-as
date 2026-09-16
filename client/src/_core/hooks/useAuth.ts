import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/login" } =
    options ?? {};
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  /*
   * Sair apaga o cache inteiro, não só o "quem sou eu".
   *
   * Limpar apenas `auth.me` deixava na memória da aba tudo o que a conta
   * anterior tinha carregado — painel, contas, lançamentos e o `onboarding.
   * status`. Quem entrasse em seguida com outro login via, por um instante, a
   * resposta do inquilino anterior: era assim que uma conta recém-criada
   * abria no painel antes de o assistente aparecer, porque o `show: false` da
   * conta antiga ainda estava em cache.
   *
   * Não é só estética: os números de uma conta não podem piscar na tela de
   * outra, nem por um quadro.
   */
  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      queryClient.clear();
    }
  }, [logoutMutation, queryClient]);

  const state = useMemo(
    () => ({
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
      /** O que a pessoa é na empresa aberta. Null sem sessão ou sem empresa. */
      papel: meQuery.data?.papel ?? null,
      /** Contador na empresa aberta: vê tudo, não muda nada. */
      somenteLeitura: meQuery.data?.papel === "contador",
    }),
    [
      meQuery.data,
      meQuery.error,
      meQuery.isLoading,
      logoutMutation.error,
      logoutMutation.isPending,
    ]
  );

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending || state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
