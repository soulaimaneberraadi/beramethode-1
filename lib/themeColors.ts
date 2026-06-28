export const chartColors = (dark: boolean) => ({
  grid: dark ? '#2E463C' : '#f1f5f9',
  axis: dark ? '#9DB5AB' : '#94a3b8',
  tooltipBg: dark ? '#1D2E28' : '#ffffff',
  tooltipText: dark ? '#EAF1ED' : '#0f172a',
  tooltipBorder: dark ? '#2E463C' : '#e2e8f0',
  surface: dark ? '#1D2E28' : '#ffffff',
  accent: dark ? '#2F9E64' : '#3B6BE8',
  surfaceGrad: dark
    ? 'linear-gradient(135deg,#1D2E28 0%,#14211C 60%,#14211C 100%)'
    : 'linear-gradient(135deg,#FFFFFF 0%,#F8FAFC 60%,#ECFDF5 100%)',
});
