from datetime import datetime
import os
from typing import Any, Dict

import joblib
import pandas as pd
import yfinance as yf
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


BASE_PATH = os.path.dirname(__file__)
MODEL_PATH = os.path.join(os.path.dirname(BASE_PATH), "stock_model.pkl")

if not os.path.exists(MODEL_PATH):
    raise RuntimeError(f"Model file not found: {MODEL_PATH}")

model = joblib.load(MODEL_PATH)

app = FastAPI(title="Stonks RF Predictor", version="1.0.0")


class PredictRequest(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=20)


def _latest_features(ticker: str) -> list[float]:
    """Return features in strict training order:
    [Close, Volume, Open, High, Low]
    """
    df = yf.download(ticker, period="10d", interval="1d", progress=False, auto_adjust=False)
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No market data available for {ticker}")

    row = df.iloc[-1]
    required_cols = ["Close", "Volume", "Open", "High", "Low"]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise HTTPException(status_code=500, detail=f"Missing required columns: {', '.join(missing)}")

    features = [
        float(row["Close"]),
        float(row["Volume"]),
        float(row["Open"]),
        float(row["High"]),
        float(row["Low"]),
    ]

    if any(pd.isna(v) for v in features):
        raise HTTPException(status_code=500, detail="Downloaded market row has null values")

    return features


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True, "model": "stock_model.pkl"}


@app.post("/predict")
def predict(req: PredictRequest) -> Dict[str, Any]:
    ticker = req.ticker.strip().upper()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker is required")

    features = _latest_features(ticker)
    x = [features]

    try:
        pred = int(model.predict(x)[0])
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Prediction error: {exc}")

    confidence = None
    try:
        if hasattr(model, "predict_proba"):
            probs = model.predict_proba(x)[0]
            # class 1 => UP => BUY confidence
            confidence = float(probs[1] if len(probs) > 1 else probs[0])
    except Exception:
        confidence = None

    label = "BUY" if pred == 1 else "SELL"

    return {
        "ticker": ticker,
        "prediction": pred,
        "label": label,
        "confidence": confidence,
        "timestamp": datetime.utcnow().isoformat(),
        "features": {
            "close": features[0],
            "volume": features[1],
            "open": features[2],
            "high": features[3],
            "low": features[4],
        },
    }
