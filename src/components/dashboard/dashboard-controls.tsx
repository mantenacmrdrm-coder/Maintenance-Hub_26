'use client';

import { useRouter } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

export function YearSelector({ currentYear }: { currentYear: string }) {
  const router = useRouter();

  const handleYearChange = (newYear: string) => {
    router.push(`/?year=${newYear}`);
  };

  return (
    <Select value={currentYear} onValueChange={handleYearChange}>
      <SelectTrigger className="w-[120px]">
        <SelectValue placeholder="Année" />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 3 + i).map(y => (
          <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PrintButton() {
    const handlePrint = () => {
        window.print();
    };

    return (
        <Button onClick={handlePrint} variant="outline">
            <Printer className="mr-2 h-4 w-4" />
            Imprimer
        </Button>
    );
}
