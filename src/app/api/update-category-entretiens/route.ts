import { NextRequest, NextResponse } from 'next/server';
import { updateCategoryEntretiens } from '@/lib/data';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, entretien, isActive } = body;

    if (!category || !entretien) {
      return NextResponse.json(
        { success: false, message: 'Catégorie et entretien requis' },
        { status: 400 }
      );
    }

    const result = await updateCategoryEntretiens(category, entretien, isActive);

    return NextResponse.json({
      success: true,
      message: 'Entretien catégorie mis à jour avec succès',
      result,
    });
  } catch (error: any) {
    console.error('Category entretiens update error:', error);
    return NextResponse.json(
      { success: false, message: `Erreur: ${error.message}` },
      { status: 500 }
    );
  }
}
