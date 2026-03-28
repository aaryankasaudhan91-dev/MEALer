
import { reverseGeocode } from './geminiService';

export interface ReverseGeocodeResult {
  line1: string;
  line2: string;
  landmark?: string;
  pincode: string;
}

// Switched to Gemini for reliable geocoding without rate limits/CORS issues
// This replaces the previous fetch implementation that was failing
export const reverseGeocodeGoogle = async (lat: number, lng: number): Promise<ReverseGeocodeResult | null> => {
  return await reverseGeocode(lat, lng);
};

// Legacy stub to prevent build errors if referenced elsewhere
export const loadGoogleMaps = (): Promise<void> => {
    return Promise.resolve();
};
