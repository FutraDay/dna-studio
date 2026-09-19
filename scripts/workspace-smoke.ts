import "dotenv/config";
import fs from "node:fs";
import { chromium, type BrowserContext } from "playwright";
import { encode } from "next-auth/jwt";
import { prisma } from "../src/lib/db";

const baseUrl =
  process.env.CAMPAIGN_SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const brandQuery = process.env.CAMPAIGN_SMOKE_BRAND ?? "FutraDay";

async function authenticatedContext(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  secret: string,
  userId: string
) {
  const token = await encode({
    secret,
    token: { sub: userId },
    maxAge: 60 * 60,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });

  await context.addCookies([
    {
      name: "next-auth.session-token",
      value: token,
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  return context;
}

function watchForbiddenRequests(
  context: BrowserContext,
  forbiddenRequests: string[]
) {
  context.on("request", (request) => {
    const url = request.url();
    if (
      url.includes("/publish") ||
      url.includes("/schedule") ||
      url.includes("/api/images/generate") ||
      url.includes("/api/campaigns/generate") ||
      url.includes("/api/analytics/refresh") ||
      url.includes("graph.facebook.com") ||
      url.includes("api.twitter.com") ||
      url.includes("api.linkedin.com")
    ) {
      forbiddenRequests.push(`${request.method()} ${url}`);
    }
  });
}

async function assertOk(
  response: Awaited<ReturnType<BrowserContext["request"]["get"]>>,
  label: string
) {
  if (!response.ok()) {
    throw new Error(`${label} failed with HTTP ${response.status()}`);
  }
  return response;
}

async function main() {
  const authSecret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!authSecret) {
    throw new Error("NextAuth secret is not configured");
  }

  const source = await prisma.campaign.findFirst({
    where: {
      brand: {
        name: {
          contains: brandQuery,
          mode: "insensitive",
        },
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      brandId: true,
      brand: {
        select: {
          name: true,
          workspaceId: true,
          workspace: {
            select: {
              ownerId: true,
            },
          },
        },
      },
    },
  });

  if (!source) {
    throw new Error(`No campaign found for ${brandQuery}`);
  }

  const tempEmail = `workspace-smoke-${Date.now()}@example.invalid`;
  const tempUser = await prisma.user.create({
    data: {
      name: "Workspace Smoke Member",
      email: tempEmail,
    },
    select: { id: true, email: true },
  });

  await prisma.workspaceMember.create({
    data: {
      workspaceId: source.brand.workspaceId,
      userId: tempUser.id,
      role: "member",
    },
  });

  const preferredChrome =
    process.env.CAMPAIGN_SMOKE_CHROME_PATH ??
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

  const browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(preferredChrome)
      ? { executablePath: preferredChrome }
      : {}),
  });

  const forbiddenRequests: string[] = [];
  const browserErrors: string[] = [];

  let memberContext: BrowserContext | null = null;
  let ownerContext: BrowserContext | null = null;

  try {
    memberContext = await authenticatedContext(
      browser,
      authSecret,
      tempUser.id
    );
    watchForbiddenRequests(memberContext, forbiddenRequests);

    const memberPage = await memberContext.newPage();
    memberPage.on("pageerror", (error) => browserErrors.push(error.message));

    const campaignResponse = await memberPage.goto(
      `${baseUrl}/campaigns/${source.id}`,
      {
        waitUntil: "networkidle",
        timeout: 30_000,
      }
    );

    if (!campaignResponse?.ok()) {
      throw new Error(
        `Shared campaign page failed with HTTP ${
          campaignResponse?.status() ?? "unknown"
        }`
      );
    }

    await memberPage
      .getByRole("heading", { name: "Campaign review" })
      .waitFor();

    const brandsResponse = await assertOk(
      await memberContext.request.get(`${baseUrl}/api/brands`),
      "Shared brand list"
    );
    const brands = (await brandsResponse.json()) as Array<{ id: string }>;
    if (!brands.some((brand) => brand.id === source.brandId)) {
      throw new Error("Shared brand was not visible to the workspace member");
    }

    await assertOk(
      await memberContext.request.get(
        `${baseUrl}/api/campaigns/${source.id}`
      ),
      "Shared campaign API"
    );

    await assertOk(
      await memberContext.request.get(
        `${baseUrl}/api/analytics?brandId=${source.brandId}`
      ),
      "Shared analytics API"
    );

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      1
    );
    const calendarParams = new URLSearchParams({
      start: monthStart.toISOString(),
      end: monthEnd.toISOString(),
      brandId: source.brandId,
    });

    await assertOk(
      await memberContext.request.get(
        `${baseUrl}/api/calendar?${calendarParams.toString()}`
      ),
      "Shared calendar API"
    );

    ownerContext = await authenticatedContext(
      browser,
      authSecret,
      source.brand.workspace.ownerId
    );
    watchForbiddenRequests(ownerContext, forbiddenRequests);

    const ownerPage = await ownerContext.newPage();
    ownerPage.on("pageerror", (error) => browserErrors.push(error.message));

    const teamResponse = await ownerPage.goto(`${baseUrl}/settings/team`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    if (!teamResponse?.ok()) {
      throw new Error(
        `Team settings page failed with HTTP ${
          teamResponse?.status() ?? "unknown"
        }`
      );
    }

    await ownerPage
      .getByRole("heading", { name: "Team workspaces" })
      .waitFor();
    await ownerPage.getByText(tempEmail, { exact: true }).waitFor();

    if (forbiddenRequests.length > 0) {
      throw new Error(
        `Workspace smoke triggered forbidden requests: ${forbiddenRequests.join(
          " | "
        )}`
      );
    }

    if (browserErrors.length > 0) {
      throw new Error(
        `Browser emitted page errors: ${browserErrors.join(" | ")}`
      );
    }

    console.log(
      JSON.stringify(
        {
          passed: true,
          workspaceId: source.brand.workspaceId,
          brand: source.brand.name,
          sharedBrandVisible: true,
          sharedCampaignVisible: true,
          sharedAnalyticsVisible: true,
          sharedCalendarVisible: true,
          teamMemberVisibleToOwner: true,
          forbiddenRequestsTriggered: false,
          browserErrors,
        },
        null,
        2
      )
    );
  } finally {
    if (memberContext) await memberContext.close();
    if (ownerContext) await ownerContext.close();
    await browser.close();

    await prisma.workspaceMember.deleteMany({
      where: { userId: tempUser.id },
    });
    await prisma.user.deleteMany({
      where: { id: tempUser.id },
    });

    const [remainingUsers, remainingMemberships] = await Promise.all([
      prisma.user.count({ where: { id: tempUser.id } }),
      prisma.workspaceMember.count({ where: { userId: tempUser.id } }),
    ]);

    if (remainingUsers !== 0 || remainingMemberships !== 0) {
      throw new Error(
        `Workspace smoke cleanup failed: users=${remainingUsers}, memberships=${remainingMemberships}`
      );
    }

    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("WORKSPACE_BROWSER_SMOKE_FAILED", error);
  process.exitCode = 1;
});
