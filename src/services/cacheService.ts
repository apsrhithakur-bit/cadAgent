import { supabase } from '../lib/supabase';

interface CacheItem {
  key: string;
  data: any;
  timestamp: number;
  expiresAt: number;
  type: 'ai_response' | 'model_data' | 'voice_synthesis' | 'image_analysis';
  user_id?: string;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  priority?: 'low' | 'medium' | 'high';
  syncToCloud?: boolean;
}

class CacheService {
  private dbName = 'agenticad-cache';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;
  private isInitialized = false;
  private hasLoggedTableMissing = false;

  constructor() {
    this.initializeDB();
  }

  /**
   * Initialize IndexedDB for browser caching
   */
  private async initializeDB(): Promise<void> {
    try {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.warn('IndexedDB not available, using memory cache only');
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create cache store
        if (!db.objectStoreNames.contains('cache')) {
          const store = db.createObjectStore('cache', { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        this.isInitialized = true;
        this.cleanExpiredEntries();
      };

    } catch (error) {
      console.warn('Failed to initialize IndexedDB:', error);
    }
  }

  /**
   * Generate cache key from input parameters
   */
  private generateKey(type: string, params: any): string {
    const paramsString = JSON.stringify(params, Object.keys(params).sort());
    const hash = this.simpleHash(paramsString);
    return `${type}_${hash}`;
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Cache AI text analysis responses
   */
  async cacheTextAnalysis(input: string, response: any, options: CacheOptions = {}): Promise<void> {
    const key = this.generateKey('text_analysis', { input });
    await this.set(key, response, { 
      ...options, 
      type: 'ai_response',
      ttl: options.ttl || 24 * 60 * 60 * 1000 // 24 hours
    });
  }

  /**
   * Get cached text analysis
   */
  async getCachedTextAnalysis(input: string): Promise<any | null> {
    const key = this.generateKey('text_analysis', { input });
    return this.get(key);
  }

  /**
   * Cache image analysis responses
   */
  async cacheImageAnalysis(imageHash: string, analysisType: string, response: any, options: CacheOptions = {}): Promise<void> {
    const key = this.generateKey('image_analysis', { imageHash, analysisType });
    await this.set(key, response, { 
      ...options, 
      type: 'image_analysis',
      ttl: options.ttl || 7 * 24 * 60 * 60 * 1000 // 7 days
    });
  }

  /**
   * Get cached image analysis
   */
  async getCachedImageAnalysis(imageHash: string, analysisType: string): Promise<any | null> {
    try {
      const key = this.generateKey('image_analysis', { imageHash, analysisType });
      return await this.get(key);
    } catch (error) {
      console.warn('Image analysis cache error:', error);
      return null;
    }
  }

  /**
   * Cache voice synthesis responses
   */
  async cacheVoiceSynthesis(text: string, voiceId: string, audioData: string, options: CacheOptions = {}): Promise<void> {
    const key = this.generateKey('voice_synthesis', { text, voiceId });
    await this.set(key, { audioData }, { 
      ...options, 
      type: 'voice_synthesis',
      ttl: options.ttl || 30 * 24 * 60 * 60 * 1000 // 30 days
    });
  }

  /**
   * Get cached voice synthesis
   */
  async getCachedVoiceSynthesis(text: string, voiceId: string): Promise<string | null> {
    const key = this.generateKey('voice_synthesis', { text, voiceId });
    const cached = await this.get(key);
    return cached?.audioData || null;
  }

  /**
   * Cache architectural models
   */
  async cacheModel(modelId: string, modelData: any, options: CacheOptions = {}): Promise<void> {
    const key = `model_${modelId}`;
    await this.set(key, modelData, { 
      ...options, 
      type: 'model_data',
      ttl: options.ttl || 7 * 24 * 60 * 60 * 1000 // 7 days
    });
  }

  /**
   * Get cached model
   */
  async getCachedModel(modelId: string): Promise<any | null> {
    const key = `model_${modelId}`;
    return this.get(key);
  }

  /**
   * Store data in cache (browser first, then cloud)
   */
  private async set(key: string, data: any, options: CacheOptions & { type: CacheItem['type'] }): Promise<void> {
    const now = Date.now();
    const ttl = options.ttl || 24 * 60 * 60 * 1000; // Default 24 hours
    
    const cacheItem: CacheItem = {
      key,
      data,
      timestamp: now,
      expiresAt: now + ttl,
      type: options.type,
      user_id: await this.getCurrentUserId()
    };

    // Try browser cache first
    const browserStored = await this.setBrowserCache(cacheItem);
    
    // Sync to cloud if requested and browser cache succeeded
    if (options.syncToCloud !== false && browserStored) {
      this.syncToCloud(cacheItem).catch(error => 
        console.warn('Cloud sync failed:', error)
      );
    }
  }

  /**
   * Get data from cache (browser first, then cloud)
   */
  private async get(key: string): Promise<any | null> {
    // Try browser cache first
    const browserData = await this.getBrowserCache(key);
    if (browserData) {
      return browserData;
    }

    // Fallback to cloud cache
    const cloudData = await this.getCloudCache(key);
    if (cloudData) {
      // Store in browser cache for next time
      this.setBrowserCache(cloudData).catch(error =>
        console.warn('Failed to store cloud data in browser:', error)
      );
      return cloudData.data;
    }

    return null;
  }

  /**
   * Store in browser IndexedDB
   */
  private async setBrowserCache(item: CacheItem): Promise<boolean> {
    if (!this.isInitialized || !this.db) {
      return false;
    }

    try {
      const transaction = this.db.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      await new Promise((resolve, reject) => {
        const request = store.put(item);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      });
      return true;
    } catch (error) {
      console.warn('Browser cache storage failed:', error);
      return false;
    }
  }

  /**
   * Get from browser IndexedDB
   */
  private async getBrowserCache(key: string): Promise<any | null> {
    if (!this.isInitialized || !this.db) {
      return null;
    }

    try {
      const transaction = this.db.transaction(['cache'], 'readonly');
      const store = transaction.objectStore('cache');
      
      const item = await new Promise<CacheItem | undefined>((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      if (!item) {
        return null;
      }

      // Check if expired
      if (Date.now() > item.expiresAt) {
        this.deleteBrowserCache(key);
        return null;
      }

      return item.data;
    } catch (error) {
      console.warn('Browser cache retrieval failed:', error);
      return null;
    }
  }

  /**
   * Sync cache item to Supabase
   */
  private async syncToCloud(item: CacheItem): Promise<void> {
    // TEMPORARY: Disable cloud sync due to Supabase us-east-1 outage
    // Remove this when Supabase fixes Edge Functions in us-east-1
    console.info('💾 Cloud cache disabled due to Supabase us-east-1 outage - using browser cache only');
    return;
    
    // Original cloud sync code (disabled)
    /*
    try {
      const { error } = await supabase
        .from('cache_entries')
        .upsert({
          key: item.key,
          data: item.data,
          timestamp: new Date(item.timestamp).toISOString(),
          expires_at: new Date(item.expiresAt).toISOString(),
          type: item.type,
          user_id: item.user_id
        });

      if (error) {
        // If table doesn't exist or cache key too long, log once and continue silently
        if (error.message && (
          error.message.includes('relation "cache_entries" does not exist') ||
          error.message.includes('404') ||
          error.message.includes('406') ||
          error.message.includes('Not Found') ||
          error.message.includes('Not Acceptable')
        )) {
          if (!this.hasLoggedTableMissing) {
            console.info('💾 Cache table not found or key too long - running in browser-only mode. This is fine for development.');
            this.hasLoggedTableMissing = true;
          }
          return;
        }
        throw error;
      }
    } catch (error) {
      // Handle network errors and other issues gracefully including 406 errors
      if (error instanceof Error && (
        error.message.includes('fetch') ||
        error.message.includes('404') ||
        error.message.includes('406') ||
        error.message.includes('Network') ||
        error.message.includes('Not Acceptable') ||
        error.message.includes('Failed to fetch')
      )) {
        if (!this.hasLoggedTableMissing) {
          console.info('💾 Cloud cache not available - using browser cache only.');
          this.hasLoggedTableMissing = true;
        }
        return;
      }
      console.warn('Cloud cache sync failed:', error);
    }
    */
  }

  /**
   * Get cache item from Supabase
   */
  private async getCloudCache(key: string): Promise<CacheItem | null> {
    // TEMPORARY: Disable cloud cache due to Supabase us-east-1 outage
    // Remove this when Supabase fixes Edge Functions in us-east-1
    return null;
    
    // Original cloud cache code (disabled)
    /*
    try {
      const { data, error } = await supabase
        .from('cache_entries')
        .select('*')
        .eq('key', key)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error) {
        // If table doesn't exist or any other common errors, fail silently
        if (error.message && (
          error.message.includes('relation "cache_entries" does not exist') ||
          error.message.includes('404') ||
          error.message.includes('406') ||
          error.message.includes('Not Found') ||
          error.message.includes('Not Acceptable') ||
          error.message.includes('No rows found')
        ) || error.code === 'PGRST116') {
          return null;
        }
        
        // Log unexpected errors for debugging
        console.warn('Cache service error:', error);
        return null;
      }

      if (!data) {
        return null;
      }

      return {
        key: data.key,
        data: data.data,
        timestamp: new Date(data.timestamp).getTime(),
        expiresAt: new Date(data.expires_at).getTime(),
        type: data.type,
        user_id: data.user_id
      };
    } catch (error) {
      // Handle fetch errors gracefully including 406 errors
      if (error instanceof Error && (
        error.message.includes('fetch') ||
        error.message.includes('404') ||
        error.message.includes('406') ||
        error.message.includes('Network') ||
        error.message.includes('Not Acceptable') ||
        error.message.includes('Failed to fetch')
      )) {
        return null; // Fail silently for network issues
      }
      console.warn('Cloud cache retrieval failed:', error);
      return null;
    }
    */
  }

  /**
   * Delete from browser cache
   */
  private async deleteBrowserCache(key: string): Promise<void> {
    if (!this.isInitialized || !this.db) {
      return;
    }

    try {
      const transaction = this.db.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      store.delete(key);
    } catch (error) {
      console.warn('Browser cache deletion failed:', error);
    }
  }

  /**
   * Clean expired entries from browser cache
   */
  private async cleanExpiredEntries(): Promise<void> {
    if (!this.isInitialized || !this.db) {
      return;
    }

    try {
      const transaction = this.db.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      const index = store.index('expiresAt');
      const range = IDBKeyRange.upperBound(Date.now());
      
      const request = index.openCursor(range);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    } catch (error) {
      console.warn('Cache cleanup failed:', error);
    }
  }

  /**
   * Get current user ID for cache tagging
   */
  private async getCurrentUserId(): Promise<string | undefined> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    browserEntries: number;
    cloudEntries: number;
    totalSize: number;
    oldestEntry: number;
    newestEntry: number;
  }> {
    const stats = {
      browserEntries: 0,
      cloudEntries: 0,
      totalSize: 0,
      oldestEntry: Date.now(),
      newestEntry: 0
    };

    // Browser cache stats
    if (this.isInitialized && this.db) {
      try {
        const transaction = this.db.transaction(['cache'], 'readonly');
        const store = transaction.objectStore('cache');
        
        const countRequest = store.count();
        stats.browserEntries = await new Promise((resolve, reject) => {
          countRequest.onsuccess = () => resolve(countRequest.result);
          countRequest.onerror = () => reject(countRequest.error);
        });
      } catch (error) {
        console.warn('Failed to get browser cache stats:', error);
      }
    }

    // Cloud cache stats
    try {
      const userId = await this.getCurrentUserId();
      if (userId) {
        const { count } = await supabase
          .from('cache_entries')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);
        
        stats.cloudEntries = count || 0;
      }
    } catch (error) {
      console.warn('Failed to get cloud cache stats:', error);
    }

    return stats;
  }

  /**
   * Clear all cache (browser and cloud)
   */
  async clearCache(type?: CacheItem['type']): Promise<void> {
    // Clear browser cache
    if (this.isInitialized && this.db) {
      try {
        const transaction = this.db.transaction(['cache'], 'readwrite');
        const store = transaction.objectStore('cache');
        
        if (type) {
          const index = store.index('type');
          const range = IDBKeyRange.only(type);
          const request = index.openCursor(range);
          
          request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
            }
          };
        } else {
          store.clear();
        }
      } catch (error) {
        console.warn('Failed to clear browser cache:', error);
      }
    }

    // Clear cloud cache
    try {
      const userId = await this.getCurrentUserId();
      if (userId) {
        let query = supabase
          .from('cache_entries')
          .delete()
          .eq('user_id', userId);
        
        if (type) {
          query = query.eq('type', type);
        }
        
        await query;
      }
    } catch (error) {
      console.warn('Failed to clear cloud cache:', error);
    }
  }

  /**
   * Create fallback data for when APIs are unavailable
   */
  getFallbackData(type: string, params: any): any {
    switch (type) {
      case 'text_analysis':
        return this.getFallbackTextAnalysis(params.input);
      case 'image_analysis':
        return this.getFallbackImageAnalysis();
      case 'voice_synthesis':
        return null; // No fallback for voice synthesis
      default:
        return null;
    }
  }

  /**
   * Fallback text analysis using rule-based patterns
   */
  private getFallbackTextAnalysis(text: string): any {
    const lowercaseText = text.toLowerCase();
    
    // Extract rooms using patterns
    const rooms: string[] = [];
    const roomPatterns = {
      'living room': /living\s*(room|area)|lounge/gi,
      'bedroom': /bedroom|bed\s*room/gi,
      'kitchen': /kitchen/gi,
      'bathroom': /bathroom|bath/gi,
      'dining room': /dining/gi,
      'office': /office|study/gi
    };

    Object.entries(roomPatterns).forEach(([room, pattern]) => {
      if (pattern.test(text)) {
        rooms.push(room);
      }
    });

    // Extract style
    let style = 'modern';
    const stylePatterns = {
      'traditional': /traditional|classic/gi,
      'modern': /modern|contemporary/gi,
      'industrial': /industrial|loft/gi,
      'minimalist': /minimalist|simple/gi
    };

    Object.entries(stylePatterns).forEach(([styleType, pattern]) => {
      if (pattern.test(text)) {
        style = styleType;
      }
    });

    // Extract features
    const features: string[] = [];
    const featurePatterns = {
      'open_plan': /open\s*plan/gi,
      'large_windows': /large.*window/gi,
      'fireplace': /fireplace/gi,
      'balcony': /balcony|terrace/gi
    };

    Object.entries(featurePatterns).forEach(([feature, pattern]) => {
      if (pattern.test(text)) {
        features.push(feature);
      }
    });

    return {
      requirements: [text.slice(0, 100) + '...'],
      constraints: [],
      style,
      rooms: rooms.length > 0 ? rooms : ['living room', 'kitchen', 'bedroom'],
      features,
      confidence: 0.6,
      source: 'fallback_analysis'
    };
  }

  /**
   * Fallback image analysis
   */
  private getFallbackImageAnalysis(): any {
    return {
      style: 'modern',
      features: ['analyzed_from_image'],
      rooms: ['space'],
      layout: 'rectangular',
      confidence: 0.4,
      source: 'fallback_analysis'
    };
  }
}

// Export singleton instance
export const cacheService = new CacheService();
export type { CacheItem, CacheOptions }; 