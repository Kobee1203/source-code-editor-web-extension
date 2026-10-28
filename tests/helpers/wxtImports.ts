export function defineBackground(arg: () => void): { main: () => void } {
  return { main: arg };
}

export function defineContentScript<T>(arg: T): T {
  return arg;
}
