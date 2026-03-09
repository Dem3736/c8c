import { describe, it, expect } from "vitest"
import { getBuiltinTemplates } from "./templates"
import type { WorkflowTemplate } from "@shared/types"
import { validateWorkflow } from "./graph-engine"

describe("getBuiltinTemplates", () => {
  it("returns an array of templates", () => {
    const templates = getBuiltinTemplates()
    expect(templates.length).toBeGreaterThan(0)
  })

  it("each template has required metadata", () => {
    const templates = getBuiltinTemplates()
    for (const t of templates) {
      expect(t.id).toBeTruthy()
      expect(t.name).toBeTruthy()
      expect(t.description).toBeTruthy()
      expect(t.category).toBeTruthy()
      expect(t.workflow).toBeDefined()
      expect(t.workflow.nodes.length).toBeGreaterThan(0)
      expect(t.workflow.edges.length).toBeGreaterThan(0)
    }
  })

  it("each template workflow is valid", () => {
    const templates = getBuiltinTemplates()
    for (const t of templates) {
      const errors = validateWorkflow(t.workflow)
      expect(errors, `Template "${t.name}" has validation errors: ${errors.join(", ")}`).toEqual([])
    }
  })

  it("template IDs are unique", () => {
    const templates = getBuiltinTemplates()
    const ids = templates.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("each evaluator in templates has retry wiring and pass/fail edges", () => {
    const templates = getBuiltinTemplates()
    for (const t of templates) {
      const evaluators = t.workflow.nodes.filter((node) => node.type === "evaluator")
      for (const evaluator of evaluators) {
        const config = evaluator.config as {
          retryFrom?: string
          criteria?: string
          threshold?: number
          maxRetries?: number
        }
        const outgoing = t.workflow.edges.filter((edge) => edge.source === evaluator.id)
        const passEdge = outgoing.find((edge) => edge.type === "pass")
        const failEdge = outgoing.find((edge) => edge.type === "fail")

        expect(config.criteria, `Template "${t.name}" evaluator "${evaluator.id}" missing criteria`).toBeTruthy()
        expect(typeof config.threshold, `Template "${t.name}" evaluator "${evaluator.id}" missing threshold`).toBe("number")
        expect(typeof config.maxRetries, `Template "${t.name}" evaluator "${evaluator.id}" missing maxRetries`).toBe("number")
        expect(config.retryFrom, `Template "${t.name}" evaluator "${evaluator.id}" missing retryFrom`).toBeTruthy()
        expect(passEdge, `Template "${t.name}" evaluator "${evaluator.id}" missing pass edge`).toBeDefined()
        expect(failEdge, `Template "${t.name}" evaluator "${evaluator.id}" missing fail edge`).toBeDefined()

        if (config.retryFrom && failEdge) {
          expect(
            failEdge.target,
            `Template "${t.name}" evaluator "${evaluator.id}" fail edge must target retryFrom`,
          ).toBe(config.retryFrom)
        }
      }
    }
  })

  it("text and landing generators use infostyle/slop-check evaluator profiles", () => {
    const templates = getBuiltinTemplates()
    const targetIds = ["predictable-text-factory", "landing-page-generator"]

    for (const id of targetIds) {
      const template = templates.find((t) => t.id === id)
      expect(template, `Template "${id}" should exist`).toBeDefined()
      const evaluators = template!.workflow.nodes.filter((node) => node.type === "evaluator")
      expect(evaluators.length, `Template "${id}" should include evaluator nodes`).toBeGreaterThan(0)

      for (const evaluator of evaluators) {
        const cfg = evaluator.config as { skillRefs?: string[] }
        expect(cfg.skillRefs, `Template "${id}" evaluator "${evaluator.id}" should define skillRefs`).toBeDefined()
        expect(cfg.skillRefs).toEqual(expect.arrayContaining(["infostyle", "slop-check"]))
      }
    }
  })
})
