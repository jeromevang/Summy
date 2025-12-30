export const useSandboxOps = (setters: any) => {
  const enterSandbox = async () => {
    try {
      const res = await fetch('/api/tooly/sandbox/enter', { method: 'POST' });
      if (res.ok) setters.setSandboxActive(true);
    } catch (error) { console.error('Failed to enter sandbox:', error); }
  };

  const exitSandbox = async () => {
    try {
      const res = await fetch('/api/tooly/sandbox/exit', { method: 'POST' });
      if (res.ok) setters.setSandboxActive(false);
    } catch (error) { console.error('Failed to exit sandbox:', error); }
  };

  const fetchSandboxStatus = async () => {
    try {
      const res = await fetch('/api/tooly/sandbox/status');
      if (res.ok) setters.setSandboxActive((await res.json()).active);
    } catch (error) { console.error('Failed to fetch status:', error); }
  };

  return { enterSandbox, exitSandbox, fetchSandboxStatus };
};
