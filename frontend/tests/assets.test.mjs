import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { stripTypeScriptTypes } from "node:module";

// Run the upload helper with mocked transport; no real cloud writes or Gemini calls.
const source = await readFile(new URL("../src/api/assets.ts", import.meta.url), "utf8");
const shim = `
class PartsError extends Error { constructor(title, message) { super(message); this.title = title; } }
const send = (path, init) => fetch(path, init);
const readDetail = async (response) => (await response.json()).detail ?? null;
`;
const compiled = stripTypeScriptTypes(shim + source.replace(/^import .*;\r?\n/gm, ""));
const { uploadSketch } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("Save uploads the original image once and reuses its ID", async (t) => {
  const file = new File(["sketch"], "dress.png", { type: "image/png" });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (path, init) => {
    calls++;
    assert.equal(path, "/assets");
    assert.equal(init.method, "POST");
    assert.equal(init.headers, undefined); // browser supplies the multipart boundary
    const image = init.body.get("image");
    assert.equal(image.name, file.name);
    assert.equal(await image.text(), await file.text());
    return Response.json({ id: "asset-1" }, { status: 201 });
  });
  const first = uploadSketch(file);
  assert.equal(uploadSketch(file), first);
  assert.equal(await first, "asset-1");
  assert.equal(await uploadSketch(file), "asset-1");
  assert.equal(calls, 1);
});

test("failed uploads show the error and allow retry", async (t) => {
  const file = new File(["sketch"], "retry.png");
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => ++calls === 1
    ? Response.json({ detail: "Could not store the image" }, { status: 502 })
    : Response.json({ id: "retry-id" }, { status: 201 }));
  await assert.rejects(uploadSketch(file), /Could not store the image/);
  assert.equal(await uploadSketch(file), "retry-id");
  assert.equal(calls, 2);
});

test("invalid upload replies cannot produce a successful save ID", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ id: 12 }));
  await assert.rejects(uploadSketch(new File(["sketch"], "bad.png")), /image ID/);
});

test("different sketches get separate image records", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => Response.json({ id: `asset-${++calls}` }));
  const a = new File(["a"], "same-name.png");
  const b = new File(["b"], "same-name.png");
  assert.equal(await uploadSketch(a), "asset-1");
  assert.equal(await uploadSketch(b), "asset-2");
});
