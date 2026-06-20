import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SoundFontSettings, loadSoundFont } from "../src/settings/SoundFontSettings";

describe("SoundFontSettings (#47)", () => {
  beforeEach(() => localStorage.clear());

  it("registers a soundfont to localStorage", async () => {
    render(<SoundFontSettings />);
    await userEvent.type(screen.getByLabelText("sf-name"), "FluidR3");
    await userEvent.type(screen.getByLabelText("sf-url"), "https://x/sf.sf2");
    await userEvent.click(screen.getByRole("button", { name: "登録" }));
    expect(loadSoundFont()).toEqual({ name: "FluidR3", url: "https://x/sf.sf2" });
  });
});
