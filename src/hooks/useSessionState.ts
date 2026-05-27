import { useState, useEffect } from 'react';

// In-memory store that resets on page reload but persists across navigation
const globalState: Record<string, any> = {};
const listeners: Record<string, Set<(value: any) => void>> = {};

export function useSessionState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  // Initialize global state for this key if not present
  if (!(key in globalState)) {
    globalState[key] = initialValue;
  }

  const [state, setState] = useState<T>(globalState[key]);

  useEffect(() => {
    if (!listeners[key]) {
      listeners[key] = new Set();
    }
    listeners[key].add(setState);

    return () => {
      listeners[key].delete(setState);
    };
  }, [key]);

  const setValue: React.Dispatch<React.SetStateAction<T>> = (value) => {
    const valueToStore = value instanceof Function ? (value as (val: T) => T)(globalState[key]) : value;
    globalState[key] = valueToStore;
    
    // Notify all listeners
    if (listeners[key]) {
      listeners[key].forEach(listener => listener(valueToStore));
    }
  };

  return [state, setValue];
}
