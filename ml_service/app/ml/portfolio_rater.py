import os
import joblib
import pandas as pd
import numpy as np
import yfinance as yf
from typing import List, Dict, Any

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "portfolio_rater_model.pkl")
FEATURES_PATH = os.path.join(os.path.dirname(__file__), "models", "model_features.pkl")

# Load models safely (they might not exist if running without them)
portfolio_model = None
model_features = None

try:
    if os.path.exists(MODEL_PATH) and os.path.exists(FEATURES_PATH):
        portfolio_model = joblib.load(MODEL_PATH)
        model_features = joblib.load(FEATURES_PATH)
except Exception as e:
    print(f"Warning: Could not load portfolio rater models: {e}")

def get_rating_label(score: float) -> str:
    if score >= 85: return "Excellent"
    if score >= 70: return "Good"
    if score >= 55: return "Moderate Risk"
    if score >= 40: return "Risky"
    return "Very Risky"

def generate_suggestions(features: dict, score: float) -> List[str]:
    suggestions = []
    
    if features.get("cash_percent", 0) > 0.40:
        suggestions.append("Your cash position is very high. Consider investing some of it to improve long-term returns.")
    elif features.get("cash_percent", 0) < 0.02:
        suggestions.append("You have very little cash reserves. Consider keeping 5-10% in cash for opportunities or emergencies.")
        
    if features.get("num_stocks", 0) < 5:
        suggestions.append("Your portfolio is concentrated in very few stocks. Adding more positions could improve diversification.")
        
    if features.get("largest_position", 0) > 0.30:
        suggestions.append("Your largest holding is quite high (>30%). Consider spreading exposure across more assets to reduce single-stock risk.")
        
    if features.get("top_3_concentration", 0) > 0.70:
        suggestions.append("Your top three holdings make up most of the portfolio (>70%), indicating high concentration risk.")
        
    if features.get("portfolio_volatility", 0) > 0.35:
        suggestions.append("The portfolio has high volatility. Consider adding less volatile assets to stabilize returns.")
        
    if features.get("max_drawdown", 0) < -0.30:
        suggestions.append("Historical analysis shows a high maximum drawdown. Ensure you are comfortable with potential large drops in value.")
        
    if len(suggestions) == 0:
        if score >= 85:
            suggestions.append("Your portfolio looks very well balanced. Keep up the good work!")
        else:
            suggestions.append("Consider reviewing individual stock fundamentals to improve overall performance.")
            
    return suggestions

def rate_portfolio(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not holdings:
        raise ValueError("Portfolio is empty.")
        
    # 1. Parse and validate inputs
    cash_weight = 0.0
    stock_weights = {}
    
    for h in holdings:
        ticker = str(h.get("ticker", "")).strip().upper()
        weight = float(h.get("weight", 0))
        
        if not ticker:
            continue
            
        if weight < 0:
            raise ValueError(f"Weight for {ticker} cannot be negative.")
            
        if ticker in ["CASH", "USD"]:
            cash_weight += weight
        else:
            stock_weights[ticker] = stock_weights.get(ticker, 0) + weight
            
    total_weight = cash_weight + sum(stock_weights.values())
    if total_weight <= 0:
        raise ValueError("Total portfolio weight must be greater than 0.")
        
    # Normalize weights to sum to 1.0
    cash_percent = cash_weight / total_weight
    for t in stock_weights:
        stock_weights[t] = stock_weights[t] / total_weight
        
    # 2. Extract stock tickers
    tickers = list(stock_weights.keys())
    num_stocks = len(tickers)
    
    if num_stocks == 0:
        raise ValueError("Portfolio must contain at least one non-cash stock.")
        
    # 3. Calculate naive concentration features
    weights_arr = sorted(stock_weights.values(), reverse=True)
    largest_position = weights_arr[0] if weights_arr else 0.0
    top_3_concentration = sum(weights_arr[:3]) if weights_arr else 0.0
    
    # 4. Fetch market data for historical returns & volatility
    # Use 1 year of data to calculate stats
    end_date = pd.Timestamp.now()
    start_date = end_date - pd.DateOffset(years=1)
    
    portfolio_return = 0.0
    portfolio_volatility = 0.0
    sharpe_ratio = 0.0
    max_drawdown = 0.0
    
    try:
        # Download historical data
        # threads=True to speed up
        data = yf.download(tickers, start=start_date.strftime("%Y-%m-%d"), end=end_date.strftime("%Y-%m-%d"), progress=False, threads=True)
        
        if not data.empty and 'Close' in data.columns:
            closes = data['Close']
            
            # Ensure it's a DataFrame even if 1 ticker
            if isinstance(closes, pd.Series):
                closes = closes.to_frame(name=tickers[0])
                
            # Drop mostly empty columns
            closes = closes.dropna(axis=1, thresh=len(closes)//2)
            valid_tickers = [t for t in tickers if t in closes.columns]
            
            if valid_tickers:
                # Re-normalize weights for valid tickers (excluding cash part from returns)
                total_valid_weight = sum(stock_weights[t] for t in valid_tickers)
                
                if total_valid_weight > 0:
                    # Calculate daily returns
                    daily_returns = closes.pct_change().dropna()
                    
                    # Portfolio daily returns (weighted average)
                    # Note: stock_weights are relative to entire portfolio, so sum(stock_weights) = 1 - cash_percent
                    port_daily_returns = pd.Series(0.0, index=daily_returns.index)
                    for t in valid_tickers:
                        port_daily_returns += daily_returns[t] * stock_weights[t]
                        
                    # Calculate features
                    # Annualized return (approx 252 trading days)
                    avg_daily_return = port_daily_returns.mean()
                    portfolio_return = (1 + avg_daily_return) ** 252 - 1
                    
                    # Annualized volatility
                    daily_vol = port_daily_returns.std()
                    portfolio_volatility = daily_vol * np.sqrt(252)
                    
                    # Sharpe Ratio (assuming 2% risk free rate)
                    risk_free_rate = 0.02
                    if portfolio_volatility > 0:
                        sharpe_ratio = (portfolio_return - risk_free_rate) / portfolio_volatility
                        
                    # Max Drawdown
                    cum_returns = (1 + port_daily_returns).cumprod()
                    running_max = cum_returns.cummax()
                    drawdowns = (cum_returns - running_max) / running_max
                    max_drawdown = drawdowns.min()
                    
    except Exception as e:
        print(f"Warning: Failed to fetch yfinance data or calculate metrics: {e}")
        # Default to some reasonable fallback metrics if yfinance fails
        portfolio_return = 0.08
        portfolio_volatility = 0.20
        sharpe_ratio = 0.30
        max_drawdown = -0.15

    # 5. Build features dict
    features = {
        "num_stocks": float(num_stocks),
        "largest_position": float(largest_position),
        "top_3_concentration": float(top_3_concentration),
        "portfolio_return": float(portfolio_return),
        "portfolio_volatility": float(portfolio_volatility),
        "sharpe_ratio": float(sharpe_ratio),
        "max_drawdown": float(max_drawdown),
        "cash_percent": float(cash_percent)
    }
    
    # 6. Predict score using the model if available
    score = 50.0 # Default fallback score
    
    if portfolio_model is not None and model_features is not None:
        try:
            # Create a DataFrame with the exact feature order expected by the model
            input_df = pd.DataFrame([features])
            
            # Ensure all required features are present, fill missing with 0
            for col in model_features:
                if col not in input_df.columns:
                    input_df[col] = 0.0
                    
            # Reorder columns
            input_df = input_df[model_features]
            
            # Predict
            pred = portfolio_model.predict(input_df)[0]
            
            # Cap and floor score
            score = max(0.0, min(100.0, float(pred)))
            
        except Exception as e:
            print(f"Warning: Model prediction failed: {e}. Using fallback scoring.")
            # Simple heuristic fallback scoring
            heuristic = 50
            if sharpe_ratio > 1.0: heuristic += 20
            elif sharpe_ratio > 0.5: heuristic += 10
            if portfolio_return > 0.15: heuristic += 10
            if max_drawdown < -0.30: heuristic -= 15
            if top_3_concentration > 0.8: heuristic -= 10
            score = max(0.0, min(100.0, heuristic))
    else:
        # Heuristic fallback if model not loaded
        heuristic = 60
        if sharpe_ratio > 0.8: heuristic += 15
        if max_drawdown < -0.25: heuristic -= 15
        if num_stocks > 10: heuristic += 10
        elif num_stocks < 3: heuristic -= 10
        score = max(0.0, min(100.0, heuristic))
        
    score = round(score, 1)
    
    # 7. Generate output
    return {
        "score": score,
        "rating": get_rating_label(score),
        "features": {k: round(v, 4) for k, v in features.items()},
        "suggestions": generate_suggestions(features, score)
    }
