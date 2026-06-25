import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { ticker } = body;

    if (!ticker) {
      return NextResponse.json(
        { error: "Ticker is required" },
        { status: 400 }
      );
    }

    // Forward the request to the new independent Python Buy Signal service
    const response = await fetch("http://127.0.0.1:8001/predict-buy-signal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticker }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Buy signal service error:", error);
    return NextResponse.json(
      { error: "Buy signal service failed or is unreachable" },
      { status: 500 }
    );
  }
}
