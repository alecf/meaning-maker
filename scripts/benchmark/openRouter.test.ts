import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterProvider, openRouterKey } from "./openRouter";

const MODEL = { name: "vendor/model", upstream: "Vendor" };

interface Body {
  model: string;
  input: string[];
  input_type?: string;
  provider: { order: string[]; allow_fallbacks: boolean };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const ok = (vector: number[] = [1, 0], provider = "Vendor"): Response =>
  json({ provider, data: [{ index: 0, embedding: vector }] });

function stubFetch(respond: (body: Body, call: number) => Response) {
  let call = 0;
  const stub = vi.fn(async (_url: string, init: RequestInit) =>
    respond(JSON.parse(init.body as string) as Body, call++),
  );
  vi.stubGlobal("fetch", stub);
  return stub;
}

const sentBody = (stub: ReturnType<typeof stubFetch>, call = 0): Body =>
  JSON.parse(stub.mock.calls[call][1].body as string) as Body;

const noSleep = async (): Promise<void> => {};
const provider = (model = MODEL as Parameters<typeof createOpenRouterProvider>[1]) =>
  createOpenRouterProvider("test-key", model, { sleep: noSleep });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createOpenRouterProvider", () => {
  it("sends each text alone, so a vector can't depend on its batch", async () => {
    const stub = stubFetch(() => ok());
    await provider().embedBatch(["a", "b", "c"]);
    expect(stub.mock.calls.map((_, i) => sentBody(stub, i).input).sort()).toEqual([
      ["a"],
      ["b"],
      ["c"],
    ]);
  });
  it("returns vectors in input order whatever order responses finish in", async () => {
    stubFetch((body) => ok([body.input[0].charCodeAt(0)]));
    const vectors = await provider().embedBatch(["a", "b", "c", "d", "e", "f"]);
    expect(vectors).toEqual([[97], [98], [99], [100], [101], [102]]);
  });
  it("runs only a few requests at once", async () => {
    let active = 0;
    let peak = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
        return ok();
      }),
    );
    await provider().embedBatch(Array.from({ length: 20 }, (_, i) => `t${i}`));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
  });
  it("sends the key, the model and a pinned upstream with no fallback", async () => {
    const stub = stubFetch(() => ok());
    await provider().embedBatch(["a"]);
    const [url, init] = stub.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/embeddings");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(sentBody(stub)).toMatchObject({
      model: "vendor/model",
      provider: { order: ["Vendor"], allow_fallbacks: false },
    });
  });
  it("adds the prefix to the text", async () => {
    const stub = stubFetch(() => ok());
    await provider({ ...MODEL, prefix: "task: " }).embedBatch(["a"]);
    expect(sentBody(stub).input).toEqual(["task: a"]);
  });
  it("sends input_type only when it's set", async () => {
    const stub = stubFetch(() => ok());
    await provider().embedBatch(["a"]);
    await provider({ ...MODEL, inputType: "clustering" }).embedBatch(["a"]);
    expect(sentBody(stub, 0)).not.toHaveProperty("input_type");
    expect(sentBody(stub, 1).input_type).toBe("clustering");
  });
  it.each([429, 500, 503])("retries a %i with backoff", async (status) => {
    const stub = stubFetch((_, call) => (call === 0 ? json({}, status) : ok([3, 4])));
    const sleep = vi.fn(noSleep);
    const vectors = await createOpenRouterProvider("k", MODEL, { sleep }).embedBatch(["a"]);
    expect(vectors).toEqual([[3, 4]]);
    expect(stub).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
  it("waits longer after each retry", async () => {
    stubFetch((_, call) => (call < 3 ? json({}, 503) : ok()));
    const sleep = vi.fn(noSleep);
    await createOpenRouterProvider("k", MODEL, { sleep }).embedBatch(["a"]);
    const waits = sleep.mock.calls.map(([ms]) => ms as number);
    expect(waits[1]).toBeGreaterThan(waits[0]);
    expect(waits[2]).toBeGreaterThan(waits[1]);
  });
  it("retries when a request fails on the network", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (call++ === 0) throw new TypeError("fetch failed");
        return ok();
      }),
    );
    await expect(provider().embedBatch(["a"])).resolves.toEqual([[1, 0]]);
  });
  it("retries an error sent with a 200", async () => {
    const stub = stubFetch((_, call) =>
      call === 0 ? json({ error: { code: 502, message: "upstream" } }) : ok(),
    );
    await expect(provider().embedBatch(["a"])).resolves.toEqual([[1, 0]]);
    expect(stub).toHaveBeenCalledTimes(2);
  });
  it("gives up after its retries", async () => {
    const stub = stubFetch(() => json({}, 503));
    await expect(provider().embedBatch(["a"])).rejects.toThrow(/503/);
    expect(stub.mock.calls.length).toBe(6);
  });
  it("doesn't retry a request that can't succeed", async () => {
    const stub = stubFetch(() => json({ error: { message: "bad key" } }, 401));
    await expect(provider().embedBatch(["a"])).rejects.toThrow(/401.*bad key/);
    expect(stub).toHaveBeenCalledTimes(1);
  });
  it("stops sending requests after a failure that won't clear", async () => {
    const stub = stubFetch(() => json({ error: { message: "bad key" } }, 401));
    const texts = Array.from({ length: 20 }, (_, i) => `t${i}`);
    await expect(provider().embedBatch(texts)).rejects.toThrow(/401/);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(stub.mock.calls.length).toBeLessThanOrEqual(4);
  });
  it("rejects a response from another upstream", async () => {
    stubFetch(() => ok([1, 0], "Other"));
    await expect(provider().embedBatch(["a"])).rejects.toThrow(/Other/);
  });
  it("rejects anything but one vector", async () => {
    stubFetch(() =>
      json({
        provider: "Vendor",
        data: [
          { index: 0, embedding: [1] },
          { index: 1, embedding: [2] },
        ],
      }),
    );
    await expect(provider().embedBatch(["a"])).rejects.toThrow(/2 vectors/);
  });
  it("never puts the key in an error", async () => {
    stubFetch(() => json({ error: { message: "nope" } }, 403));
    const error = await provider().embedBatch(["a"]).catch((e: Error) => e);
    expect(String(error)).not.toContain("test-key");
  });
  it("identifies the upstream, prefix and input type", () => {
    const base = provider().id;
    expect(provider({ ...MODEL, upstream: "Other" }).id).not.toBe(base);
    expect(provider({ ...MODEL, prefix: "x" }).id).not.toBe(base);
    expect(provider({ ...MODEL, inputType: "x" }).id).not.toBe(base);
  });
  it("gives no prefix and an empty prefix the same id", () => {
    expect(provider({ ...MODEL, prefix: "" }).id).toBe(provider().id);
  });
});

describe("openRouterKey", () => {
  it("reads the key", () => {
    expect(openRouterKey({ OPENROUTER_API_KEY: "k" })).toBe("k");
  });
  it.each([{}, { OPENROUTER_API_KEY: "" }])("explains a missing key", (env) => {
    expect(() => openRouterKey(env)).toThrow(/\.env\.benchmark\.local/);
  });
});
