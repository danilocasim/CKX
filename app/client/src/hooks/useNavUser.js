import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export function useNavUser() {
  const { isAuthenticated, getUser } = useAuth();
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      setUser(null);
      return;
    }
    let cancelled = false;
    getUser().then((u) => {
      if (!cancelled) setUser(u);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getUser]);

  return user;
}
