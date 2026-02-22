import { BookOpen } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';

export default function LearnPage() {
  return (
    <ComingSoon
      title="Knowledge Base"
      description="Option selling fundamentals, Greeks explained, and strategy guides"
      icon={BookOpen}
      phase={6}
      features={[
        'Greeks Guide',
        'Strategy Playbook',
        'Risk Management',
        'IV Concepts',
        'Real Examples',
      ]}
    />
  );
}
