import { notFound } from 'next/navigation';
import { getWeeklyReport } from '@/lib/actions/maintenance-actions';
import { ReportView } from './report-view';
import type { WeeklyReport } from '@/lib/types';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default async function ReportPage({ params }: { params: { id: string } }) {
  const reportId = parseInt(params.id, 10);
  if (isNaN(reportId)) {
    notFound();
  }

  const report = await getWeeklyReport(reportId);

  if (!report) {
    notFound();
  }

  return (
    <div className="space-y-4">
        <Button asChild variant="outline">
            <Link href="/reports">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour à la liste des rapports
            </Link>
        </Button>
      <ReportView report={report as WeeklyReport} />
    </div>
  );
}
