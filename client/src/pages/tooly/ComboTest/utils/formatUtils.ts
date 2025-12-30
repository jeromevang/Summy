export const formatSize = (bytes?: number): string => {
  if (!bytes) return '?';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `\${gb.toFixed(1)}GB`;
  const mb = bytes / (1024 * 1024);
  return `\${mb.toFixed(0)}MB`;
};

export const getModelName = (modelId: string | undefined | null, models: any[]) => {
  if (!modelId) return 'Unknown';
  const model = models.find(m => m.id === modelId);
  return model?.displayName || modelId.split('/').pop() || modelId;
};
