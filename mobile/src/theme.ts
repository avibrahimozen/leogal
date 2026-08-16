/** Ulak marka renkleri: gece lacivert zemin üzerine taksi sarısı vurgu. */
export const colors = {
  primary: '#FFC400',
  primaryDark: '#E6B000',
  ink: '#0F172A',
  inkSoft: '#334155',
  muted: '#64748B',
  line: '#E2E8F0',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  success: '#16A34A',
  danger: '#DC2626',
  info: '#2563EB',
} as const;

export const spacing = (n: number) => n * 4;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  full: 999,
} as const;

export const shadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;
