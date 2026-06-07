import { Router, type Request, type Response } from "express";
import { createApiKey, deleteApiKey, listApiKeys } from "../storage/store.js";
import { generateApiKey, invalidateKeyCache } from "../utils/keys.js";

export const keysRouter: Router = Router();

// ---------------------------------------------------------------------------
// POST /api/keys  — create
// ---------------------------------------------------------------------------
keysRouter.post("/", (req: Request, res: Response): void => {
  const rawName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const name = rawName.length > 0 ? rawName.slice(0, 80) : "Default";

  try {
    const { raw, hash, prefix } = generateApiKey();
    const row = createApiKey({ name, hash, prefix });

    res.status(201).json({
      ...row,
      // Returned ONCE — never retrievable again.
      key: raw,
    });
  } catch (err) {
    console.error("[keys] create error:", err);
    res.status(500).json({ error: "Failed to create key" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/keys  — list
// ---------------------------------------------------------------------------
keysRouter.get("/", (_req: Request, res: Response): void => {
  try {
    res.json(listApiKeys());
  } catch (err) {
    console.error("[keys] list error:", err);
    res.status(500).json({ error: "Failed to list keys" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/keys/:id  — delete
// ---------------------------------------------------------------------------
keysRouter.delete("/:id", (req: Request, res: Response): void => {
  const id = req.params.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(400).json({ error: "Invalid key id" });
    return;
  }

  try {
    const deleted = deleteApiKey(id);
    if (!deleted) {
      res.status(404).json({ error: "Key not found" });
      return;
    }
    invalidateKeyCache();
    res.status(204).end();
  } catch (err) {
    console.error("[keys] delete error:", err);
    res.status(500).json({ error: "Failed to delete key" });
  }
});
