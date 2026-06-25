import os

class LocalFineTunedChatProvider:
    def __init__(self, base_model_name, adapter_path):
        import torch
        from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
        from peft import PeftModel

        print(f"Loading base model: {base_model_name}")
        self.tokenizer = AutoTokenizer.from_pretrained(base_model_name, trust_remote_code=True)
        
        # Configure 4-bit quantization
        quant_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
        )

        base_model = AutoModelForCausalLM.from_pretrained(
            base_model_name,
            quantization_config=quant_config,
            device_map="auto",
            trust_remote_code=True,
        )

        print(f"Loading LoRA adapter from: {adapter_path}")
        self.model = PeftModel.from_pretrained(base_model, adapter_path)
        self.model.eval()

    def generate_answer(self, previous_chat, current_stock_data, current_news_data, retrieved_context, user_question):
        import torch
        
        system_prompt = (
            "You are a stock market assistant inside an AI stock dashboard. "
            "Answer using only the provided current stock data, current news data, vector database context, and previous chat history. "
            "If the available context is insufficient, say that the available data is insufficient. "
            "Do not invent stock prices, dates, ratings, forecasts, targets, or news. "
            "Do not provide guaranteed financial advice. Be clear, concise, and useful for retail investors."
        )

        user_content = f"""Previous chat:
{previous_chat}

Current stock data:
{current_stock_data}

Current news data:
{current_news_data}

Vector database context:
{retrieved_context}

Latest user question:
{user_question}"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ]

        inputs = self.tokenizer.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=True,
            return_tensors="pt"
        ).to(self.model.device)

        with torch.no_grad():
            outputs = self.model.generate(
                input_ids=inputs,
                max_new_tokens=350,
                temperature=0.3,
                top_p=0.9,
                do_sample=True,
                repetition_penalty=1.1,
                pad_token_id=self.tokenizer.eos_token_id,
            )

        # Decode only the new tokens
        input_length = inputs.shape[1]
        generated_tokens = outputs[0][input_length:]
        decoded = self.tokenizer.decode(generated_tokens, skip_special_tokens=True)

        return decoded.strip()

class GeminiChatProvider:
    def __init__(self, api_key, model_name="gemini-2.5-flash"):
        try:
            import google.generativeai as genai
        except ImportError:
            raise ImportError("Please install google-generativeai using 'pip install google-generativeai'")
        
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)

    def generate_answer(self, previous_chat, current_stock_data, current_news_data, retrieved_context, user_question):
        system_prompt = (
            "You are a stock market assistant inside an AI stock dashboard. "
            "Answer using only the provided current stock data, current news data, vector database context, and previous chat history. "
            "If the available context is insufficient, say that the available data is insufficient. "
            "Do not invent stock prices, dates, ratings, forecasts, targets, or news. "
            "Do not provide guaranteed financial advice. Be clear, concise, and useful for retail investors."
        )

        user_content = f"""Previous chat:
{previous_chat}

Current stock data:
{current_stock_data}

Current news data:
{current_news_data}

Vector database context:
{retrieved_context}

Latest user question:
{user_question}"""

        import google.generativeai as genai
        response = self.model.generate_content(
            system_prompt + "\n\n" + user_content,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=350,
                temperature=0.3,
                top_p=0.9,
            )
        )
        return response.text.strip()

# Singleton instance
_provider = None

def get_chatbot_provider():
    global _provider
    if _provider is None:
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        
        if gemini_api_key:
            gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
            _provider = GeminiChatProvider(api_key=gemini_api_key, model_name=gemini_model)
        else:
            base_model = os.getenv("LOCAL_CHAT_BASE_MODEL", "unsloth/Qwen3-4B-Instruct-2507-unsloth-bnb-4bit")
            # Handle relative path from ml_service root
            adapter_path = os.getenv("LOCAL_CHAT_ADAPTER_PATH", "models/chatbot/stock-chat-qwen3-lora-final")
            
            # If relative, check if it exists relative to the current working directory (ml_service)
            if not os.path.isabs(adapter_path):
                project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                alt_path = os.path.join(project_root, adapter_path)
                if os.path.exists(alt_path):
                    adapter_path = alt_path
                else:
                    ml_service_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                    alt_path2 = os.path.join(ml_service_root, adapter_path)
                    if os.path.exists(alt_path2):
                        adapter_path = alt_path2

            _provider = LocalFineTunedChatProvider(base_model, adapter_path)
    return _provider
