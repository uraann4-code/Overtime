import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function check() {
  const claims = await getDocs(collection(db, 'claims'));
  console.log("Claims count:", claims.size);
  if (claims.size > 0) {
    console.log("Sample claim:", claims.docs[0].data());
  }
  process.exit(0);
}
check();
