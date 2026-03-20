import { toast } from "sonner"
import { errorToUserMessage } from "./error-message"

/**
 * Show a persistent error toast. Unlike `toast.error()`, this never auto-dismisses.
 */
export function toastError(
  message: string,
  options?: { description?: string; [key: string]: unknown },
): string | number {
  return toast.error(message, {
    ...options,
    duration: Infinity,
  })
}

/**
 * Show a persistent error toast from a catch block.
 * Sanitizes the error value so stack traces and raw objects never reach the user.
 */
export function toastErrorFromCatch(
  label: string,
  error: unknown,
): string | number {
  return toast.error(label, {
    description: errorToUserMessage(error),
    duration: Infinity,
  })
}
