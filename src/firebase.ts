import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyC8pViQzByKbWDACt5TF9jG341c17SGI6w',
  authDomain: 'tourniquet-nu.vercel.app',
  databaseURL: 'https://tourniquet-7a123-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'tourniquet-7a123',
  storageBucket: 'tourniquet-7a123.firebasestorage.app',
  messagingSenderId: '936726709945',
  appId: '1:936726709945:web:541cdeb4f24911995a7d68',
  measurementId: 'G-YYRH1VKNCB',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();
