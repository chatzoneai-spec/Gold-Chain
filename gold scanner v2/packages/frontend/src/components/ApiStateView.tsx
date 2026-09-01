"use client";

import { useEffect, useState, type ReactNode } from "react";

export type ApiViewState =
  | { kind: "loading" }
  | { kind: "empty"; message?: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; children: ReactNode };

type Props = {
  state: ApiViewState;
  onRetry?: () => void;
  testId?: string;
};

export function ApiStateView({ state, onRetry, testId = "api-state" }: Props) {
  if (state.kind === "loading") {
    return (
      <div className="state-box" data-testid={`${testId}-loading`}>
        Loading…
      </div>
    );
  }

  if (state.kind === "empty") {
    return (
      <div className="state-box" data-testid={`${testId}-empty`}>
        {state.message ?? "No data"}
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="state-box" data-testid={`${testId}-error`}>
        <p>{state.message}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} data-testid={`${testId}-retry`}>
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  return <div data-testid={`${testId}-ready`}>{state.children}</div>;
}

export function useAsyncData<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
): {
  state: ApiViewState;
  retry: () => void;
  data: T | null;
} {
  const [state, setState] = useState<ApiViewState>({ kind: "loading" });
  const [data, setData] = useState<T | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    setData(null);

    void load()
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (
          result === null ||
          result === undefined ||
          (Array.isArray(result) && result.length === 0) ||
          (typeof result === "object" &&
            result !== null &&
            "items" in result &&
            Array.isArray((result as { items: unknown[] }).items) &&
            (result as { items: unknown[] }).items.length === 0)
        ) {
          setState({ kind: "empty" });
          setData(result);
          return;
        }
        setData(result);
        setState({ kind: "ready", children: null });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : "Request failed";
        setState({ kind: "error", message });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return {
    state,
    data,
    retry: () => setTick((value) => value + 1),
  };
}
