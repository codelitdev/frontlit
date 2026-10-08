import { afterEach, describe, expect, it, vi } from "vitest";
import { getMedia, deleteMedia, MediaLitHttpError } from "./service";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("D3 provider reconciliation and idempotent deletion", () => {
  const setup = (response: Response) => {
    vi.stubEnv("MEDIALIT_APIKEY", "test-key");
    vi.stubEnv("MEDIALIT_SERVER", "https://provider.test");
    const fetcher = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetcher);
    return fetcher;
  };
  it("normalizes authoritative access and keeps the requested ID inside the provider path", async () => {
    const fetcher = setup(
      Response.json({
        mediaId: "ml_owned",
        access: "PUBLIC",
        file: "https://cdn.test/owned.png",
      }),
    );
    expect((await getMedia("ml_owned")).access).toBe("public");
    expect(fetcher).toHaveBeenCalledWith(
      "https://provider.test/media/get/ml_owned",
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("retains not-found status for reconciliation", async () => {
    setup(new Response("missing", { status: 404 }));
    await expect(getMedia("ml_missing")).rejects.toMatchObject({ status: 404 });
  });
  it("treats an already deleted object as successful retry", async () => {
    setup(new Response("missing", { status: 404 }));
    await expect(deleteMedia("ml_deleted")).resolves.toBeUndefined();
  });
  it("does not mistake a provider outage for completed deletion", async () => {
    setup(new Response("offline", { status: 503 }));
    await expect(deleteMedia("ml_owned")).rejects.toBeInstanceOf(MediaLitHttpError);
  });
});
