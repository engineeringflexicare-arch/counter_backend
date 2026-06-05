import dotenv from "dotenv";
dotenv.config();

import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.API_KEY,
  authDomain: "esp-project-ebe94.firebaseapp.com",
  databaseURL: process.env.DATABASE_URL,
  projectId: process.env.PROJECT_ID,
};

const app = initializeApp(firebaseConfig);

export const rtdb = getDatabase(app);
export const firestore = getFirestore(app);
