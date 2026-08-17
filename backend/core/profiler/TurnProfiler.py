import os
import csv
import json
import time
import logging
from typing import Dict, Any, Optional, List
from pathlib import Path

logger = logging.getLogger(__name__)

# Global counter for sequential turn tracking across sessions
_GLOBAL_TURN_COUNTER = 0

def get_next_turn_id() -> int:
    global _GLOBAL_TURN_COUNTER
    _GLOBAL_TURN_COUNTER += 1
    return _GLOBAL_TURN_COUNTER

def format_turn_id(turn_num: int) -> str:
    return f"{turn_num:05d}"

class TurnProfiler:
    """
    Production-grade end-to-end Latency Timeline & Pipeline Profiler.
    Uses high-precision time.perf_counter() to measure and trace every stage
    of the digital human conversational pipeline with millisecond accuracy.
    """
    def __init__(self, turn_number: Optional[int] = None, session_id: str = ""):
        self.turn_number: int = turn_number if turn_number is not None else get_next_turn_id()
        self.turn_id: str = format_turn_id(self.turn_number)
        self.session_id: str = session_id
        
        self.t_turn_start: float = time.perf_counter()
        self.timestamps: Dict[str, float] = {}  # Relative ms from t_turn_start
        self.raw_timestamps: Dict[str, float] = {}  # Raw perf_counter()
        
        # Stage metrics
        self.asr_data: Dict[str, Any] = {
            "speech_duration_ms": 0.0,
            "asr_processing_ms": 0.0,
            "asr_total_ms": 0.0,
            "transcript": ""
        }
        self.llm_data: Dict[str, Any] = {
            "request_sent_ms": 0.0,
            "connection_time_ms": 0.0,
            "time_to_first_token_ms": 0.0,
            "time_to_last_token_ms": 0.0,
            "generation_speed_ms": 0.0,
            "tokens_generated": 0,
            "tokens_per_sec": 0.0,
            "response_text": ""
        }
        self.tts_data: Dict[str, Any] = {
            "request_time_ms": 0.0,
            "time_to_first_audio_ms": 0.0,
            "total_synthesis_ms": 0.0,
            "average_chunk_size_bytes": 0.0,
            "chunks_produced": 0,
            "total_audio_bytes": 0
        }
        self.frontend_data: Dict[str, Any] = {
            "receive_delay_ms": 4.5,
            "decode_delay_ms": 1.8,
            "playback_delay_ms": 18.0
        }
        self.neurosync_data: Dict[str, Any] = {
            "first_blendshape_ms": 0.0,
            "lip_delay_ms": 3.5
        }
        self.total_turn_latency_ms: float = 0.0

    def mark(self, event_name: str, custom_time: Optional[float] = None, log_event: bool = True) -> float:
        """
        Records a high-precision timeline event.
        """
        t_now = custom_time if custom_time is not None else time.perf_counter()
        delta_ms = (t_now - self.t_turn_start) * 1000.0
        
        self.raw_timestamps[event_name] = t_now
        self.timestamps[event_name] = delta_ms
        
        if log_event:
            print(f"[TURN {self.turn_number}][{event_name}] (+{delta_ms:.1f}ms)", flush=True)
            logger.info(f"[TURN {self.turn_number}][{event_name}] (+{delta_ms:.1f}ms)")
        return delta_ms

    def record_asr(self, speech_duration_ms: float, asr_processing_ms: float, transcript: str):
        self.asr_data["speech_duration_ms"] = speech_duration_ms
        self.asr_data["asr_processing_ms"] = asr_processing_ms
        self.asr_data["asr_total_ms"] = speech_duration_ms + asr_processing_ms
        self.asr_data["transcript"] = transcript

    def record_llm(
        self,
        request_sent_ms: float,
        connection_time_ms: float,
        ttft_ms: float,
        ttlt_ms: float,
        total_gen_ms: float,
        tokens_generated: int,
        tokens_per_sec: float,
        response_text: str
    ):
        self.llm_data["request_sent_ms"] = request_sent_ms
        self.llm_data["connection_time_ms"] = connection_time_ms
        self.llm_data["time_to_first_token_ms"] = ttft_ms
        self.llm_data["time_to_last_token_ms"] = ttlt_ms
        self.llm_data["generation_speed_ms"] = total_gen_ms
        self.llm_data["tokens_generated"] = tokens_generated
        self.llm_data["tokens_per_sec"] = tokens_per_sec
        self.llm_data["response_text"] = response_text

    def record_tts(
        self,
        request_time_ms: float,
        ttfa_ms: float,
        total_synthesis_ms: float,
        avg_chunk_size: float,
        chunks_count: int,
        total_bytes: int
    ):
        self.tts_data["request_time_ms"] = request_time_ms
        self.tts_data["time_to_first_audio_ms"] = ttfa_ms
        self.tts_data["total_synthesis_ms"] = total_synthesis_ms
        self.tts_data["average_chunk_size_bytes"] = avg_chunk_size
        self.tts_data["chunks_produced"] = chunks_count
        self.tts_data["total_audio_bytes"] = total_bytes

    def record_frontend(self, receive_delay_ms: float, decode_delay_ms: float, playback_delay_ms: float):
        self.frontend_data["receive_delay_ms"] = receive_delay_ms
        self.frontend_data["decode_delay_ms"] = decode_delay_ms
        self.frontend_data["playback_delay_ms"] = playback_delay_ms

    def record_neurosync(self, first_blendshape_ms: float, lip_delay_ms: float):
        self.neurosync_data["first_blendshape_ms"] = first_blendshape_ms
        self.neurosync_data["lip_delay_ms"] = lip_delay_ms

    def finalize(self) -> Dict[str, Any]:
        if getattr(self, "is_finalized", False):
            return self._summary

        t_end = time.perf_counter()
        self.mark("TURN_FINISHED", custom_time=t_end, log_event=True)
        self.total_turn_latency_ms = (t_end - self.t_turn_start) * 1000.0

        speech_to_first_audio = 0.0
        if "FIRST_AUDIO_BYTE" in self.timestamps and "VAD_END" in self.timestamps:
            speech_to_first_audio = max(0.0, self.timestamps["FIRST_AUDIO_BYTE"] - self.timestamps["VAD_END"])
        elif "FIRST_AUDIO_BYTE" in self.timestamps and "ASR_COMMIT" in self.timestamps:
            speech_to_first_audio = max(0.0, self.timestamps["FIRST_AUDIO_BYTE"] - self.timestamps["ASR_COMMIT"])
        elif self.tts_data["time_to_first_audio_ms"] > 0:
            speech_to_first_audio = self.tts_data["time_to_first_audio_ms"]

        self._summary = {
            "turn": self.turn_number,
            "turn_id": self.turn_id,
            "session_id": self.session_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "events": self.timestamps,
            "asr": self.asr_data,
            "llm": self.llm_data,
            "tts": self.tts_data,
            "frontend": self.frontend_data,
            "neurosync": self.neurosync_data,
            "totals": {
                "speech_duration_ms": self.asr_data["speech_duration_ms"],
                "asr_total_ms": self.asr_data["asr_total_ms"],
                "llm_ttft_ms": self.llm_data["time_to_first_token_ms"],
                "llm_total_ms": self.llm_data["generation_speed_ms"],
                "tts_ttfa_ms": self.tts_data["time_to_first_audio_ms"],
                "tts_total_ms": self.tts_data["total_synthesis_ms"],
                "frontend_delay_ms": self.frontend_data["playback_delay_ms"],
                "lip_delay_ms": self.neurosync_data["lip_delay_ms"],
                "speech_to_first_audio_ms": speech_to_first_audio,
                "total_turn_latency_ms": self.total_turn_latency_ms
            }
        }
        self.is_finalized = True
        return self._summary

    def get_console_report(self) -> str:
        """
        Generates the standard end-of-turn latency report.
        """
        asr_total = self.asr_data["asr_total_ms"]
        speech_dur = self.asr_data["speech_duration_ms"]
        asr_proc = self.asr_data["asr_processing_ms"]

        llm_req = self.llm_data["request_sent_ms"]
        llm_conn = self.llm_data["connection_time_ms"]
        llm_ttft = self.llm_data["time_to_first_token_ms"]
        llm_ttlt = self.llm_data["time_to_last_token_ms"]
        llm_dur = self.llm_data["generation_speed_ms"]
        llm_tps = self.llm_data["tokens_per_sec"]

        tts_req = self.tts_data["request_time_ms"]
        tts_ttfa = self.tts_data["time_to_first_audio_ms"]
        tts_total = self.tts_data["total_synthesis_ms"]
        tts_avg_chunk = self.tts_data["average_chunk_size_bytes"]
        tts_chunks = self.tts_data["chunks_produced"]

        fe_recv = self.frontend_data["receive_delay_ms"]
        fe_decode = self.frontend_data["decode_delay_ms"]
        fe_play = self.frontend_data["playback_delay_ms"]

        ns_first = self.neurosync_data["first_blendshape_ms"]
        ns_lip = self.neurosync_data["lip_delay_ms"]

        total_lat = self.total_turn_latency_ms

        report = f"""
======================================
TURN {self.turn_number} LATENCY REPORT
======================================

ASR
Speech Duration:     {speech_dur:.1f} ms
ASR Processing:      {asr_proc:.1f} ms
ASR Total:           {asr_total:.1f} ms

------------------------

LLM
Request Sent:        {llm_req:.1f} ms
Connection Time:     {llm_conn:.1f} ms
Time To First Token: {llm_ttft:.1f} ms
Time To Last Token:  {llm_ttlt:.1f} ms
Generation Speed:    {llm_dur:.1f} ms
Tokens/sec:          {llm_tps:.1f} tok/s

------------------------

TTS
Request Time:        {tts_req:.1f} ms
Time To First Audio: {tts_ttfa:.1f} ms
Total Synthesis:     {tts_total:.1f} ms
Average Chunk Size:  {tts_avg_chunk:.1f} bytes
Chunks Produced:     {tts_chunks}

------------------------

Frontend
Receive Delay:       {fe_recv:.1f} ms
Decode Delay:        {fe_decode:.1f} ms
Playback Delay:      {fe_play:.1f} ms

------------------------

NeuroSync
First Blendshape:    {ns_first:.1f} ms
Lip Delay:           {ns_lip:.1f} ms

------------------------

TOTAL
User Speech
v
ASR
v
LLM
v
TTS
v
Playback
v
Lip Sync

Total Turn Latency:  {total_lat:.1f} ms
======================================
"""
        return report

    def save_logs(self, logs_dir: str = "logs"):
        """
        Saves timeline.csv entry and turn_000XX.json trace.
        """
        raw_dirs = [logs_dir]
        if not os.path.isabs(logs_dir):
            raw_dirs.append(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "logs"))
            raw_dirs.append(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "logs"))

        target_dirs = list({os.path.abspath(d) for d in raw_dirs})
        summary = self.finalize()
        last_json = ""
        last_csv = ""

        for d in set(target_dirs):
            try:
                os.makedirs(d, exist_ok=True)
                
                # 1. JSON Trace
                json_path = os.path.join(d, f"turn_{self.turn_id}.json")
                with open(json_path, "w", encoding="utf-8") as jf:
                    json.dump(summary, jf, indent=2)
                last_json = json_path

                # 2. CSV Entry
                csv_path = os.path.join(d, "timeline.csv")
                file_exists = os.path.isfile(csv_path)
                
                headers = [
                    "Turn ID",
                    "ASR Total",
                    "LLM TTFT",
                    "LLM Total",
                    "Tokens Generated",
                    "Tokens/sec",
                    "TTS TTFA",
                    "TTS Total",
                    "Frontend Delay",
                    "Lip Delay",
                    "Total Conversation Time"
                ]
                
                row = [
                    self.turn_id,
                    f"{self.asr_data['asr_total_ms']:.1f}",
                    f"{self.llm_data['time_to_first_token_ms']:.1f}",
                    f"{self.llm_data['generation_speed_ms']:.1f}",
                    self.llm_data["tokens_generated"],
                    f"{self.llm_data['tokens_per_sec']:.1f}",
                    f"{self.tts_data['time_to_first_audio_ms']:.1f}",
                    f"{self.tts_data['total_synthesis_ms']:.1f}",
                    f"{self.frontend_data['playback_delay_ms']:.1f}",
                    f"{self.neurosync_data['lip_delay_ms']:.1f}",
                    f"{self.total_turn_latency_ms:.1f}"
                ]
                
                with open(csv_path, "a", newline="", encoding="utf-8") as cf:
                    writer = csv.writer(cf)
                    if not file_exists or os.path.getsize(csv_path) == 0:
                        writer.writerow(headers)
                    writer.writerow(row)
                last_csv = csv_path
            except Exception as e:
                logger.debug(f"Log save error for {d}: {e}")

        return last_json, last_csv
