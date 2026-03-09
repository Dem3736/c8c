import type { TelemetryProvider } from "@shared/types"

export type TelemetryEventName =
  | "app_started"
  | "app_ready"
  | "app_quit"
  | "settings_opened"
  | "telemetry_consent_updated"
  | "workflow_run_started"
  | "workflow_run_finished"
  | "workflow_node_finished"
  | "update_check_started"
  | "update_check_result"

export type TelemetryPropertyValue = string | number | boolean | null

export interface TelemetryTrackEvent {
  name: TelemetryEventName
  distinctId: string
  timestamp: string
  properties: Record<string, TelemetryPropertyValue>
}

export interface TelemetryClient {
  readonly provider: TelemetryProvider
  setConsent(enabled: boolean): void
  track(event: TelemetryTrackEvent): Promise<void>
  identify(distinctId: string, traits?: Record<string, TelemetryPropertyValue>): Promise<void>
  flush(): Promise<void>
  shutdown(): Promise<void>
}

export interface TelemetryProviderConfig {
  provider: TelemetryProvider
  posthogHost: string
  posthogApiKey: string
  consent: boolean
}

