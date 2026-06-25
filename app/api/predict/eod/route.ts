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

    // Forward the request to the Python ML microservice
    const response = await fetch("http://127.0.0.1:8001/predict/eod", {
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
    console.error("Prediction service error:", error);
    return NextResponse.json(
      { error: "Prediction service failed or is unreachable" },
      { status: 500 }
    );
  }
}
