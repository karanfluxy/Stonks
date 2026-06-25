import { NextResponse } from 'next/server';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8001';

export async function POST(req) {
  try {
    const body = await req.json();
    const { holdings } = body;

    if (!Array.isArray(holdings) || holdings.length === 0) {
      return NextResponse.json(
        { error: 'Holdings must be a non-empty array' },
        { status: 400 }
      );
    }

    const response = await fetch(`${ML_SERVICE_URL}/predict-portfolio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ holdings }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.detail || `ML service error: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Portfolio Rater Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to rate portfolio' },
      { status: 500 }
    );
  }
}
