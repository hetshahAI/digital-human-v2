"""
LIVE CONTRACT TEST — NEUROSYNC REMOTE API (Project 017)
Target Endpoint: http://192.168.192.33:5001/audio_to_blendshapes

Tests:
1. Server connectivity and HTTP headers
2. POST with application/json (base64 audio)
3. POST with audio/wav (binary data)
4. POST with multipart/form-data
5. Detailed forensic analysis of returned blendshape frames [T, 61]
"""
import io
import time
import wave
import math
import struct
import base64
import json
import httpx

TARGET_HOST = "http://192.168.192.33:5001"
TARGET_ENDPOINT = f"{TARGET_HOST}/audio_to_blendshapes"

def generate_synthetic_wav(duration_s: float = 1.0, sample_rate: int = 22050) -> bytes:
    """Generates a clean synthetic speech-like acoustic WAV in memory."""
    num_samples = int(duration_s * sample_rate)
    pcm_data = []
    for i in range(num_samples):
        t = i / sample_rate
        # Multi-harmonic voice simulation (200Hz + 700Hz + 1500Hz)
        sample = (0.4 * math.sin(2 * math.pi * 200 * t) +
                  0.3 * math.sin(2 * math.pi * 700 * t) +
                  0.2 * math.sin(2 * math.pi * 1500 * t))
        int_sample = max(-32768, min(32767, int(sample * 32767.0)))
        pcm_data.append(struct.pack("<h", int_sample))
    
    raw_pcm = b"".join(pcm_data)
    wav_io = io.BytesIO()
    with wave.open(wav_io, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(raw_pcm)
    return wav_io.getvalue()

def analyze_response(res: httpx.Response, payload_type: str, elapsed_ms: float):
    print(f"\n--- Result for payload format: {payload_type} ---")
    print(f"HTTP Status: {res.status_code} {res.reason_phrase}")
    print(f"Elapsed Time: {elapsed_ms:.1f}ms")
    print(f"Response Headers: {dict(res.headers)}")
    
    if res.status_code == 200:
        try:
            data = res.json()
            print("Response JSON Type:", type(data))
            if isinstance(data, dict):
                print("JSON Top-Level Keys:", list(data.keys()))
                for k, v in data.items():
                    if k != "blendshapes":
                        print(f"  {k}: {v}")
            
            # Extract blendshape frames
            frames = None
            if isinstance(data, list):
                frames = data
            elif isinstance(data, dict):
                frames = data.get("blendshapes") or data.get("facial_data") or data.get("frames")
            
            if frames and isinstance(frames, list):
                total_frames = len(frames)
                print(f"Total Frames (T): {total_frames}")
                if total_frames > 0:
                    first_frame = frames[0]
                    coeff_count = len(first_frame) if isinstance(first_frame, (list, tuple)) else (len(first_frame.keys()) if isinstance(first_frame, dict) else 0)
                    print(f"Coefficients per Frame: {coeff_count}")
                    
                    if isinstance(first_frame, (list, tuple)):
                        print(f"First Frame Shape: [{coeff_count}]")
                        print("Sample values from Frame 0 (indices 0..9):", [round(float(x), 4) for x in first_frame[:10]])
                        if len(first_frame) > 20:
                            print("Sample jaw/mouth values (indices 14..24):", [round(float(x), 4) for x in first_frame[14:25]])
                        
                        # Check dynamics across timeline
                        if total_frames > 5:
                            mid_frame = frames[total_frames // 2]
                            print(f"Sample values from Mid Frame {total_frames // 2} (indices 14..24):", [round(float(x), 4) for x in mid_frame[14:25]])
                            
                            # Check if values change across frames
                            all_equal = (first_frame == mid_frame)
                            print(f"Frames dynamic / changing over time: {'NO (static)' if all_equal else 'YES (active neural motion)'}")
                    elif isinstance(first_frame, dict):
                        print("First Frame Dict Sample Keys:", list(first_frame.keys())[:10])
                        print("Sample values:", {k: round(float(v), 4) for k, v in list(first_frame.items())[:5]})
                return True, data
            else:
                print("Warning: Could not locate frames array in response!")
                return False, data
        except Exception as e:
            print(f"Error parsing JSON: {e}")
            print("Raw text snippet:", res.text[:300])
            return False, None
    else:
        print(f"Server Error ({res.status_code}): {res.text[:400]}")
        return False, None

def run_live_tests():
    print("=========================================================")
    print(f"PROBING LIVE REMOTE NEUROSYNC SERVER AT: {TARGET_HOST}")
    print("=========================================================")
    
    # 1. Health check on Root / Status
    with httpx.Client(timeout=5.0) as client:
        try:
            r = client.get(TARGET_HOST)
            print(f"[GET /] Status: {r.status_code} | Headers: {r.headers.get('content-type')} | Body: {r.text[:100]}")
        except Exception as e:
            print(f"[GET /] Connection error: {e}")

    # Generate 1.0s test WAV
    wav_bytes = generate_synthetic_wav(duration_s=1.0, sample_rate=22050)
    print(f"\nGenerated synthetic test audio: {len(wav_bytes)} bytes WAV (1.0s @ 22050 Hz)")

    # 2. Test Format A: application/json with base64 audio
    print("\n[TEST 1] Sending POST with Content-Type: application/json (base64 audio)...")
    b64_audio = base64.b64encode(wav_bytes).decode("utf-8")
    json_payload = {"audio": b64_audio}
    
    success_a = False
    with httpx.Client(timeout=30.0) as client:
        t0 = time.time()
        try:
            r_json = client.post(TARGET_ENDPOINT, json=json_payload, headers={"Content-Type": "application/json"})
            elapsed = (time.time() - t0) * 1000
            success_a, _ = analyze_response(r_json, "application/json", elapsed)
        except Exception as e:
            print(f"Request failed: {e}")

    # 3. Test Format B: audio/wav raw binary
    print("\n[TEST 2] Sending POST with Content-Type: audio/wav (raw WAV binary)...")
    success_b = False
    with httpx.Client(timeout=30.0) as client:
        t0 = time.time()
        try:
            r_wav = client.post(TARGET_ENDPOINT, content=wav_bytes, headers={"Content-Type": "audio/wav"})
            elapsed = (time.time() - t0) * 1000
            success_b, _ = analyze_response(r_wav, "audio/wav", elapsed)
        except Exception as e:
            print(f"Request failed: {e}")

    # 4. Test Format C: multipart/form-data
    print("\n[TEST 3] Sending POST with multipart/form-data (files={'audio': ...})...")
    success_c = False
    with httpx.Client(timeout=30.0) as client:
        t0 = time.time()
        try:
            files = {"audio": ("test.wav", wav_bytes, "audio/wav")}
            r_form = client.post(TARGET_ENDPOINT, files=files)
            elapsed = (time.time() - t0) * 1000
            success_c, _ = analyze_response(r_form, "multipart/form-data", elapsed)
        except Exception as e:
            print(f"Request failed: {e}")

    overall_success = success_a or success_b or success_c
    print("\n=========================================================")
    print("FINAL SUMMARY OF CONTRACT TEST")
    print("=========================================================")
    print(f"Target URL: {TARGET_ENDPOINT}")
    print(f"JSON Base64 format supported: {'YES' if success_a else 'NO'}")
    print(f"Raw Audio/WAV format supported: {'YES' if success_b else 'NO'}")
    print(f"Multipart Form format supported: {'YES' if success_c else 'NO'}")
    print(f"Overall Result: {'PASS' if overall_success else 'FAIL'}")
    print("=========================================================")

if __name__ == "__main__":
    run_live_tests()
