import os
import pandas as pd
import yfinance as yf
import joblib

BASE_DIR = os.path.dirname(__file__)
MODEL_DIR = os.path.join(BASE_DIR, "models")

loaded_buy_signal_model = None

def create_buy_signal_features(stock_df, ticker, ticker_map):
    stock_df = stock_df.copy()
    stock_df["Return_1d"] = stock_df["Close"].pct_change()
    stock_df["Return_5d"] = stock_df["Close"].pct_change(5)
    stock_df["MA_5"] = stock_df["Close"].rolling(5).mean()
    stock_df["MA_20"] = stock_df["Close"].rolling(20).mean()
    stock_df["Volatility_5"] = stock_df["Return_1d"].rolling(5).std()
    stock_df["Volatility_20"] = stock_df["Return_1d"].rolling(20).std()
    stock_df["Volume_Change"] = stock_df["Volume"].pct_change()
    stock_df["Ticker_Code"] = ticker_map.get(ticker, 0)
    return stock_df.dropna().iloc[-1:]

def load_buy_signal_model():
    global loaded_buy_signal_model
    if loaded_buy_signal_model is not None:
        return loaded_buy_signal_model
        
    model_path = os.path.join(MODEL_DIR, "aapl_tsla_buy_signal_random_forest.joblib")
    if not os.path.exists(model_path):
        raise ValueError(f"Buy signal model file missing: {model_path}")
        
    loaded_buy_signal_model = joblib.load(model_path)
    return loaded_buy_signal_model

def predict_buy_signal_stock(ticker):
    ticker = ticker.upper()
    if ticker not in ["AAPL", "TSLA"]:
        raise ValueError(f"Ticker {ticker} is not supported by the Buy Signal model.")
        
    bundle = load_buy_signal_model()
    model = bundle["model"]
    features_list = bundle["features"]
    ticker_map = bundle["ticker_map"]
    buy_threshold = bundle.get("buy_threshold", 0.02)
    
    # Download 2 months of daily data to ensure we have enough points for 20-day MA
    df = yf.download(
        ticker,
        period="2mo",
        interval="1d",
        auto_adjust=True,
        progress=False
    )
    
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
        
    if df.empty:
        raise ValueError("No live stock data found.")
        
    current_price = float(df["Close"].iloc[-1])
        
    features_df = create_buy_signal_features(df, ticker, ticker_map)
    if features_df.empty:
        raise ValueError("Not enough historical data to generate technical features.")
        
    # Pass as DataFrame to prevent warnings and preserve feature names
    X = features_df[features_list]
    
    predicted_price_5d = float(model.predict(X)[0])
    predicted_return = (predicted_price_5d - current_price) / current_price
    predicted_return_percent = predicted_return * 100
    
    if predicted_return >= buy_threshold:
        signal = "BUY"
    else:
        signal = "DO NOT BUY"
    
    return {
        "ticker": ticker,
        "current_price": round(current_price, 2),
        "predicted_price_5d": round(predicted_price_5d, 2),
        "predicted_return_percent": round(predicted_return_percent, 2),
        "signal": signal,
        "disclaimer": "This is an educational ML signal, not financial advice."
    }
