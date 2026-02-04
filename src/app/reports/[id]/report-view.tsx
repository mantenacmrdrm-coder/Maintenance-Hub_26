'use client';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { WeeklyReport } from '@/lib/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Printer } from 'lucide-react';
import React from 'react';
import Image from 'next/image';

export function ReportView({ report }: { report: WeeklyReport }) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-section,
          #print-section * {
            visibility: visible;
          }
          #print-section {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          @page {
            size: A4 landscape;
            margin: 20mm;
          }
        }
      `}</style>

      <div className="flex justify-end mb-4 print:hidden">
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Imprimer
        </Button>
      </div>

      <div id="print-section" className="bg-white p-8 rounded-lg shadow-lg text-black w-full">
        {/* Header */}
        <header className="grid grid-cols-3 items-center text-center mb-6">
          <div className="text-left">
            <p className="font-bold">ENTREPRISE PUBLIQUE DE REALISATION</p>
            <p className="font-bold">DE FORAGE HYDRAULIQUE ET TRAVAUX</p>
            <p className="font-bold">ELECTRO-MECANIQUE</p>
            <p>FOREMHYD-SPA</p>
          </div>
          <div className="flex flex-col items-center">
            <p className="font-bold">Groupe Etudes & Réalisations Hydrauliques</p>
            <p>مجمع الدراسات و انجازات الري</p>
            <Image
              src="https://i.imgur.com/QeJyDH2.jpeg"
              alt="Logo GERHYD"
              width={100}
              height={60}
              className="my-2"
              data-ai-hint="company logo"
            />
            <p className="font-bold text-lg">GERHYD-Spa</p>
          </div>
          <div className="text-right">
            <p>المؤسسة العمومية لإنجاز آبار المياه</p>
            <p>والأشغال الكهروميكانيكية</p>
            <p>فورميد</p>
          </div>
        </header>

        <Separator className="my-4 bg-black" />

        <div className="left-align my-4">
          <p className="font-bold">DIRECTION DES RESSOURCES MATERIELLES</p>
          <p className="font-bold">DEPARTEMENT MATERIEL</p>
        </div>

        {/* Title */}
        <div className="text-center my-6">
          <h1 className="text-xl font-bold underline">
            ETAT HEBDOMADAIRE DES PANNES (DU{' '}
            {format(new Date(report.start_date), 'dd/MM/yyyy', { locale: fr })} AU{' '}
            {format(new Date(report.end_date), 'dd/MM/yyyy', { locale: fr })})
          </h1>
        </div>

        {/* Table */}
        <div className="w-full overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-xs border border-black">
            <thead>
              <tr className="bg-gray-200">
                <th className="border-t border-b border-black p-1">N°</th>
                <th className="border-t border-b border-black p-1">DESIGNATION</th>
                <th className="border-t border-b border-black p-1 whitespace-nowrap min-w-max">Matricule</th>
                <th className="border-t border-b border-black p-1 whitespace-nowrap min-w-max">DATE DE PANNE</th>
                <th className="border-t border-b border-black p-1">NATURE DE PANNE</th>
                <th className="border-t border-b border-black p-1">REPARATIONS ET PIECES</th>
                <th className="border-t border-b border-black p-1 whitespace-nowrap min-w-max">DATE DE SORTIE</th>
                <th className="border-t border-b border-black p-1">INTERVENANT</th>
                <th className="border-t border-b border-black p-1">OBS</th>
              </tr>
            </thead>
            <tbody>
              {report.pannes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center p-4 border-t border-b border-black">
                    Aucune panne à afficher pour cette période.
                  </td>
                </tr>
              ) : (
                report.pannes.flatMap((panne, panneIndex) =>
                  (panne.reparations.length > 0 ? panne.reparations : ['']).map((reparation, pieceIndex) => {
                    const isFirst = pieceIndex === 0;

                    return (
                      <tr key={`${panne.numero}-${pieceIndex}`}>
                        {isFirst && (
                          <>
                            <td className="border-t border-b border-black p-1 text-center" rowSpan={panne.reparations.length || 1}>
                              {panneIndex + 1}
                            </td>
                            <td className="border-t border-b border-black p-1" rowSpan={panne.reparations.length || 1}>
                              {panne.designation}
                            </td>
                            <td className="border-t border-b border-black p-1 whitespace-nowrap min-w-max" rowSpan={panne.reparations.length || 1}>
                              {panne.matricule}
                            </td>
                            <td className="border-t border-b border-black p-1 text-center whitespace-nowrap min-w-max" rowSpan={panne.reparations.length || 1}>
                              {panne.date_panne}
                            </td>
                            <td className="border-t border-b border-black p-1" rowSpan={panne.reparations.length || 1}>
                              {panne.nature_panne}
                            </td>
                          </>
                        )}

                        <td className="p-1 border-b border-black">{reparation}</td>
                        
                        {isFirst && (
                             <>
                                <td className="border-t border-b border-black p-1 text-center whitespace-nowrap min-w-max" rowSpan={panne.reparations.length || 1}>
                                  {panne.date_sortie}
                                </td>
                                <td className="border-t border-b border-black p-1" rowSpan={panne.reparations.length || 1}>
                                  {panne.intervenant}
                                </td>
                                <td className="border-t border-b border-black p-1" rowSpan={panne.reparations.length || 1}>
                                  {panne.obs || ''}
                                </td>
                             </>
                        )}
                      </tr>
                    );
                  })
                )
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <footer className="mt-12 text-right">
          <p className="font-bold text-base">Le Chef de Département Matériel</p>
        </footer>
      </div>
    </>
  );
}
