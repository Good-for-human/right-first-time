import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyB37JwlJAILYNwc-L1b4_WpcjGqGYav3Og',
  authDomain: 'right-first-time.firebaseapp.com',
  projectId: 'right-first-time',
  storageBucket: 'right-first-time.firebasestorage.app',
  messagingSenderId: '953616034728',
  appId: '1:953616034728:web:b0e0dd9fafd10961c1cb9d',
  measurementId: 'G-H8LEYFQTXB',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const db   = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);
