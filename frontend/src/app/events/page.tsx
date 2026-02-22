import { Calendar } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';

export default function EventsPage() {
  return (
    <ComingSoon
      title="Market Events"
      description="Upcoming earnings, FOMC, CPI and other market-moving events"
      icon={Calendar}
      phase={5}
      features={[
        'Event Calendar',
        'Earnings Dates',
        'FOMC Meetings',
        'CPI / Economic Data',
        'IV Impact Alerts',
      ]}
    />
  );
}
