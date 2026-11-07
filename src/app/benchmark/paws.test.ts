import { describe, expect, it } from "vitest";
import type { PageModel } from "./data";
import { pawsSpread } from "./paws";

const model = (pawsAuc?: number): PageModel =>
  ({ key: String(pawsAuc), ...(pawsAuc !== undefined && { pawsAuc }) }) as PageModel;

describe("pawsSpread", () => {
  it("is undefined when no model took PAWS", () => {
    expect(pawsSpread([model(), model()])).toBeUndefined();
  });
  it("covers only the models that took it", () => {
    expect(pawsSpread([model(0.66), model(), model(0.63), model(0.69)])).toEqual({
      count: 3,
      min: 0.63,
      max: 0.69,
    });
  });
});
