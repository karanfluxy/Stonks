from datetime import datetime
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.ml.predictor import predict_eod_price
from app.ml.buy_signal_predictor import predict_buy_signal_stock
from app.ml.portfolio_rater import rate_portfolio
from app.ml.chatbot import get_chatbot_provider
from app.ml.news_sentiment import get_news_sentiment_model
from typing import List, Dict, Any, Optional

app = FastAPI()

class PredictRequest(BaseModel):
    ticker: str

class PortfolioRequest(BaseModel):
    holdings: List[Dict[str, Any]]

class ChatRequest(BaseModel):
    previous_chat: str
    current_stock_data: str
    current_news_data: str
    retrieved_context: str
    user_question: str

class NewsSentimentRequest(BaseModel):
    texts: List[str]

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/predict/eod")
def predict_eod(req: PredictRequest):
    try:
        if req.ticker.upper() not in ["AAPL", "TSLA"]:
            raise ValueError(f"Ticker {req.ticker} is not currently supported. Only AAPL and TSLA are supported.")
        return predict_eod_price(req.ticker)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/predict-buy-signal")
def predict_buy_signal(req: PredictRequest):
    try:
        return predict_buy_signal_stock(req.ticker)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/predict")
def predict_legacy_signal(req: PredictRequest):
    try:
        # Get the new RF prediction
        rf_result = predict_buy_signal_stock(req.ticker)
        
        # Map to the format expected by the legacy rf-signal route
        is_buy = 1 if rf_result["signal"] == "BUY" else 0
        
        # Calculate a pseudo-confidence based on predicted return magnitude
        return_magnitude = abs(rf_result["predicted_return_percent"]) / 100.0
        confidence = min(0.99, max(0.51, 0.5 + return_magnitude * 5))
        
        return {
            "prediction": is_buy,
            "label": "BUY" if is_buy else "SELL",
            "confidence": confidence,
            "predicted_price_5d": rf_result["predicted_price_5d"],
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/predict-portfolio")
def predict_portfolio(req: PortfolioRequest):
    try:
        return rate_portfolio(req.holdings)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/chat")
def chat(req: ChatRequest):
    try:
        provider = get_chatbot_provider()
        answer = provider.generate_answer(
            previous_chat=req.previous_chat,
            current_stock_data=req.current_stock_data,
            current_news_data=req.current_news_data,
            retrieved_context=req.retrieved_context,
            user_question=req.user_question,
        )
        return {"answer": answer}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/models/news-sentiment/predict")
def predict_news_sentiment(req: NewsSentimentRequest):
    try:
        model = get_news_sentiment_model()
        results = model.predict(req.texts)
        return {
            "model": "news_sentiment_bilstm",
            "results": results
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
