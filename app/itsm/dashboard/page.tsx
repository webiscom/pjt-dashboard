import type { Metadata } from 'next';
import WBSDashboard from './WBSDashboard';

export const metadata: Metadata = {
  title: 'WBS',
  description: 'WBS 대시보드',
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string }>;
}) {
  const { proj } = await searchParams;
  return <WBSDashboard projNo={proj || '202501-007'} />;
}
