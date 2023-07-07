/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { addTwoNum } from "../src/index";

describe("Adding two nums", () => {
   it("should add two nums", () => {
      expect(addTwoNum(2, 4)).toEqual(6);
   });
});