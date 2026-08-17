import urllib.request, time

start=time.time()
resp = urllib.request.urlopen('http://127.0.0.1:8000/test_tts?text=Hello+this+is+a+streaming+test')
for line in resp:
    line_str = line.decode('utf-8').strip()
    if line_str:
        print(f"{time.time()-start:.2f}s - {line_str}")
