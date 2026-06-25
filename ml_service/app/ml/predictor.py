import os
import numpy as np
import pandas as pd
import yfinance as yf
import joblib

from tensorflow.keras.models import load_model

MODEL_DIR = r"c:\Users\ragha\OneDrive\Desktop\DBMS\Stonks\models\price"

SUPPORTED_TICKERS = {
    "AAPL": {
        "model": "aapl_model.keras",
        "preprocess": "aapl_preprocess.joblib"
    },
    "TSLA": {
        "model": "tsla_model.keras",
        "preprocess": "tsla_preprocess.joblib"
    }
}

loaded_models = {}

def add_features(df):
    df = df.copy()

    df["return_1"] = df["Close"].pct_change()
    df["return_3"] = df["Close"].pct_change(3)
    
    df["range"] = (df["High"] - df["Low"]) / df["Close"]
    df["open_close"] = (df["Close"] - df["Open"]) / df["Open"]
    
    df["volume_change"] = df["Volume"].pct_change()

    df["hour"] = df.index.hour
    df["minute"] = df.index.minute

    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.dropna()

    return df

def load_stock_model(ticker):
    ticker = ticker.upper()

    if ticker in loaded_models:
        return loaded_models[ticker]

    if ticker not in SUPPORTED_TICKERS:
        raise ValueError(f"Ticker {ticker} is not supported")

    files = SUPPORTED_TICKERS[ticker]

    model_path = os.path.join(MODEL_DIR, files["model"])
    preprocess_path = os.path.join(MODEL_DIR, files["preprocess"])

    if not os.path.exists(model_path) or not os.path.exists(preprocess_path):
        raise ValueError(f"Model files for {ticker} are missing from the server")

    model = load_model(model_path)
    preprocess = joblib.load(preprocess_path)

    loaded_models[ticker] = {
        "model": model,
        "preprocess": preprocess
    }

    return loaded_models[ticker]

def predict_eod_price(ticker):
    ticker = ticker.upper()

    bundle = load_stock_model(ticker)

    model = bundle["model"]
    preprocess = bundle["preprocess"]

    scaler = preprocess["scaler"]
    feature_cols = preprocess["feature_cols"]
    lookback = preprocess["lookback"]
    interval = preprocess["interval"]

    df = yf.download(
        ticker,
        period="5d",
        interval=interval,
        auto_adjust=True,
        progress=False
    )

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    if df.empty:
        raise ValueError("No stock data found for the requested ticker")

    df = df.dropna()
    df = add_features(df)

    if len(df) < lookback:
        raise ValueError("Not enough recent data to make prediction")

    latest_seq = df[feature_cols].iloc[-lookback:].values
    current_price = float(df["Close"].iloc[-1])

    n_features = latest_seq.shape[1]

    latest_seq_scaled = scaler.transform(latest_seq)
    latest_seq_scaled = latest_seq_scaled.reshape(1, lookback, n_features)

    predicted_return = float(model.predict(latest_seq_scaled, verbose=0)[0][0])
    predicted_close = current_price * (1 + predicted_return)

    return {
        "ticker": ticker,
        "current_price": round(current_price, 2),
        "predicted_close": round(predicted_close, 2),
        "predicted_return": predicted_return
    }
