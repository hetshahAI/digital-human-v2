import asyncio
import httpx

async def test_sse():
    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream("GET", "http://127.0.0.1:8000/test_stream?text=hello%20introduce%20yourself") as r:
            async for chunk in r.aiter_text():
                print(chunk, end="")

if __name__ == "__main__":
    asyncio.run(test_sse())
