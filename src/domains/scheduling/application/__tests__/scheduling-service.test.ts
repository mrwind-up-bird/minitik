import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("@/shared/infrastructure/database/postgres", () => ({
  prisma: {
    scheduledJob: {
      count: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    content: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
    },
  },
}));

// Mock job-scheduler
vi.mock("../../infrastructure/job-scheduler", () => ({
  scheduleJob: vi.fn(),
  cancelJob: vi.fn(),
  getJobState: vi.fn(),
  toUtc: vi.fn((date: Date) => date), // passthrough for tests
}));

import { prisma } from "@/shared/infrastructure/database/postgres";
import { scheduleJob, cancelJob } from "../../infrastructure/job-scheduler";
import {
  schedulePost,
  cancelScheduledJob,
  bulkSchedulePosts,
} from "../scheduling-service";

const mockPrisma = vi.mocked(prisma);
const mockScheduleJob = vi.mocked(scheduleJob);
const mockCancelJob = vi.mocked(cancelJob);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("schedulePost", () => {
  const baseInput = {
    userId: "user-1",
    contentId: "content-1",
    accountIds: ["acc-1"],
    scheduledAt: new Date(Date.now() + 3600_000), // 1 hour from now
    timezone: "America/New_York",
  };

  function setupHappyPath() {
    mockPrisma.scheduledJob.count.mockResolvedValue(0);
    mockPrisma.content.findFirst.mockResolvedValue({ id: "content-1" } as any);
    mockPrisma.account.findMany.mockResolvedValue([{ id: "acc-1" }] as any);
    mockScheduleJob.mockResolvedValue("job-123");
    mockPrisma.content.update.mockResolvedValue({} as any);
  }

  it("schedules a job and returns result", async () => {
    setupHappyPath();

    const result = await schedulePost(baseInput);

    expect(result.scheduledJobId).toBe("job-123");
    expect(result.priority).toBe("NORMAL");
    expect(mockScheduleJob).toHaveBeenCalledOnce();
    expect(mockPrisma.content.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "content-1" },
        data: expect.objectContaining({ status: "SCHEDULED" }),
      })
    );
  });

  it("uses provided priority", async () => {
    setupHappyPath();

    const result = await schedulePost({ ...baseInput, priority: "HIGH" });

    expect(result.priority).toBe("HIGH");
  });

  it("throws when scheduling more than 30 days in advance", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 31);

    await expect(
      schedulePost({ ...baseInput, scheduledAt: futureDate })
    ).rejects.toThrow("30 days");
  });

  it("throws when user has reached concurrent limit", async () => {
    mockPrisma.scheduledJob.count.mockResolvedValue(5);

    await expect(schedulePost(baseInput)).rejects.toThrow(
      "concurrent scheduling limit"
    );
  });

  it("throws when content is not owned by user", async () => {
    mockPrisma.scheduledJob.count.mockResolvedValue(0);
    mockPrisma.content.findFirst.mockResolvedValue(null);

    await expect(schedulePost(baseInput)).rejects.toThrow(
      "not found or not owned"
    );
  });

  it("throws when accounts are not owned by user", async () => {
    mockPrisma.scheduledJob.count.mockResolvedValue(0);
    mockPrisma.content.findFirst.mockResolvedValue({ id: "content-1" } as any);
    mockPrisma.account.findMany.mockResolvedValue([]); // none owned

    await expect(schedulePost(baseInput)).rejects.toThrow(
      "not found or not owned"
    );
  });
});

describe("cancelScheduledJob", () => {
  it("cancels a pending job and reverts content to DRAFT", async () => {
    mockPrisma.scheduledJob.findUnique.mockResolvedValue({
      id: "job-1",
      status: "PENDING",
      contentId: "content-1",
      content: { userId: "user-1" },
    } as any);
    mockCancelJob.mockResolvedValue(undefined);
    mockPrisma.content.update.mockResolvedValue({} as any);

    await cancelScheduledJob("job-1", "user-1");

    expect(mockCancelJob).toHaveBeenCalledWith("job-1");
    expect(mockPrisma.content.update).toHaveBeenCalledWith({
      where: { id: "content-1" },
      data: { status: "DRAFT", scheduledAt: null },
    });
  });

  it("throws when job is not found", async () => {
    mockPrisma.scheduledJob.findUnique.mockResolvedValue(null);

    await expect(cancelScheduledJob("bad-id", "user-1")).rejects.toThrow(
      "not found"
    );
  });

  it("throws when user does not own the job", async () => {
    mockPrisma.scheduledJob.findUnique.mockResolvedValue({
      id: "job-1",
      status: "PENDING",
      contentId: "content-1",
      content: { userId: "other-user" },
    } as any);

    await expect(cancelScheduledJob("job-1", "user-1")).rejects.toThrow(
      "Not authorized"
    );
  });

  it("throws when job is not in PENDING status", async () => {
    mockPrisma.scheduledJob.findUnique.mockResolvedValue({
      id: "job-1",
      status: "ACTIVE",
      contentId: "content-1",
      content: { userId: "user-1" },
    } as any);

    await expect(cancelScheduledJob("job-1", "user-1")).rejects.toThrow(
      'Cannot cancel a job in status "ACTIVE"'
    );
  });
});

describe("bulkSchedulePosts", () => {
  it("throws when no posts provided", async () => {
    await expect(
      bulkSchedulePosts({ userId: "user-1", posts: [] })
    ).rejects.toThrow("at least one post");
  });

  it("throws when exceeding max bulk count", async () => {
    const posts = Array.from({ length: 21 }, (_, i) => ({
      contentId: `c-${i}`,
      accountIds: ["acc-1"],
      scheduledAt: new Date(Date.now() + 3600_000),
      timezone: "UTC",
    }));

    await expect(
      bulkSchedulePosts({ userId: "user-1", posts })
    ).rejects.toThrow("Cannot schedule more than 20");
  });
});
