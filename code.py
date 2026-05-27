"""CLI version of Sana — run the web app with: python api.py"""
from dotenv import load_dotenv
import subprocess
import os
import sounddevice as sd
import numpy as np
import webrtcvad

import sana_core

load_dotenv()

print("Loading voice models... please wait")
sana_core.get_whisper_model()


def record_audio():
    sample_rate = 16000
    frame_duration = 30
    frame_size = int(sample_rate * frame_duration / 1000)

    vad = webrtcvad.Vad(2)
    print("Listening... (speak freely, I'll wait for you)")

    stream = sd.InputStream(
        samplerate=sample_rate, channels=1, dtype="int16", blocksize=frame_size
    )
    stream.start()

    frames = []
    triggered = False
    silent_frames = 0
    max_silent_frames = 100
    speech_frames = 0
    min_speech_frames = 33

    while True:
        frame, _ = stream.read(frame_size)
        frame_bytes = frame.tobytes()
        is_speech = vad.is_speech(frame_bytes, sample_rate)

        if is_speech:
            triggered = True
            speech_frames += 1
            silent_frames = 0
            frames.append(frame)
        elif triggered:
            silent_frames += 1
            frames.append(frame)
            if silent_frames > max_silent_frames:
                break

    stream.stop()
    stream.close()

    if speech_frames < min_speech_frames:
        return None, sample_rate

    audio = np.concatenate(frames, axis=0).astype(np.float32) / 32768.0
    return audio, sample_rate


def speak(text):
    clean = text.encode("ascii", "ignore").decode("ascii")
    clean = clean.replace('"', "").replace("'", "")
    try:
        subprocess.run(
            [
                "powershell",
                "-Command",
                f'Add-Type -AssemblyName System.Speech; '
                f"$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
                f'$s.SelectVoiceByHints("Female"); '
                f'$s.Speak("{clean}")',
            ]
        )
    except Exception as e:
        print(f"Voice error: {e}")


def speech_to_text_cli(audio, sample_rate):
    import tempfile
    import soundfile as sf

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        temp_path = f.name
        sf.write(temp_path, audio, sample_rate)
    try:
        return sana_core.transcribe_audio_file(temp_path)
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass


conversation_history = sana_core.load_memory()

print("\nSana is online!\n")
greeting = sana_core.get_greeting(conversation_history)
print(f"Sana: {greeting}")
speak(greeting)

while True:
    print("\nPress Enter to speak, type 'text' to type, type 'quit' to exit")
    choice = input("> ").strip().lower()

    if choice == "quit":
        farewell = "Take care of yourself. I'm here whenever you need to talk again."
        print(f"Sana: {farewell}")
        speak(farewell)
        break

    elif choice == "text":
        user_input = input("You (text): ").strip()
        if not user_input:
            continue
    else:
        audio, sr = record_audio()
        if audio is None:
            print("Didn't catch that, try again!")
            continue
        user_input = speech_to_text_cli(audio, sr)
        if not user_input:
            print("Didn't catch that, try again!")
            continue

    reply, conversation_history = sana_core.chat(user_input, conversation_history)
    print(f"Sana: {reply}")
    speak(reply)
