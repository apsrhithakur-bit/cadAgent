import { useState, useCallback } from 'react';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'success';
  duration?: number;
}

let toastCount = 0;
const listeners = new Set<(toast: Toast) => void>();

function createToast(toast: Omit<Toast, 'id'>): Toast {
  const id = (++toastCount).toString();
  return {
    id,
    duration: 5000,
    ...toast,
  };
}

export function toast(toast: Omit<Toast, 'id'>) {
  const newToast = createToast(toast);
  
  // Notify all listeners
  listeners.forEach(listener => listener(newToast));
  
  // Auto-dismiss after duration
  if (newToast.duration && newToast.duration > 0) {
    setTimeout(() => {
      // In a real implementation, you'd remove the toast here
      console.log(`Toast ${newToast.id} auto-dismissed`);
    }, newToast.duration);
  }
  
  return newToast;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((newToast: Toast) => {
    setToasts(prev => [...prev, newToast]);
    
    // Auto-remove after duration
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== newToast.id));
      }, newToast.duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Subscribe to global toast events
  useState(() => {
    listeners.add(addToast);
    return () => {
      listeners.delete(addToast);
    };
  });

  return {
    toast: (toast: Omit<Toast, 'id'>) => {
      const newToast = createToast(toast);
      addToast(newToast);
      return newToast;
    },
    toasts,
    removeToast,
  };
}