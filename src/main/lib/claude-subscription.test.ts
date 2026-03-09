import { describe, expect, it } from "vitest"
import { parseClaudeAuthStatus } from "./claude-subscription"

describe("parseClaudeAuthStatus", () => {
  it("parses logged-out status", () => {
    const status = parseClaudeAuthStatus(`{
      "loggedIn": false,
      "authMethod": "none",
      "apiProvider": "firstParty"
    }`)

    expect(status).toEqual({
      loggedIn: false,
      authMethod: "none",
      apiProvider: "firstParty",
      hasSubscription: false,
    })
  })

  it("treats api_key auth as no subscription", () => {
    const status = parseClaudeAuthStatus(`{
      "loggedIn": true,
      "authMethod": "api_key",
      "apiProvider": "firstParty"
    }`)

    expect(status).toEqual({
      loggedIn: true,
      authMethod: "api_key",
      apiProvider: "firstParty",
      hasSubscription: false,
    })
  })

  it("treats oauth auth as having subscription", () => {
    const status = parseClaudeAuthStatus(`{
      "loggedIn": true,
      "authMethod": "oauth_token",
      "apiProvider": "firstParty"
    }`)

    expect(status).toEqual({
      loggedIn: true,
      authMethod: "oauth_token",
      apiProvider: "firstParty",
      hasSubscription: true,
    })
  })

  it("respects explicit free subscription hint", () => {
    const status = parseClaudeAuthStatus(`{
      "loggedIn": true,
      "authMethod": "oauth_token",
      "subscriptionType": "free"
    }`)

    expect(status?.hasSubscription).toBe(false)
  })

  it("returns null for invalid payload", () => {
    expect(parseClaudeAuthStatus("not-json")).toBeNull()
  })
})
