'use client';

import React from 'react';
import type { DeclarationPanne } from '@/lib/types';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import Link from 'next/link';
import { parse, differenceInDays } from 'date-fns';

export function DeclarationView({ declaration }: { declaration: DeclarationPanne }) {
    const handlePrint = () => window.print();

    const montantTotalPieces = declaration.pieces.reduce((sum, piece) => sum + (piece.montant || 0) * (piece.quantite || 0), 0);
    const montantGlobal = montantTotalPieces + (declaration.montant_main_oeuvre || 0);

    const totalPieceRows = 10;
    const emptyPieceRows = Math.max(0, totalPieceRows - declaration.pieces.length);
    const pieceSectionRowSpan = totalPieceRows + 2;

    const calculateDuration = () => {
        const { date_entree, date_sortie } = declaration.operation;
        if (date_sortie === 'En Cours' || !date_entree || !date_sortie) {
            return 'En cours';
        }
        try {
            const start = parse(date_entree, 'dd/MM/yyyy', new Date());
            const end = parse(date_sortie, 'dd/MM/yyyy', new Date());
            if (isNaN(start.getTime()) || isNaN(end.getTime())) return 'N/A';
            
            const diff = differenceInDays(end, start);
            return `${diff} jour(s)`;
        } catch(e) {
            return 'N/A';
        }
    };

    return (
        <div className='space-y-4'>
            <div className="flex justify-between items-center print:hidden">
                 <Button asChild variant="outline"><Link href="/declarations">Retour à la liste</Link></Button>
                 <Button onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Imprimer</Button>
            </div>
            <div id="print-section" className="bg-white p-4 sm:p-8 rounded-lg shadow-lg text-black w-full max-w-4xl mx-auto font-serif">
                <header className="grid grid-cols-3 items-center text-center mb-6">
                    <div className="text-left text-[8px] leading-tight">
                        <p className="font-bold">ENTREPRISE PUBLIQUE DE REALISATION</p>
                        <p className="font-bold">DE FORAGE HYDRAULIQUE ET TRAVAUX</p>
                        <p className="font-bold">ELECTRO-MECANIQUE</p>
                        <p>FOREMHYD-SPA</p>
                    </div>
                    <div className="flex flex-col items-center">
                        <p className="font-bold text-[9px]">Groupe Etudes & Réalisations Hydrauliques</p>
                        <p className='text-[9px]'>مجمع الدراسات و انجازات الري</p>
                        <Image src="https://i.imgur.com/QeJyDH2.jpeg" alt="Logo GERHYD" width={80} height={48} className="my-1" data-ai-hint="company logo"/>
                        <p className="font-bold text-base">GERHYD-Spa</p>
                    </div>
                    <div className="text-right text-[8px] leading-tight">
                        <p>المؤسسة العمومية لإنجاز آبار المياه</p>
                        <p>والأشغال الكهروميكانيكية</p>
                        <p>فورميد</p>
                    </div>
                </header>

                <div className='text-center my-4 space-y-1'>
                    <p className='text-sm'>UNITE KECHROUD KHENCHELA</p>
                    <p className='font-bold text-sm'>DIRECTION DES RESSOURCES MATERIELLES</p>
                    <h1 className='font-bold text-lg underline decoration-double'>DECLARATION DE PANNE</h1>
                </div>

                <table className="w-full border-collapse border border-black text-xs">
                    <tbody>
                        <tr className='divide-x divide-black'>
                            <td className="p-1 border-b border-r border-black align-top">Date de panne:</td>
                            <td className="p-1 border-b border-r border-black align-top">Type de matériel:</td>
                            <td className="p-1 border-b border-r border-black align-top">Immatriculation:</td>
                            <td className="p-1 border-b border-r border-black align-top">Affectation:</td>
                            <td className="p-1 border-b border-black align-top">Chauffeur/Conducteur:</td>
                        </tr>
                        <tr className='divide-x divide-black'>
                            <td className="p-1 border-b border-r border-black align-top h-8">{declaration.operation.date_entree}</td>
                            <td className="p-1 border-b border-r border-black align-top h-8">{declaration.equipment.marque} {declaration.equipment.designation}</td>
                            <td className="p-1 border-b border-r border-black align-top h-8">{declaration.operation.matricule}</td>
                            <td className="p-1 border-b border-r border-black align-top h-8">{declaration.operation.affectation}</td>
                            <td className="p-1 border-b border-black align-top h-8">{declaration.chauffeur_conducteur}</td>
                        </tr>
                        <tr className='divide-x divide-black'>
                            <td className="p-1 border-r border-black align-top">Déclaration de L'utilisateur:</td>
                            <td colSpan={4} className="p-1 min-h-[3rem] align-top">{declaration.operation.panne_declaree}</td>
                        </tr>
                        <tr className='divide-x divide-black'>
                            <td className="p-1 border-y border-r border-black align-top">Diagnostique de L'intervenant:</td>
                            <td colSpan={4} className="p-1 border-y border-black min-h-[3rem] align-top">{declaration.diagnostique_intervenant}</td>
                        </tr>
                         <tr className='divide-x divide-black'>
                            <td className="p-1 border-b-2 border-r border-black align-top">Causes:</td>
                            <td colSpan={4} className="p-1 border-b-2 border-black min-h-[3rem] align-top">{declaration.causes}</td>
                        </tr>

                        <tr className="divide-x divide-black bg-gray-200">
                            <td rowSpan={pieceSectionRowSpan} className="p-1 font-bold align-middle text-center border-r border-black">
                                Pièces Endommagées à changer
                            </td>
                            <td className="p-1 font-bold text-center border-b border-black">Désignation</td>
                            <td className="p-1 font-bold text-center border-b border-black">Référence</td>
                            <td className="p-1 font-bold text-center border-b border-black">Quantité</td>
                            <td className="p-1 font-bold text-center border-b border-black">Montant</td>
                        </tr>
                        
                        {declaration.pieces.map((piece, index) => (
                            <tr key={index} className="divide-x divide-black">
                                <td className="p-1">{piece.designation}</td>
                                <td className="p-1 text-center">{piece.reference}</td>
                                <td className="p-1 text-center">{piece.quantite}</td>
                                <td className="p-1 text-right">{piece.montant?.toLocaleString('fr-FR', {minimumFractionDigits: 2})}</td>
                            </tr>
                        ))}
                        {emptyPieceRows > 0 && Array.from({ length: emptyPieceRows }).map((_, index) => (
                            <tr key={`empty-${index}`} className="divide-x divide-black h-6">
                                <td className="p-1">&nbsp;</td>
                                <td className="p-1">&nbsp;</td>
                                <td className="p-1">&nbsp;</td>
                                <td className="p-1">&nbsp;</td>
                            </tr>
                        ))}
                        
                        <tr className="divide-x divide-black bg-gray-200 font-bold">
                            <td colSpan={3} className="p-1 border-t-2 border-black text-right">Montant total des pièces à changer (1)</td>
                            <td className="p-1 border-t-2 border-black text-right">{montantTotalPieces.toLocaleString('fr-FR', {minimumFractionDigits: 2})}</td>
                        </tr>

                    </tbody>
                </table>
                
                 <table className="w-full border-collapse border border-black text-xs mt-2">
                    <tbody>
                        <tr className='divide-x divide-black border-b border-black'>
                            <td className='p-1'>Intervenants</td>
                            <td colSpan={3} className='p-1'>
                                {declaration.intervenants.map(i => `${i.type} - ${i.description}`).join(', ')}
                            </td>
                        </tr>
                        <tr className='divide-x divide-black border-b border-black'>
                            <td className='p-1'>Date d'entrée</td>
                            <td className='p-1'>{declaration.operation.date_entree}</td>
                            <td className='p-1'>Date de sortie</td>
                            <td className='p-1'>{declaration.operation.date_sortie === 'En Cours' ? '' : declaration.operation.date_sortie}</td>
                        </tr>
                        <tr className="border-b border-black">
                        <td className="border-r border-black p-1 align-top" colSpan={2}>
                          Obs/Réserves: {declaration.obs_reserves}
                        </td>
                        <td className="border-r border-black p-1 align-top">
                          Montant de la main d'œuvre (2):&nbsp;
                          {declaration.montant_main_oeuvre > 0
                            ? declaration.montant_main_oeuvre.toLocaleString('fr-FR', { minimumFractionDigits: 2 })
                            : ""}
                        </td>
                        <td className="p-1 align-top">
                          Montant Global (1) + (2):&nbsp;
                          {montantGlobal > 0
                            ? montantGlobal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })
                            : ""}
                        </td>
                      </tr>


                      <tr>
                        <td className="border-r border-black p-1 align-top" colSpan={2}>
                           Durée de l'intervention:&nbsp;{calculateDuration()}
                        </td>
                        <td colSpan={2} className="p-1 align-top">&nbsp;</td>
                      </tr>



                    </tbody>
                 </table>

                 <div className="grid grid-cols-3 gap-4 mt-8 text-center text-xs">
                     <div className='pt-12 border-t border-black'><strong>Visa du déclarant</strong></div>
                     <div className='pt-12 border-t border-black'><strong>Visa du responsable de la maintenance</strong></div>
                     <div className='pt-12 border-t border-black'><strong>Visa DRM</strong></div>
                 </div>

            </div>
            <style jsx global>{`
                @media print {
                    body * { visibility: hidden; }
                    .print\\:hidden { display: none; }
                    #print-section, #print-section * { visibility: visible; }
                    #print-section { 
                        position: absolute; 
                        left: 0; 
                        top: 0; 
                        width: 100%;
                        margin: 0;
                        padding: 0;
                        border: none;
                        box-shadow: none;
                    }
                    @page { size: A4; margin: 20mm; }
                }
            `}</style>
        </div>
    );
}
