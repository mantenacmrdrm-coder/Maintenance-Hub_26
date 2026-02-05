import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';

const ALLOWED_FILES = ['matrice.csv', 'Param.csv', 'vidange.csv', 'suivi_curatif.csv', 'consolide.csv'];
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'import');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, message: 'Aucun fichier fourni' },
        { status: 400 }
      );
    }

    // Validate filename
    if (!ALLOWED_FILES.includes(file.name)) {
      return NextResponse.json(
        {
          success: false,
          message: `Fichier non autorisé. Fichiers acceptés: ${ALLOWED_FILES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(UPLOAD_DIR, file.name);

    await writeFile(filePath, buffer);

    return NextResponse.json({
      success: true,
      message: `Fichier ${file.name} uploadé avec succès`,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { success: false, message: `Erreur lors de l'upload: ${error.message}` },
      { status: 500 }
    );
  }
}
