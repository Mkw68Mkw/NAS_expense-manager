import { useState } from "react";

/** Keeps the last non-null value so dialog content stays stable during the close animation. */
export function useRetainedValue<T>(value: T | null): T | null {
  const [retained, setRetained] = useState(value);
  if (value !== null && value !== retained) setRetained(value);
  return value ?? retained;
}
