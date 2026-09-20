// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssetCard } from "@/components/campaigns/asset-card";

afterEach(cleanup);

const baseAsset = {
  id: "asset_1",
  platform: "linkedin",
  caption: "Original campaign copy.",
  hashtags: ["automation", "smallbusiness"],
  imageUrl: null,
  imagePrompt: null,
  status: "draft",
  scheduledAt: null,
  publishedAt: null,
};

describe("AssetCard", () => {
  it("renders the draft copy and hashtags", () => {
    render(<AssetCard asset={baseAsset} />);

    expect(screen.getAllByText("Original campaign copy.").length).toBeGreaterThan(0);
    expect(screen.getByText("#automation")).toBeInTheDocument();
    expect(screen.getByText("#smallbusiness")).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
  });

  it("saves edited copy through the persistence callback", async () => {
    const user = userEvent.setup();
    const onUpdateCaption = vi.fn().mockResolvedValue(true);

    render(
      <AssetCard asset={baseAsset} onUpdateCaption={onUpdateCaption} />
    );

    await user.click(screen.getByRole("button", { name: /edit copy/i }));
    const editor = screen.getByRole("textbox");
    await user.clear(editor);
    await user.type(editor, "  Revised campaign copy.  ");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(onUpdateCaption).toHaveBeenCalledWith(
        "asset_1",
        "Revised campaign copy."
      );
    });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("keeps edit mode open and shows an error when persistence fails", async () => {
    const user = userEvent.setup();
    const onUpdateCaption = vi.fn().mockResolvedValue(false);

    render(
      <AssetCard asset={baseAsset} onUpdateCaption={onUpdateCaption} />
    );

    await user.click(screen.getByRole("button", { name: /edit copy/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/save this edit/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("blocks an over-limit X/Twitter edit before calling persistence", async () => {
    const user = userEvent.setup();
    const onUpdateCaption = vi.fn().mockResolvedValue(true);
    const twitterAsset = {
      ...baseAsset,
      platform: "twitter",
      caption: "Short post",
    };

    render(
      <AssetCard asset={twitterAsset} onUpdateCaption={onUpdateCaption} />
    );

    await user.click(screen.getByRole("button", { name: /edit copy/i }));
    const editor = screen.getByRole("textbox");
    fireEvent.change(editor, { target: { value: "x".repeat(281) } });

    expect(screen.getByText("281/280 characters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    expect(onUpdateCaption).not.toHaveBeenCalled();
  });

  it("exposes publish and schedule actions without triggering either prematurely", async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    const onSchedule = vi.fn();

    const { container } = render(
      <AssetCard
        asset={baseAsset}
        onPublish={onPublish}
        onSchedule={onSchedule}
      />
    );

    await user.click(screen.getByRole("button", { name: /post actions/i }));
    expect(onPublish).not.toHaveBeenCalled();
    expect(onSchedule).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /schedule/i }));
    const confirm = screen.getByRole("button", { name: /confirm/i });
    expect(confirm).toBeDisabled();

    const input = container.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    expect(input).not.toBeNull();

    fireEvent.change(input, { target: { value: "2030-01-02T10:30" } });
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    expect(onSchedule).toHaveBeenCalledWith(
      "asset_1",
      new Date("2030-01-02T10:30").toISOString()
    );
    expect(onPublish).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /post actions/i }));
    await user.click(screen.getByRole("button", { name: /publish now/i }));
    expect(onPublish).toHaveBeenCalledWith("asset_1");
  });

  it("labels image generation as free when local ComfyUI mode is active", () => {
    render(
      <AssetCard
        asset={{ ...baseAsset, imagePrompt: "Local image prompt" }}
        onGenerateImage={vi.fn()}
        freeLocalImages
      />
    );

    expect(screen.getByRole("button", { name: /generate background - free local/i })).toBeInTheDocument();
    expect(screen.queryByText(/uses credits/i)).not.toBeInTheDocument();
  });

  it("composes a professional ad only after explicit local action", async () => {
    const user = userEvent.setup();
    const onComposeCreative = vi
      .fn()
      .mockResolvedValue("/api/images/creative?assetId=asset_1&filename=local.png");

    render(
      <AssetCard
        asset={{
          ...baseAsset,
          imagePrompt: "A clean local background",
          imageUrl: "/api/images/comfyui?filename=local.png&subfolder=&type=output",
        }}
        onGenerateImage={vi.fn()}
        onComposeCreative={onComposeCreative}
        freeLocalImages
      />
    );

    expect(onComposeCreative).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /compose pro ad/i }));
    await waitFor(() => expect(onComposeCreative).toHaveBeenCalledWith("asset_1", "professional"));
    expect(await screen.findByAltText("Generated")).toHaveAttribute(
      "src",
      "/api/images/creative?assetId=asset_1&filename=local.png"
    );
    expect(screen.getByRole("button", { name: /recompose pro ad/i })).toBeInTheDocument();
  });

  it("passes the selected creative preset into local background generation", async () => {
    const user = userEvent.setup();
    const onGenerateImage = vi.fn().mockResolvedValue("/api/images/comfyui?filename=tradie.png");

    render(
      <AssetCard
        asset={{ ...baseAsset, imagePrompt: "Australian service business scene" }}
        onGenerateImage={onGenerateImage}
        freeLocalImages
      />
    );

    await user.selectOptions(screen.getByLabelText(/creative style/i), "tradie");
    await user.click(screen.getByRole("button", { name: /generate background - free local/i }));

    await waitFor(() =>
      expect(onGenerateImage).toHaveBeenCalledWith(
        "asset_1",
        "Australian service business scene",
        "tradie"
      )
    );
  });

  it("generates an image only after explicit user action", async () => {
    const user = userEvent.setup();
    const onGenerateImage = vi
      .fn()
      .mockResolvedValue("https://cdn.example.com/generated.png");

    render(
      <AssetCard
        asset={{
          ...baseAsset,
          imagePrompt: "A polished product shot on a dark studio background",
        }}
        onGenerateImage={onGenerateImage}
      />
    );

    expect(onGenerateImage).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: /generate image/i })
    );

    await waitFor(() => {
      expect(onGenerateImage).toHaveBeenCalledWith(
        "asset_1",
        "A polished product shot on a dark studio background",
        "professional"
      );
    });
    expect(await screen.findByAltText("Generated")).toHaveAttribute(
      "src",
      "https://cdn.example.com/generated.png"
    );
  });
});
