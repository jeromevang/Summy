import { useState, useEffect } from 'react';
import { HardwareProfile } from '../types';

export const useHardware = () => {
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [isLoadingHardware, setIsLoadingHardware] = useState(true);

  const detectHardware = async () => {
    setIsLoadingHardware(true);
    try {
      const response = await fetch('/api/tooly/optimal-setup/hardware');
      if (!response.ok) throw new Error('Failed to detect hardware');
      const data = await response.json();
      setHardware(data);
    } catch (err: any) {
      console.error('Hardware detection failed:', err);
    } finally {
      setIsLoadingHardware(false);
    }
  };

  useEffect(() => {
    detectHardware();
  }, []);

  return {
    hardware,
    isLoadingHardware,
    detectHardware
  };
};
