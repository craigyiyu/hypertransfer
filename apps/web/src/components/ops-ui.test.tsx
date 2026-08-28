import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LabeledInput } from "./ops-ui";

describe("LabeledInput", () => {
  it("uses the shared 40px form-control height", () => {
    render(<LabeledInput label="Preferred language peer" />);

    expect(screen.getByLabelText("Preferred language peer")).toHaveClass("h-10");
  });
});
