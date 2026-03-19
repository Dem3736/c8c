import { describe, expect, it } from "vitest"
import {
  mergeProjectOrderWithCurrent,
  moveProjectBeforeOrAfterTarget,
} from "./project-order"

describe("project-order", () => {
  it("moves a dragged project before the hovered project", () => {
    expect(
      moveProjectBeforeOrAfterTarget(
        ["/tmp/alpha", "/tmp/beta", "/tmp/gamma"],
        "/tmp/gamma",
        "/tmp/beta",
        "before",
      ),
    ).toEqual(["/tmp/alpha", "/tmp/gamma", "/tmp/beta"])
  })

  it("moves a dragged project after the hovered project", () => {
    expect(
      moveProjectBeforeOrAfterTarget(
        ["/tmp/alpha", "/tmp/beta", "/tmp/gamma"],
        "/tmp/alpha",
        "/tmp/beta",
        "after",
      ),
    ).toEqual(["/tmp/beta", "/tmp/alpha", "/tmp/gamma"])
  })

  it("ignores invalid reorder requests", () => {
    expect(
      moveProjectBeforeOrAfterTarget(
        ["/tmp/alpha", "/tmp/beta"],
        "/tmp/missing",
        "/tmp/beta",
        "before",
      ),
    ).toEqual(["/tmp/alpha", "/tmp/beta"])
  })

  it("keeps unsent current projects when reconciling persisted order", () => {
    expect(
      mergeProjectOrderWithCurrent(
        ["/tmp/alpha", "/tmp/beta", "/tmp/gamma"],
        ["/tmp/gamma", "/tmp/alpha"],
      ),
    ).toEqual(["/tmp/gamma", "/tmp/alpha", "/tmp/beta"])
  })

  it("ignores unknown project paths in requested order", () => {
    expect(
      mergeProjectOrderWithCurrent(
        ["/tmp/alpha", "/tmp/beta"],
        ["/tmp/missing", "/tmp/beta", "/tmp/alpha"],
      ),
    ).toEqual(["/tmp/beta", "/tmp/alpha"])
  })
})
