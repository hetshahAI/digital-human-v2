import asyncio
import httpx
import json

async def test_live_qwen_generation():
    url = "https://exo.manysphere.info/v1/chat/completions"
    payload = {
        "model": "mlx-community/Qwen3.6-35B-A3B-4bit",
        "messages": [
            {
                "role": "system",
                "content": "You are Alicia, a friendly, intelligent, and natural 3D conversational AI digital human. Provide immediate, natural, and concise spoken dialogue strictly between 10 and 30 words (1 to 2 short sentences). Never output chain-of-thought, reasoning steps, thinking tags (<think>), or formatting during spoken conversation."
            },
            {
                "role": "user",
                "content": "Hello Alicia, what can you do?"
            }
        ],
        "stream": True,
        "temperature": 0.6,
        "top_p": 0.9,
        "max_tokens": 64,
        "enable_thinking": False,
        "reasoning_effort": "none"
    }

    tokens = []
    print(f"Sending prompt to ManySphere Exo Qwen...")
    async with httpx.AsyncClient(timeout=30.0) as client:
        async with client.stream("POST", url, json=payload) as resp:
            print(f"Status: {resp.status_code}")
            async for line in resp.aiter_lines():
                if line.startswith("data:"):
                    d = line[5:].strip()
                    if d == "[DONE]":
                        break
                    try:
                        c = json.loads(d)
                        delta = c["choices"][0]["delta"]
                        if "reasoning_content" in delta:
                            print(f"[WARN: REASONING CONTENT DETECTED]: {delta['reasoning_content']}")
                        content = delta.get("content", "")
                        if content:
                            tokens.append(content)
                            print(content, end="", flush=True)
                    except Exception as e:
                        pass
    full_resp = "".join(tokens)
    word_count = len(full_resp.split())
    print(f"\n\n--- Analysis ---")
    print(f"Full response: '{full_resp}'")
    print(f"Word count: {word_count} words (Target: 10-30 words)")
    print(f"Has <think> tags: {'<think>' in full_resp}")

if __name__ == "__main__":
    asyncio.run(test_live_qwen_generation())
