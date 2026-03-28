
import { User, FoodPosting, ChatMessage, Rating, Notification } from '../types';

const API_URL = '/api';

const api = async <T>(endpoint: string, options?: RequestInit): Promise<T> => {
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            headers: { 'Content-Type': 'application/json' },
            ...options
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") === -1) {
             throw new Error("Invalid JSON Response");
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Backend unreachable at ${endpoint} or request failed.`, error);
        throw error;
    }
};

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c; 
};

export const storage = {
  getUsers: async (): Promise<User[]> => api<User[]>('/users'),
  getUser: async (id: string): Promise<User | undefined> => api<User>(`/users/${id}`),
  saveUser: async (user: User) => api('/users', { method: 'POST', body: JSON.stringify(user) }),
  updateUser: async (id: string, updates: Partial<User>) => api(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteUser: async (id: string) => api(`/users/${id}`, { method: 'DELETE' }),

  getPostings: async (): Promise<FoodPosting[]> => api<FoodPosting[]>('/postings'),
  savePosting: async (posting: FoodPosting) => api('/postings', { method: 'POST', body: JSON.stringify(posting) }),
  updatePosting: async (id: string, updates: Partial<FoodPosting>) => api(`/postings/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deletePosting: async (id: string) => api(`/postings/${id}`, { method: 'DELETE' }),

  listenMessages: (postingId: string, callback: (msgs: ChatMessage[]) => void) => {
    const fetchMsgs = async () => {
        try {
            const msgs = await api<ChatMessage[]>(`/messages/${postingId}`);
            callback(msgs || []);
        } catch { callback([]); }
    };
    fetchMsgs();
    const interval = setInterval(fetchMsgs, 3000);
    return () => clearInterval(interval);
  },
  saveMessage: async (_postingId: string, message: ChatMessage) => {
      await api('/messages', { method: 'POST', body: JSON.stringify(message) });
  },

  submitUserRating: async (postingId: string, rating: Rating) => {
      await api('/ratings', { method: 'POST', body: JSON.stringify({ postingId, ratingData: rating }) });
  },

  listenNotifications: (userId: string, callback: (notifications: Notification[]) => void) => {
    const fetchNotifs = async () => {
        try {
            const notifs = await api<Notification[]>(`/notifications/${userId}`);
            callback(notifs || []);
        } catch { callback([]); }
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 10000);
    return () => clearInterval(interval);
  },

  getNotifications: async (userId: string): Promise<Notification[]> => api<Notification[]>(`/notifications/${userId}`),
  createNotification: async (userId: string, message: string, type: 'INFO' | 'ACTION' | 'SUCCESS') => {
    const n = { id: Math.random().toString(36).substr(2, 9), userId, message, type, isRead: false, createdAt: Date.now() };
    await api('/notifications', { method: 'POST', body: JSON.stringify(n) });
  }
};
