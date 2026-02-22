import { FileBarChart } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';

export default function ReviewPage() {
  return (
    <ComingSoon
      title="Post-Mortem Review"
      description="Trade journal, anomaly detection, and AI-powered attribution analysis"
      icon={FileBarChart}
      phase={5}
      features={[
        'Trade Journal',
        'Anomaly Detection',
        'AI Attribution',
        'Win/Loss Analysis',
        'Strategy Review',
      ]}
    />
  );
}
