import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { uploadAsset, listAssets, deleteAsset } = vi.hoisted(() => ({
  uploadAsset: vi.fn(),
  listAssets: vi.fn(),
  deleteAsset: vi.fn(),
}));
vi.mock("../src/api", () => ({
  api: { uploadAsset, listAssets, deleteAsset, assetUrl: (id: string) => `/api/asset/${id}` },
}));

import { SoundFontSettings, loadSoundFontId } from "../src/settings/SoundFontSettings";

describe("SoundFontSettings (#77 upload)", () => {
  beforeEach(() => {
    localStorage.clear();
    uploadAsset.mockReset();
    listAssets.mockReset();
    deleteAsset.mockReset();
    listAssets.mockResolvedValue([]);
  });

  it("uploads a .sf2 and selects it as the global soundfont", async () => {
    uploadAsset.mockResolvedValue({ id: "sf1", kind: "soundfont", name: "gm.sf2", size: 30_000_000 });
    listAssets.mockResolvedValue([
      { id: "sf1", kind: "soundfont", name: "gm.sf2", size: 30_000_000, mime: null, created: "" },
    ]);
    render(<SoundFontSettings />);
    const file = new File([new Uint8Array([1, 2, 3])], "gm.sf2", { type: "audio/x-soundfont" });
    await userEvent.upload(screen.getByLabelText("sf-upload"), file);

    await waitFor(() => expect(uploadAsset).toHaveBeenCalledWith(file, "soundfont"));
    await waitFor(() => expect(loadSoundFontId()).toBe("sf1")); // 全体採用
    expect(await screen.findByLabelText("sf-select-sf1")).toBeInTheDocument();
  });

  it("deletes a soundfont and clears selection", async () => {
    localStorage.setItem("cm.soundfont", "sf1");
    listAssets.mockResolvedValue([
      { id: "sf1", kind: "soundfont", name: "gm.sf2", size: 1, mime: null, created: "" },
    ]);
    deleteAsset.mockResolvedValue({ deleted: true });
    render(<SoundFontSettings />);
    await screen.findByLabelText("sf-delete-sf1");
    listAssets.mockResolvedValue([]); // 削除後は空
    await userEvent.click(screen.getByLabelText("sf-delete-sf1"));
    await waitFor(() => expect(deleteAsset).toHaveBeenCalledWith("sf1"));
    await waitFor(() => expect(loadSoundFontId()).toBeNull());
  });
});
