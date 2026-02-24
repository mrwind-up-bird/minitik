import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchPlatformUserInfo } from "../platform-user-info";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

describe("fetchPlatformUserInfo", () => {
  describe("tiktok", () => {
    it("returns platformAccountId and username from TikTok", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          data: { user: { open_id: "tt_123", display_name: "TikTokUser" } },
        })
      );

      const result = await fetchPlatformUserInfo("tiktok", "token_abc");

      expect(result).toEqual({
        platformAccountId: "tt_123",
        platformUsername: "TikTokUser",
      });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",
        { headers: { Authorization: "Bearer token_abc" } }
      );
    });

    it("returns null username when display_name is missing", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: { user: { open_id: "tt_456" } } })
      );

      const result = await fetchPlatformUserInfo("tiktok", "token");
      expect(result.platformAccountId).toBe("tt_456");
      expect(result.platformUsername).toBeNull();
    });

    it("throws on non-OK response", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));

      await expect(
        fetchPlatformUserInfo("tiktok", "bad_token")
      ).rejects.toThrow("TikTok user info request failed: 401");
    });

    it("throws when open_id is missing", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: { user: {} } })
      );

      await expect(
        fetchPlatformUserInfo("tiktok", "token")
      ).rejects.toThrow("missing open_id");
    });
  });

  describe("instagram", () => {
    it("returns platformAccountId and username from Instagram", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: "ig_789", username: "InstaUser" })
      );

      const result = await fetchPlatformUserInfo("instagram", "ig_token");

      expect(result).toEqual({
        platformAccountId: "ig_789",
        platformUsername: "InstaUser",
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("graph.instagram.com/me")
      );
    });

    it("coerces numeric id to string", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: 12345, username: "User" })
      );

      const result = await fetchPlatformUserInfo("instagram", "token");
      expect(result.platformAccountId).toBe("12345");
    });

    it("throws when id is missing", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ username: "NoId" }));

      await expect(
        fetchPlatformUserInfo("instagram", "token")
      ).rejects.toThrow("missing id");
    });
  });

  describe("youtube", () => {
    it("returns channel ID and title from YouTube", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          items: [
            { id: "UC_abc", snippet: { title: "My Channel" } },
          ],
        })
      );

      const result = await fetchPlatformUserInfo("youtube", "yt_token");

      expect(result).toEqual({
        platformAccountId: "UC_abc",
        platformUsername: "My Channel",
      });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: "Bearer yt_token" } }
      );
    });

    it("throws when no channel items returned", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [] }));

      await expect(
        fetchPlatformUserInfo("youtube", "token")
      ).rejects.toThrow("missing channel ID");
    });

    it("returns null username when snippet.title is missing", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ items: [{ id: "UC_xyz", snippet: {} }] })
      );

      const result = await fetchPlatformUserInfo("youtube", "token");
      expect(result.platformAccountId).toBe("UC_xyz");
      expect(result.platformUsername).toBeNull();
    });
  });
});
