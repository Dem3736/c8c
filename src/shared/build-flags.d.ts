export {}

declare global {
  const __BUILD_FLAVOR__: "oss" | "release"
  const __RELEASE_CHANNEL__: "stable" | "beta"
  const __TELEMETRY_PROVIDER__: "noop" | "posthog"
  const __TELEMETRY_ENABLED__: boolean
  const __TELEMETRY_LOCAL_TEST__: boolean
  const __TEST_MODE__: boolean
  const __POSTHOG_HOST__: string
  const __POSTHOG_KEY__: string
}
