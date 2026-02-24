import { PrismaClient, Platform, AccountStatus, ContentStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create demo user
  const user = await prisma.user.upsert({
    where: { email: "demo@minitik.app" },
    update: {},
    create: {
      email: "demo@minitik.app",
      name: "Demo User",
      subscriptionTier: "PRO",
    },
  });

  console.log(`Created user: ${user.email}`);

  // Create demo accounts
  const tiktokAccount = await prisma.account.upsert({
    where: {
      userId_platform_platformAccountId: {
        userId: user.id,
        platform: Platform.TIKTOK,
        platformAccountId: "demo_tiktok_123",
      },
    },
    update: {},
    create: {
      userId: user.id,
      platform: Platform.TIKTOK,
      platformAccountId: "demo_tiktok_123",
      platformUsername: "@demo_creator",
      accessToken: "encrypted_demo_token",
      refreshToken: "encrypted_demo_refresh",
      tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: AccountStatus.CONNECTED,
      lastSyncAt: new Date(),
    },
  });

  const igAccount = await prisma.account.upsert({
    where: {
      userId_platform_platformAccountId: {
        userId: user.id,
        platform: Platform.INSTAGRAM,
        platformAccountId: "demo_ig_456",
      },
    },
    update: {},
    create: {
      userId: user.id,
      platform: Platform.INSTAGRAM,
      platformAccountId: "demo_ig_456",
      platformUsername: "@demo_insta",
      accessToken: "encrypted_demo_token",
      status: AccountStatus.CONNECTED,
      lastSyncAt: new Date(),
    },
  });

  console.log(`Created accounts: TikTok, Instagram`);

  // Create demo content
  const content1 = await prisma.content.create({
    data: {
      userId: user.id,
      title: "My First TikTok",
      description: "Check out this awesome video! #trending #viral",
      status: ContentStatus.PUBLISHED,
      publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      mimeType: "video/mp4",
      duration: 60,
    },
  });

  const content2 = await prisma.content.create({
    data: {
      userId: user.id,
      title: "Product Review",
      description: "Honest review of the latest gadget",
      status: ContentStatus.SCHEDULED,
      scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      mimeType: "video/mp4",
      duration: 120,
    },
  });

  const content3 = await prisma.content.create({
    data: {
      userId: user.id,
      title: "Behind the Scenes",
      description: "A day in my life as a content creator",
      status: ContentStatus.DRAFT,
      mimeType: "video/mp4",
    },
  });

  console.log(`Created ${3} content items`);

  // Create demo publication
  await prisma.publication.create({
    data: {
      contentId: content1.id,
      accountId: tiktokAccount.id,
      platform: Platform.TIKTOK,
      platformPostId: "7123456789",
      status: "PUBLISHED",
      publishedAt: content1.publishedAt,
      metrics: {
        views: 15000,
        likes: 1200,
        shares: 340,
        comments: 89,
      },
    },
  });

  console.log("Created demo publication");

  // Create scheduled job for content2
  await prisma.scheduledJob.create({
    data: {
      contentId: content2.id,
      accountIds: [tiktokAccount.id, igAccount.id],
      scheduledAt: content2.scheduledAt!,
      timezone: "America/New_York",
      priority: "NORMAL",
      status: "PENDING",
    },
  });

  console.log("Created scheduled job");
  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
