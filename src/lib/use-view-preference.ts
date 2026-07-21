"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * Preferência de visualização da interface (lista/kanban, ordenação),
 * persistida no navegador do usuário — ele sempre encontra a tela do
 * jeito que deixou. SSR renderiza o padrão; o valor salvo entra após
 * a hidratação (useSyncExternalStore — sem quebra de SSR).
 */
export function useViewPreference<T extends string>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void] {
  const listenerRef = useRef<(() => void) | null>(null);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      listenerRef.current = onStoreChange;
      const handler = (event: StorageEvent) => {
        if (event.key === key) onStoreChange();
      };
      window.addEventListener("storage", handler);
      return () => {
        window.removeEventListener("storage", handler);
        listenerRef.current = null;
      };
    },
    [key],
  );

  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(key) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  }, [key, defaultValue]);

  const getServerSnapshot = useCallback(() => defaultValue, [defaultValue]);

  const value = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  ) as T;

  const update = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Sem persistência — a preferência vale só nesta sessão
      }
      // O evento storage não dispara na própria aba: avisa manualmente
      listenerRef.current?.();
    },
    [key],
  );

  return [value, update];
}
