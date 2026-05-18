import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBb_kK1woyNyxjAFXa35Eq8mOD02z_Dg44",
  authDomain: "dnd-boutique.firebaseapp.com",
  projectId: "dnd-boutique",
  storageBucket: "dnd-boutique.firebasestorage.app",
  messagingSenderId: "914932272649",
  appId: "1:914932272649:web:097c1f4ecd868d5f4832d8",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
