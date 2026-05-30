import type { Metadata } from 'next';
import WBSDashboard from './WBSDashboard';

export const metadata: Metadata = {
  title: 'ECS WBS · 공정 관리',
  description: 'ECS 공정 관리 WBS 대시보드',
};

export default function DashboardPage() {
  return <WBSDashboard />;
}
