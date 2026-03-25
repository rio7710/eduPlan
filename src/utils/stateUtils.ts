export function nextIfChanged<T>(current: T, next: T): T {
  return Object.is(current, next) ? current : next;
}

export function patchIfChanged<T extends object, K extends keyof T>(
  current: T,
  key: K,
  value: T[K],
): T {
  return Object.is(current[key], value) ? current : { ...current, [key]: value };
}
