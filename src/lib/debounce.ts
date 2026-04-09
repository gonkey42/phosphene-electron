export type DebouncedFunction<T extends (...args: any[]) => any> = ((
  ...args: Parameters<T>
) => void) & {
  flush: () => ReturnType<T> | undefined;
  cancel: () => void;
};

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  ms: number,
): DebouncedFunction<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const invoke = (): ReturnType<T> | undefined => {
    if (!lastArgs) {
      return undefined;
    }

    const args = lastArgs;
    lastArgs = null;
    return fn(...args);
  };

  const debounced = ((...args: Parameters<T>) => {
    lastArgs = args;
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      invoke();
    }, ms);
  }) as DebouncedFunction<T>;

  debounced.flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    return invoke();
  };

  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    lastArgs = null;
  };

  return debounced;
}
