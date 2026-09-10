import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  assertValidTransition,
  InvalidStageTransitionError,
  VALID_TRANSITIONS,
} from "../src/server/domain/campaign-state-machine";

describe("Campaign State Machine", () => {
  it("allows standard linear forward progression", () => {
    expect(isValidTransition("DISCOVERY", "RESEARCH")).toBe(true);
    expect(isValidTransition("RESEARCH", "STRATEGY")).toBe(true);
    expect(isValidTransition("STRATEGY", "CREATION")).toBe(true);
    expect(isValidTransition("CREATION", "DISTRIBUTION")).toBe(true);
    expect(isValidTransition("DISTRIBUTION", "REVIEW")).toBe(true);
    expect(isValidTransition("REVIEW", "APPROVAL")).toBe(true);
    expect(isValidTransition("APPROVAL", "SCHEDULED")).toBe(true);
    expect(isValidTransition("SCHEDULED", "PUBLISHED")).toBe(true);
    expect(isValidTransition("PUBLISHED", "ANALYTICS")).toBe(true);
    expect(isValidTransition("ANALYTICS", "LEARNING")).toBe(true);
  });

  it("allows revision transitions", () => {
    // Review can send back to Creation
    expect(isValidTransition("REVIEW", "CREATION")).toBe(true);
    // Approval can send back to Review or Creation
    expect(isValidTransition("APPROVAL", "REVIEW")).toBe(true);
    expect(isValidTransition("APPROVAL", "CREATION")).toBe(true);
    // Strategy can ask for more Research
    expect(isValidTransition("STRATEGY", "RESEARCH")).toBe(true);
  });

  it("allows archival from active states", () => {
    expect(isValidTransition("DISCOVERY", "ARCHIVED")).toBe(true);
    expect(isValidTransition("PUBLISHED", "ARCHIVED")).toBe(true);
    expect(isValidTransition("LEARNING", "ARCHIVED")).toBe(true);
  });

  it("rejects invalid skipping of stages", () => {
    expect(isValidTransition("DISCOVERY", "PUBLISHED")).toBe(false);
    expect(isValidTransition("CREATION", "ANALYTICS")).toBe(false);
    expect(isValidTransition("RESEARCH", "APPROVAL")).toBe(false);
  });

  it("throws InvalidStageTransitionError with descriptive message on assertion failure", () => {
    expect(() => assertValidTransition("DISCOVERY", "PUBLISHED")).toThrowError(
      InvalidStageTransitionError
    );
    expect(() => assertValidTransition("DISCOVERY", "PUBLISHED")).toThrowError(
      /Invalid campaign stage transition from 'DISCOVERY' to 'PUBLISHED'/
    );
  });
});
