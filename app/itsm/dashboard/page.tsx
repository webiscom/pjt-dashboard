import type { Metadata } from 'next';
import WBSDashboard from './WBSDashboard';

export const metadata: Metadata = {
  title: 'WBS',
  description: 'WBS 대시보드',
};

export default function DashboardPage() {
  return <WBSDashboard />;
}
