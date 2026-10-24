import type { Locale } from './config';

/** Same shape as the English messages, with any text allowed in place of each English string. */
export type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => R extends string ? string : R
    : T extends readonly unknown[]
      ? { [K in keyof T]: Widen<T[K]> }
      : { [K in keyof T]: Widen<T[K]> };

export type MessageSet<T> = { readonly [L in Locale]: Widen<T> };

/**
 * Declares one group of texts in all three languages side by side. English sets
 * the shape; TypeScript fails the build if a Russian or Kazakh text is missing.
 */
export function defineMessages<T>(messages: { en: T; ru: Widen<NoInfer<T>>; kk: Widen<NoInfer<T>> }): MessageSet<T> {
  return messages as MessageSet<T>;
}
