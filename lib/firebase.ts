import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: 'AIzaSyCXdiIyqUwnQWhjIJBhHR_J0RDJksgcQFQ',
  authDomain: 'symonskitechen.firebaseapp.com',
  projectId: 'symonskitechen',
  storageBucket: 'symonskitechen.firebasestorage.app',
  messagingSenderId: '265348681220',
  appId: '1:265348681220:web:ce4b833879c037d017ef51',
  measurementId: 'G-DG3JXSFJXJ',
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export default app
