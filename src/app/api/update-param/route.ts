import { NextRequest, NextResponse } from 'next/server';
import { updateParam } from '@/lib/data';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, column, value } = body;

    if (id === undefined || !column) {
      return NextResponse.json(
        { success: false, message: 'ID et colonne requis' },
        { status: 400 }
      );
    }

    const result = await updateParam(id, column, value);

    return NextResponse.json({
      success: true,
      message: 'Paramètre mis à jour avec succès',
      result,
    });
  } catch (error: any) {
    console.error('Parameter update error:', error);
    return NextResponse.json(
      { success: false, message: `Erreur: ${error.message}` },
      { status: 500 }
    );
  }
}
