import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json" assert { type: "json" };

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Firebase Admin
  if (!admin.apps.length) {
    console.log("Initializing Firebase Admin with Project ID:", firebaseConfig.projectId);
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
    console.log("Firebase Admin initialized.");
  }

  app.use(express.json());

  // Function to bootstrap super admin automatically
  async function bootstrapSuperAdmin() {
    const superAdminEmail = "uraann4@gmail.com";
    const password = "Admin123";
    console.log(`[BOOTSTRAP] Starting automatic bootstrap for ${superAdminEmail}`);
    
    try {
      let userRecord;
      try {
        userRecord = await admin.auth().getUserByEmail(superAdminEmail);
        console.log(`[BOOTSTRAP] User exists (UID: ${userRecord.uid}). Updating password/verification.`);
        await admin.auth().updateUser(userRecord.uid, { 
          password,
          emailVerified: true
        });
      } catch (e: any) {
        console.log(`[BOOTSTRAP] User does not exist. Creating new user.`);
        userRecord = await admin.auth().createUser({
          email: superAdminEmail,
          password,
          displayName: "Super Admin",
          emailVerified: true,
        });
      }

      // Whitelist in Firestore
      const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);
      await db.collection("allowed_users").doc(superAdminEmail).set({
        email: superAdminEmail,
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`[BOOTSTRAP] Success: ${superAdminEmail} is ready.`);
    } catch (error: any) {
      console.error("[BOOTSTRAP] Error during automatic bootstrap:", error);
    }
  }

  // Run bootstrap
  await bootstrapSuperAdmin();

  // API Route to create a user (Admin only)
  app.post("/api/admin/create-user", async (req, res) => {
    const { email, password, displayName, adminEmail } = req.body;
    console.log(`Admin ${adminEmail} is creating user: ${email}`);

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
      console.log(`Bootstrapping super admin: ${superAdminEmail}`);
      try {
        userRecord = await admin.auth().getUserByEmail(superAdminEmail);
        console.log(`User exists with UID: ${userRecord.uid}. Updating password and emailVerified.`);
        // If exists, update password and ensure emailVerified
        await admin.auth().updateUser(userRecord.uid, { 
          password,
          emailVerified: true
        });
        res.json({ message: "Super admin password updated", uid: userRecord.uid });
      } catch (e: any) {
        console.log(`User does not exist. Creating new user.`);
        // If not exists, create
        userRecord = await admin.auth().createUser({
          email: superAdminEmail,
          password,
          displayName: "Super Admin",
          emailVerified: true,
        });
        console.log(`User created with UID: ${userRecord.uid}`);
        res.json({ message: "Super admin created", uid: userRecord.uid });
      }

      // Ensure whitelisted in Firestore
      console.log(`Whitelisting ${superAdminEmail} in Firestore database: ${firebaseConfig.firestoreDatabaseId}`);
      const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);
      await db.collection("allowed_users").doc(superAdminEmail).set({
        email: superAdminEmail,
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`Whitelisting complete.`);
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
