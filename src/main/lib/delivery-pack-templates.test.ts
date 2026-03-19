import { describe, expect, it } from "vitest"
import { getBuiltinTemplates } from "./templates"
import { validateWorkflow } from "./graph-engine"

describe("delivery pack templates", () => {
  const targetIds = [
    "delivery-map-codebase",
    "delivery-shape-project",
    "delivery-research-phase",
    "delivery-plan-phase",
    "delivery-implement-phase",
    "delivery-verify-phase",
  ] as const

  it("ships the first delivery pack templates with pack metadata", () => {
    const templates = getBuiltinTemplates().filter((template) => targetIds.includes(template.id as (typeof targetIds)[number]))

    expect(templates.map((template) => template.id)).toEqual(targetIds)

    for (const template of templates) {
      expect(template.pack?.id).toBe("delivery-foundation")
      expect(template.pack?.label).toBe("Delivery Factory")
      expect(template.contractOut?.length || 0).toBeGreaterThan(0)
      expect(template.executionPolicy?.summary).toBeTruthy()
    }
  })

  it("keeps plan as the default continuation after project shaping", () => {
    const shapeProject = getBuiltinTemplates().find((template) => template.id === "delivery-shape-project")

    expect(shapeProject?.pack?.recommendedNext).toEqual([
      "delivery-plan-phase",
      "delivery-research-phase",
    ])
  })

  it("keeps implementation as the default continuation after planning", () => {
    const planPhase = getBuiltinTemplates().find((template) => template.id === "delivery-plan-phase")

    expect(planPhase?.pack?.recommendedNext).toEqual([
      "delivery-implement-phase",
      "delivery-verify-phase",
    ])
  })

  it("keeps ship as the default continuation after delivery verification", () => {
    const verifyPhase = getBuiltinTemplates().find((template) => template.id === "delivery-verify-phase")

    expect(verifyPhase?.pack?.recommendedNext).toEqual([
      "gstack-preflight-gate",
    ])
  })

  it("keeps the first delivery pack workflows valid", () => {
    const templates = getBuiltinTemplates().filter((template) => targetIds.includes(template.id as (typeof targetIds)[number]))

    for (const template of templates) {
      const errors = validateWorkflow(template.workflow)
      expect(errors, `Template "${template.name}" has validation errors: ${errors.join(", ")}`).toEqual([])
    }
  })
})
