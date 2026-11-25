import {
  createI18n,
  type Locale,
  type MessageKey,
  type MessageParams,
} from "./i18n";
import { errorMessage } from "./reader-error";
import { en } from "./messages/en";
import { PLUGIN_ID } from "./identity";

const markerPattern = new RegExp(`\\[${PLUGIN_ID}:([^\\]]+)\\]`);

type ErrorKey = Extract<MessageKey, `error.${string}`>;
/** Carry a stable translation key through SDK errors and cached host strings. */
export function pluginError(
  key: ErrorKey,
  params: MessageParams = {},
  options?: ErrorOptions,
): Error {
  const marker = encodeURIComponent(JSON.stringify({ key, params }));
  return new Error(
    `${createI18n("en").t(key, params)} [${PLUGIN_ID}:${marker}]`,
    options,
  );
}
export function localizedError(cause: unknown, locale: Locale): string {
  const message = errorMessage(cause);
  const match = markerPattern.exec(message);
  if (!match) return message;
  try {
    const decoded: unknown = JSON.parse(decodeURIComponent(match[1]));
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      !("key" in decoded) ||
      typeof decoded.key !== "string" ||
      !decoded.key.startsWith("error.") ||
      !(decoded.key in en) ||
      !("params" in decoded) ||
      typeof decoded.params !== "object" ||
      decoded.params === null
    )
      return message;
    const params = decoded.params as Record<string, unknown>;
    if (
      Object.values(params).some(
        (value) => typeof value !== "string" && typeof value !== "number",
      )
    )
      return message;
    return createI18n(locale).t(
      decoded.key as ErrorKey,
      params as MessageParams,
    );
  } catch {
    return message;
  }
}
