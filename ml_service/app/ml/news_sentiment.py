import os
import json
import re
import joblib
import numpy as np
import tensorflow as tf
from tensorflow.keras.preprocessing.sequence import pad_sequences

# Load env variables manually to avoid dotenv dependency
env_path = os.path.join(os.path.dirname(__file__), "../../../.env.local")
if os.path.exists(env_path):
    with open(env_path, "r") as f:
        for line in f:
            if line.strip() and not line.startswith('#') and '=' in line:
                k, v = line.strip().split('=', 1)
                os.environ.setdefault(k, v)

class NewsSentimentModel:
    def __init__(self, model_path, tokenizer_path, labels_path):
        self.model = tf.keras.models.load_model(model_path)
        self.tokenizer = joblib.load(tokenizer_path)

        with open(labels_path, "r") as f:
            metadata = json.load(f)

        self.max_len = metadata["max_len"]
        self.label_to_id = metadata["label_to_id"]
        self.id_to_label = {
            int(k): v for k, v in metadata["id_to_label"].items()
        }

    def clean_text(self, text):
        text = str(text or "")
        text = text.lower()
        text = re.sub(r"http\S+|www\S+", " ", text)
        text = re.sub(r"[^a-z0-9%.\- ]+", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text

    def predict(self, texts):
        if isinstance(texts, str):
            texts = [texts]

        cleaned = [self.clean_text(t) for t in texts]
        seqs = self.tokenizer.texts_to_sequences(cleaned)
        padded = pad_sequences(
            seqs,
            maxlen=self.max_len,
            padding="post",
            truncating="post"
        )

        probs = self.model.predict(padded, verbose=0)

        results = []
        for original_text, row in zip(texts, probs):
            pred_id = int(np.argmax(row))
            label = self.id_to_label[pred_id]
            confidence = float(row[pred_id])

            results.append({
                "text": original_text,
                "sentiment": label,
                "confidence": round(confidence, 4),
                "all_probs": {
                    self.id_to_label[i]: round(float(row[i]), 4)
                    for i in range(len(row))
                }
            })

        return results

_model_instance = None

def get_news_sentiment_model():
    global _model_instance
    if _model_instance is None:
        model_path = os.getenv("NEWS_SENTIMENT_MODEL_PATH", "../models/stonks_news_bilstm/news_bilstm.keras")
        tokenizer_path = os.getenv("NEWS_SENTIMENT_TOKENIZER_PATH", "../models/stonks_news_bilstm/news_tokenizer.joblib")
        labels_path = os.getenv("NEWS_SENTIMENT_LABELS_PATH", "../models/stonks_news_bilstm/news_labels.json")
        
        # Base dir is Stonks project root
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
        
        # If paths are relative, resolve them from base_dir
        if not os.path.isabs(model_path):
            model_path = os.path.join(base_dir, model_path)
        if not os.path.isabs(tokenizer_path):
            tokenizer_path = os.path.join(base_dir, tokenizer_path)
        if not os.path.isabs(labels_path):
            labels_path = os.path.join(base_dir, labels_path)
            
        _model_instance = NewsSentimentModel(model_path, tokenizer_path, labels_path)
        
    return _model_instance
