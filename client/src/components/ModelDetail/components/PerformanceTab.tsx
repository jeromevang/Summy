import React from 'react';
import { ModelProfile } from '../types';
import { styles } from '../utils/styles';
import { LatencyChart, SpeedBadge } from '../../LatencyChart';
import type { LatencyDataPoint } from '../../LatencyChart';

interface PerformanceTabProps {
  profile: ModelProfile;
  latencyData: LatencyDataPoint[];
}

export const PerformanceTab: React.FC<PerformanceTabProps> = ({ profile, latencyData }) => {
  const latency = profile.contextLatency;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span style={styles.cardIcon}>⚡</span>
          Speed Rating
        </div>
        <div style={styles.speedSection}>
          {latency?.speedRating && <SpeedBadge rating={latency.speedRating} />}
          <div style={styles.speedStats}>
            {latency?.maxUsableContext && (
              <div style={styles.speedStat}>
                <span style={styles.speedLabel}>Max Usable Context</span>
                <span style={styles.speedValue}>{(latency.maxUsableContext / 1000).toFixed(0)}k</span>
              </div>
            )}
            <div style={styles.speedStat}>
              <span style={styles.speedLabel}>Interactive</span>
              <span style={{ ...styles.speedValue, color: latency?.isInteractiveSpeed ? '#10B981' : '#F43F5E' }}>
                {latency?.isInteractiveSpeed ? 'Yes ✓' : 'No ✗'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {latencyData.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardIcon}>📈</span>
            Latency by Context Size
          </div>
          <LatencyChart data={latencyData} />
        </div>
      )}

      {latency?.latencies && Object.keys(latency.latencies).length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardIcon}>⏱️</span>
            Detailed Latencies
          </div>
          <div style={styles.latencyGrid}>
            {Object.entries(latency.latencies)
              .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
              .map(([ctx, lat]) => (
                <div key={ctx} style={styles.latencyItem}>
                  <span style={styles.latencyContext}>{ctx}</span>
                  <span style={{ ...styles.latencyValue, color: lat < 2000 ? '#10B981' : lat < 5000 ? '#F59E0B' : '#F43F5E' }}>
                    {(lat / 1000).toFixed(2)}s
                  </span>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
};
