import { initializeDatabase } from '@/lib/actions/maintenance-actions';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const result = await initializeDatabase();
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('API init-db error:', error);
    return NextResponse.json(
      {
        success: false,
        message: `Database initialization failed: ${error.message}`,
      },
      { status: 500 }
    );
  }
}
