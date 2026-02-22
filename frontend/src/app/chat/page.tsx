import { MessageSquare } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';

export default function ChatPage() {
  return (
    <ComingSoon
      title="AI Advisor"
      description="Chat with GLM-5 powered strategy advisor for position analysis and recommendations"
      icon={MessageSquare}
      phase={4}
      features={[
        'Strategy Q&A',
        'Position Analysis',
        'Risk Assessment',
        'Trade Suggestions',
        'Market Context',
      ]}
    />
  );
}
