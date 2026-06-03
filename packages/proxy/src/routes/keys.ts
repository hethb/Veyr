import { Router, type Request, type Response } from "express";
import { dashboardAuth } from "../middleware/dashboardAuth.js";
import { getServiceClient } from "../utils/supabase.js";
import { generateApiKey, invalidateKeyCache } from "../utils/keys.js";

export const keysRouter: Router = Router();
keysRouter.use(dashboardAuth);

// ---------------------------------------------------------------------------
// POST /api/keys  — create
// ---------------------------------------------------------------------------
keysRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }

  const rawName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const name = rawName.length > 0 ? rawName.slice(0, 80) : "Default";

  try {
    const { raw, hash, prefix } = generateApiKey();
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("api_keys")
      .insert({
        user_id: userId,
        key_hash: hash,
        key_prefix: prefix,
        name,
      })
      .select("id, key_prefix, name, created_at, last_used_at")
      .single();

    if (error || !data) {
      console.error("[keys] insert failed:", error?.message);
      res.status(500).json({ error: "Failed to create key" });
      return;
    }

    res.status(201).json({
      id: data.id,
      key_prefix: data.key_prefix,
      name: data.name,
      created_at: data.created_at,
      last_used_at: data.last_used_at,
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
keysRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, key_prefix, name, created_at, last_used_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[keys] list failed:", error.message);
      res.status(500).json({ error: "Failed to list keys" });
      return;
    }
    res.json(data ?? []);
  } catch (err) {
    console.error("[keys] list error:", err);
    res.status(500).json({ error: "Failed to list keys" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/keys/:id  — delete (ownership-checked)
// ---------------------------------------------------------------------------
keysRouter.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }

  const id = req.params.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(400).json({ error: "Invalid key id" });
    return;
  }

  try {
    const supabase = getServiceClient();
    const { data: existing, error: lookupErr } = await supabase
      .from("api_keys")
      .select("id, user_id")
      .eq("id", id)
      .maybeSingle();

    if (lookupErr) {
      console.error("[keys] lookup failed:", lookupErr.message);
      res.status(500).json({ error: "Failed to delete key" });
      return;
    }

    if (!existing || existing.user_id !== userId) {
      res.status(404).json({ error: "Key not found" });
      return;
    }

    const { error: delErr } = await supabase
      .from("api_keys")
      .delete()
      .eq("id", id);

    if (delErr) {
      console.error("[keys] delete failed:", delErr.message);
      res.status(500).json({ error: "Failed to delete key" });
      return;
    }

    invalidateKeyCache();
    res.status(204).end();
  } catch (err) {
    console.error("[keys] delete error:", err);
    res.status(500).json({ error: "Failed to delete key" });
  }
});
