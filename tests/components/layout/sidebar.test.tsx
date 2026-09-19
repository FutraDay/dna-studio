// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigation = vi.hoisted(() => ({
  pathname: "/dashboard",
  push: vi.fn(),
}));

const auth = vi.hoisted(() => ({
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));

vi.mock("next-auth/react", () => ({
  signOut: auth.signOut,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { Sidebar } from "@/components/layout/sidebar";

const brands = [
  {
    id: "brand_1",
    name: "FutraDay",
    url: "https://futraday.com.au",
    colors: ["#050706"],
    logoUrl: null,
  },
  {
    id: "brand_2",
    name: "NudgeWin",
    url: "https://nudgewin.com",
    colors: ["#111111"],
    logoUrl: null,
  },
];

afterEach(cleanup);

beforeEach(() => {
  navigation.pathname = "/dashboard";
  navigation.push.mockReset();
  auth.signOut.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: async () => brands,
    })
  );
});

describe("Sidebar", () => {
  it("loads brands and uses the first brand for Business DNA away from a brand route", async () => {
    render(<Sidebar />);

    expect(await screen.findByText("FutraDay")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /business dna/i })).toHaveAttribute(
      "href",
      "/brands/brand_1"
    );
    expect(screen.getByRole("link", { name: /analytics/i })).toHaveAttribute(
      "href",
      "/analytics"
    );
    expect(fetch).toHaveBeenCalledWith("/api/brands");
  });

  it("keeps the brand from the current URL active", async () => {
    navigation.pathname = "/brands/brand_2";

    render(<Sidebar />);

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: /business dna/i })
      ).toHaveAttribute("href", "/brands/brand_2");
    });
    expect(screen.getByRole("button", { name: /nudgewin/i })).toBeInTheDocument();
  });

  it("switches brands through the selector and navigates to the chosen brand", async () => {
    const user = userEvent.setup();

    render(<Sidebar />);

    await user.click(await screen.findByRole("button", { name: /futraday/i }));
    await user.click(screen.getByRole("button", { name: /nudgewin/i }));

    expect(navigation.push).toHaveBeenCalledWith("/brands/brand_2");
    expect(screen.getByRole("link", { name: /business dna/i })).toHaveAttribute(
      "href",
      "/brands/brand_2"
    );
  });

  it("navigates to add a new brand from the selector", async () => {
    const user = userEvent.setup();

    render(<Sidebar />);

    await user.click(await screen.findByRole("button", { name: /futraday/i }));
    await user.click(screen.getByRole("button", { name: /add new brand/i }));

    expect(navigation.push).toHaveBeenCalledWith("/brands/new");
  });

  it("signs out back to the public home page", async () => {
    const user = userEvent.setup();

    render(<Sidebar />);

    await user.click(screen.getByRole("button", { name: /sign out/i }));
    expect(auth.signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });
});
