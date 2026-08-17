/**
 * SYNOVA Local IndexedDB Controller
 */

const DB_NAME = 'fitvr_db';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create users store with '_id' as keypath (matching Mongoose _id)
      if (!db.objectStoreNames.contains('users')) {
        const userStore = db.createObjectStore('users', { keyPath: '_id' });
        userStore.createIndex('name', 'name', { unique: true });
      }
      
      // Create results store with '_id' as keypath
      if (!db.objectStoreNames.contains('results')) {
        const resultsStore = db.createObjectStore('results', { keyPath: '_id' });
        resultsStore.createIndex('userId', 'userId', { unique: false });
      }
    };
    
    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
    
    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });
  
  return dbPromise;
}

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
};

export const localDB = {
  // Sign in: find user by name, or create if not exists, and update details
  async signInUser(userData) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['users'], 'readwrite');
      const store = transaction.objectStore('users');
      const index = store.index('name');
      const getReq = index.get(userData.name);
      
      getReq.onsuccess = () => {
        let user = getReq.result;
        if (user) {
          // Update details
          if (userData.age !== undefined) user.age = userData.age;
          if (userData.gender !== undefined) user.gender = userData.gender;
          if (userData.height !== undefined) user.height = userData.height;
          if (userData.weight !== undefined) user.weight = userData.weight;
        } else {
          // Create new user
          user = {
            _id: generateId(),
            name: userData.name,
            age: userData.age ?? 25,
            gender: userData.gender ?? 'Other',
            height: userData.height ?? 175,
            weight: userData.weight ?? 70,
            createdAt: new Date().toISOString()
          };
        }
        
        const putReq = store.put(user);
        putReq.onsuccess = () => resolve(user);
        putReq.onerror = () => reject(putReq.error);
      };
      
      getReq.onerror = () => reject(getReq.error);
    });
  },

  // Fetch all users
  async getAllUsers() {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['users'], 'readonly');
      const store = transaction.objectStore('users');
      const req = store.getAll();
      
      req.onsuccess = () => {
        const users = req.result;
        users.sort((a, b) => a.name.localeCompare(b.name));
        resolve(users);
      };
      req.onerror = () => reject(req.error);
    });
  },

  // Save game result
  async saveGameResult(resultData) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['results'], 'readwrite');
      const store = transaction.objectStore('results');
      
      const record = {
        _id: generateId(),
        userId: resultData.userId,
        gameType: resultData.gameType,
        score: resultData.score,
        duration: resultData.duration,
        calories: resultData.calories,
        metadata: resultData.metadata,
        date: resultData.date ? new Date(resultData.date).toISOString() : new Date().toISOString()
      };
      
      const req = store.put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  },

  // Get results for a user
  async getResultsForUser(userId) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['results'], 'readonly');
      const store = transaction.objectStore('results');
      const index = store.index('userId');
      const req = index.getAll(userId);
      
      req.onsuccess = () => {
        const results = req.result;
        results.sort((a, b) => new Date(a.date) - new Date(b.date));
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }
};
