import { describe, expect, it } from "vitest"
import type { WorkflowNode } from "@shared/types"

import { getRuntimeStagePresentation } from "./runtime-flow-labels"

describe("runtime-flow-labels", () => {
  it("uses step language in outcome copy", () => {
    const inputNode: WorkflowNode = {
      id: "input-1",
      type: "input",
      position: { x: 0, y: 0 },
      config: {},
    }

    const skillNode: WorkflowNode = {
      id: "skill-1",
      type: "skill",
      position: { x: 0, y: 0 },
      config: {
        prompt: "Review the latest changes and produce review findings",
      },
    }

    const inputPresentation = getRuntimeStagePresentation(inputNode, {
      fallbackId: inputNode.id,
      output: {
        content: "",
        metadata: {
          source: "input",
          artifact_label: "Source brief",
          artifact_role: "input",
        },
      },
    })
    const skillPresentation = getRuntimeStagePresentation(skillNode, {
      fallbackId: skillNode.id,
    })

    expect(inputPresentation.outcomeText).toContain("This step")
    expect(inputPresentation.outcomeText.toLowerCase()).not.toContain("stage")
    expect(skillPresentation.outcomeText.toLowerCase()).not.toContain("stage")
  })
})
