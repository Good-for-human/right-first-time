import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

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
export const db      = getFirestore(firebaseApp);
export const auth    = getAuth(firebaseApp);
export const storage = getStorage(firebaseApp);

// Tighten the Storage SDK retry budgets. Defaults are 2 min (operations) and
// 10 min (uploads) — far too long when the underlying error is a hard
// configuration failure (CORS / Storage Rules), since we'd just hang the UI.
// 15 s gives one retry pass and surfaces the real error fast.
storage.maxOperationRetryTime = 15_000;
storage.maxUploadRetryTime    = 15_000;
