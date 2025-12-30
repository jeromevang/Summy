import React from 'react';
import { ModelProfile } from '../types';
import { styles } from '../utils/styles';

interface OverviewTabProps {
  profile: ModelProfile;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ profile }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {profile.modelInfo && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardIcon}>ℹ️</span>
            Model Information
          </div>
          <div style={styles.infoGrid}>
            {profile.modelInfo.author && (
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Author</span>
                <span style={styles.infoValue}>{profile.modelInfo.author}</span>
              </div>
            )}
            {profile.modelInfo.architecture && (
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Architecture</span>
                <span style={styles.infoValue}>{profile.modelInfo.architecture}</span>
              </div>
            )}
            {profile.modelInfo.parameters && (
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Parameters</span>
                <span style={styles.infoValue}>{profile.modelInfo.parameters}</span>
              </div>
            )}
            {profile.modelInfo.contextLength && (
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Context</span>
                <span style={styles.infoValue}>{(profile.modelInfo.contextLength / 1000).toFixed(0)}k tokens</span>
              </div>
            )}
          </div>
          {profile.modelInfo.description && (
            <p style={styles.description}>{profile.modelInfo.description}</p>
          )}
        </div>
      )}

      {(() => {
        const earnedBadges = (profile.badges || []).filter((b: any) => b.earned !== false);
        return earnedBadges.length > 0 ? (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.cardIcon}>🏆</span>
              Earned Badges ({earnedBadges.length})
            </div>
            <div style={styles.badgesGrid}>
              {earnedBadges.map((badge: any) => (
                <div key={badge.id} style={styles.badge}>
                  <span style={styles.badgeIcon}>{badge.icon}</span>
                  <span style={styles.badgeName}>{badge.name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.cardIcon}>🏆</span>
              Badges
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              No badges earned yet. Run full probes to unlock badges.
            </div>
          </div>
        );
      })()}

      {profile.recommendations && profile.recommendations.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardIcon}>✅</span>
            Recommended For
          </div>
          <div style={styles.recList}>
            {profile.recommendations.slice(0, 5).map((rec, i) => (
              <div key={i} style={styles.recItem}>
                <span style={{
                  ...styles.recDot,
                  backgroundColor: rec.suitability === 'excellent' ? '#10B981' :
                                   rec.suitability === 'good' ? '#0EA5E9' :
                                   rec.suitability === 'fair' ? '#F59E0B' : '#F43F5E',
                }} />
                <span style={styles.recText}>{rec.task}</span>
                <span style={styles.recBadge}>{rec.suitability}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
