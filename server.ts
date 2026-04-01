import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import admin from "firebase-admin";
import firebaseConfig from "./firebase-applet-config.json" assert { type: "json" };

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Firebase Admin
  // Note: In this environment, we might need to provide credentials if not running in GCP
  // But we'll try to initialize with project ID first.
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }

  app.use(express.json());

  // API Route to create a user (Admin only)
  app.post("/api/admin/create-user", async (req, res) => {
    const { email, password, displayName, adminEmail } = req.body;

    // Basic security: only allow the super admin email to trigger this
    // In a real app, you'd check the auth token of the requester
    if (adminEmail !== "uraann4@gmail.com") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    try {
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName,
      });
      res.json({ uid: userRecord.uid });
    } catch (error: any) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Bootstrap route to create initial super admin
  app.post("/api/admin/bootstrap", async (req, res) => {
    const { password } = req.body;
    const superAdminEmail = "uraann4@gmail.com";

    if (password !== "Admin123") {
      return res.status(403).json({ error: "Invalid bootstrap password" });
    }

    try {
      // Check if user exists
      let userRecord;
      try {
        userRecord = await admin.auth().getUserByEmail(superAdminEmail);
        // If exists, update password
        await admin.auth().updateUser(userRecord.uid, { password });
        res.json({ message: "Super admin password updated", uid: userRecord.uid });
      } catch (e: any) {
        // If not exists, create
        userRecord = await admin.auth().createUser({
          email: superAdminEmail,
          password,
          displayName: "Super Admin",
        });
        res.json({ message: "Super admin created", uid: userRecord.uid });
      }

      // Ensure whitelisted in Firestore
      const db = admin.firestore();
      await db.collection("allowed_users").doc(superAdminEmail).set({
        email: superAdminEmail,
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error: any) {
      console.error("Bootstrap error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
