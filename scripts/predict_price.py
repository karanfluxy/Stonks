import json
import math
import os
import sys
from pathlib import Path


def build_stock_lstm(torch):
    import torch.nn as nn

    class StockLSTM(nn.Module):
        def __init__(self, input_dim=1, hidden_dim=64, num_layers=5, output_dim=1):
            super().__init__()
            self.hidden_dim = hidden_dim
            self.num_layers = num_layers
            self.lstm = nn.LSTM(input_dim, hidden_dim, num_layers, batch_first=True)
            self.fc = nn.Linear(hidden_dim, output_dim)

        def forward(self, x):
            h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_dim, device=x.device)
            c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_dim, device=x.device)
            out, _ = self.lstm(x, (h0, c0))
            return self.fc(out[:, -1, :])

    return StockLSTM()


def fail(message: str, code: int = 1):
    print(json.dumps({"error": message}))
    sys.exit(code)


def parse_closes(raw: str):
    try:
        values = json.loads(raw)
    except json.JSONDecodeError:
        fail("Invalid JSON closes payload")

    if not isinstance(values, list):
        fail("closes must be a JSON array")

    cleaned = []
    for v in values:
        try:
            n = float(v)
        except Exception:
            continue
        if math.isfinite(n):
            cleaned.append(n)

    if len(cleaned) < 50:
        fail("Need at least 50 close values")

    return cleaned[-50:]


def minmax_scale(values):
    low = min(values)
    high = max(values)
    span = high - low

    if not math.isfinite(low) or not math.isfinite(high):
        fail("Invalid close values for scaling")

    if span <= 0:
        return [0.0 for _ in values], low, high

    scaled = [(v - low) / span for v in values]
    return scaled, low, high


def minmax_inverse(value, low, high):
    span = high - low
    if span <= 0:
        return float(low)
    return float(value * span + low)


def load_model(model_path: Path):
    try:
        import torch  # type: ignore
    except Exception:
        fail("PyTorch is not installed in active Python environment", 2)

    try:
        model = torch.jit.load(str(model_path), map_location="cpu")
        model.eval()
        return model, torch
    except Exception:
        pass

    try:
        loaded = torch.load(str(model_path), map_location="cpu")
    except Exception as exc:
        fail(f"Unable to load model.pth: {exc}")

    # Direct nn.Module checkpoints
    if hasattr(loaded, "eval") and callable(loaded.eval):
        loaded.eval()
        return loaded, torch

    # OrderedDict or checkpoint dict: instantiate architecture then load weights.
    model = build_stock_lstm(torch)

    state_dict = None
    if isinstance(loaded, dict):
        if "state_dict" in loaded and isinstance(loaded["state_dict"], dict):
            state_dict = loaded["state_dict"]
        elif "model_state_dict" in loaded and isinstance(loaded["model_state_dict"], dict):
            state_dict = loaded["model_state_dict"]
        elif all(isinstance(k, str) for k in loaded.keys()):
            state_dict = loaded

    if state_dict is None:
        fail("Unsupported checkpoint format in model.pth")

    try:
        model.load_state_dict(state_dict, strict=True)
    except Exception as exc:
        fail(f"State dict shape mismatch: {exc}")

    model.eval()
    return model, torch


def run_inference(model, torch, closes):
    candidates = [
        torch.tensor(closes, dtype=torch.float32).view(1, 50, 1),
        torch.tensor(closes, dtype=torch.float32).view(1, 50),
        torch.tensor(closes, dtype=torch.float32),
    ]

    last_error = None

    with torch.no_grad():
        for tensor in candidates:
            try:
                output = model(tensor)

                if isinstance(output, (tuple, list)):
                    output = output[0]

                if hasattr(output, "detach"):
                    output = output.detach().cpu()

                if hasattr(output, "reshape") and hasattr(output, "numel"):
                    if int(output.numel()) == 0:
                        raise ValueError("Empty model output")
                    flat = output.reshape(-1)
                    value = float(flat[-1].item())
                else:
                    value = float(output)

                if not math.isfinite(value):
                    raise ValueError("Model output is not finite")

                return value
            except Exception as exc:
                last_error = exc

    fail(f"Inference failed for tried tensor shapes: {last_error}")


def main():
    # changed the a bit of logic
    if len(sys.argv) < 2:
        fail("Usage: predict_price.py '[close1, close2, ...]'")

    closes = parse_closes(sys.argv[1])

    model_path = os.environ.get("MODEL_PTH_PATH")
    if model_path:
        path = Path(model_path)
    else:
        path = Path(__file__).resolve().parents[1] / "model.pth"

    if not path.exists():
        fail(f"Model file not found: {path}")

    model, torch = load_model(path)

    scaled_closes, low, high = minmax_scale(closes)
    predicted_scaled = run_inference(model, torch, scaled_closes)
    predicted = minmax_inverse(predicted_scaled, low, high)

    print(json.dumps({"predicted": predicted}))


if __name__ == "__main__":
    main()
