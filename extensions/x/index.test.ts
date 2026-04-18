import { describe, expect, it } from "vitest";
import entry from "./index.js";

describe("x bundled entries", () => {
  it("declares the channel entry without importing the broad api barrel", () => {
    expect(entry.kind).toBe("bundled-channel-entry");
    expect(entry.id).toBe("x");
    expect(entry.name).toBe("X (Twitter)");
    expect(typeof entry.loadChannelPlugin).toBe("function");
  });
});
