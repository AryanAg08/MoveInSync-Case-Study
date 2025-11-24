import React, { useEffect, useState } from 'react';
import { api } from '../api/axios';
import { useAuth } from '../auth/AuthProvider';

export default function ProtectedData() {
  const [data, setData] = useState<any>(null);
  const { logout } = useAuth();

  useEffect(() => {
    let mounted = true;
    api.get('/alerts/dashboard/counts')
      .then(res => { if (mounted) setData(res.data); })
      .catch(err => {
        if (err?.response?.status === 401) {
          // tokenService.logout() triggers redirect if app does it
        }
      });
    return () => { mounted = false; };
  }, [logout]);

  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
