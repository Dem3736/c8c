import { describe, expect, it } from "vitest"
import { extractDeepLinkUrl, parseTemplateDeepLink } from "./deep-links"

describe("deep-links", () => {
  it("extracts c8c protocol URLs from argv", () => {
    expect(extractDeepLinkUrl(["/tmp/app", "c8c://hub/template-123"])).toBe("c8c://hub/template-123")
    expect(extractDeepLinkUrl(["/tmp/app"])).toBeNull()
  })

  it("parses valid template links and rejects unsupported ones", () => {
    expect(parseTemplateDeepLink("c8c://hub/template-123")).toEqual({ templateId: "template-123" })
    expect(parseTemplateDeepLink("c8c://other/template-123")).toBeNull()
    expect(parseTemplateDeepLink("https://hub/template-123")).toBeNull()
    expect(parseTemplateDeepLink("c8c://hub/not allowed")).toBeNull()
  })
})
