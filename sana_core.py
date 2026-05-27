from groq import Groq
from dotenv import load_dotenv
from faster_whisper import WhisperModel
import json
import os
import tempfile
import uuid
from datetime import datetime, timezone

load_dotenv()

client = Groq()
MEMORY_FILE = "sana_memory.json"

SYSTEM_PROMPT = """You are Sana, a professional AI emotional support companion.

Your role:
- You provide a safe, non-judgmental space for users to express their thoughts and feelings
- You practice active listening and reflective responses
- You help users process emotions, manage stress, and build healthier thinking patterns
- You are NOT a therapist or clinical psychologist — you are a supportive first point of contact
- When someone shows signs of serious distress, crisis, or clinical need, you always refer them to a qualified professional

Your communication style:
- Warm, calm, and professional — like a skilled counsellor, not a friend or partner
- Speak clearly and gently; avoid slang, pet names, or overly casual language
- Keep responses concise unless the situation calls for depth
- Ask one thoughtful question at a time rather than overwhelming the user
- Reflect back what the user says to show you've truly heard them
- Never assume how someone feels — always ask
- Use "you" language, not "we" — respect the user's autonomy and individuality

What you do:
- Validate emotions without reinforcing unhealthy patterns
- Help users identify and name what they're feeling
- Gently explore the root of distress without pushing too hard
- Offer grounding techniques, breathing exercises, or reframing strategies when appropriate and when asked
- Support users through stress, anxiety, low mood, grief, loneliness, burnout, and difficult decisions
- Celebrate progress and resilience, however small
- Encourage healthy habits (rest, movement, connection) naturally and without being preachy

What you do NOT do:
- Diagnose any mental health condition
- Prescribe or recommend medication
- Replace professional therapy or crisis services
- Use romantic, flirtatious, or overly familiar language
- Project emotions or make assumptions about how the user feels
- Enable avoidance of real problems or foster unhealthy dependency on AI support
- Give unsolicited advice — listen first, always

Crisis protocol:
- If a user expresses thoughts of self-harm, suicide, or harming others, respond with immediate calm empathy and provide relevant crisis resources (e.g. a local helpline or emergency services)
- Do not attempt to manage a crisis alone — always direct the user to professional help

Tone: calm, grounded, compassionate, professional. Think of a skilled support worker or counsellor — present, attentive, and boundaried."""

_whisper_model = None


def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        _whisper_model = WhisperModel("tiny", device="cpu", compute_type="int8")
    return _whisper_model


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _title_from_text(text: str, max_len: int = 40) -> str:
    one_line = " ".join(text.split())
    if len(one_line) <= max_len:
        return one_line or "New chat"
    return one_line[: max_len - 1] + "…"


def _title_from_messages(messages: list) -> str | None:
    for m in messages:
        if m.get("role") == "user":
            return _title_from_text(m.get("content", ""))
    return None


def load_store() -> dict:
    if not os.path.exists(MEMORY_FILE):
        return {"active_chat_id": None, "chats": {}}
    with open(MEMORY_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        chat_id = str(uuid.uuid4())
        store = {
            "active_chat_id": chat_id,
            "chats": {
                chat_id: {
                    "title": _title_from_messages(data) or "Chat",
                    "updated_at": _now_iso(),
                    "messages": data,
                }
            },
        }
        save_store(store)
        return store
    if not isinstance(data, dict) or "chats" not in data:
        return {"active_chat_id": None, "chats": {}}
    data.setdefault("active_chat_id", None)
    data.setdefault("chats", {})
    return data


def save_store(store: dict) -> None:
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2)


def list_chats() -> list[dict]:
    store = load_store()
    items = []
    for cid, chat in store["chats"].items():
        items.append(
            {
                "id": cid,
                "title": chat.get("title", "New chat"),
                "updated_at": chat.get("updated_at", ""),
            }
        )
    items.sort(key=lambda x: x["updated_at"], reverse=True)
    return items


def get_active_chat_id() -> str | None:
    store = load_store()
    aid = store.get("active_chat_id")
    if aid and aid in store["chats"]:
        return aid
    return None


def create_chat() -> str:
    store = load_store()
    chat_id = str(uuid.uuid4())
    store["chats"][chat_id] = {
        "title": "New chat",
        "updated_at": _now_iso(),
        "messages": [],
    }
    store["active_chat_id"] = chat_id
    save_store(store)
    return chat_id


def get_or_create_active_chat() -> str:
    aid = get_active_chat_id()
    if aid:
        return aid
    return create_chat()


def set_active_chat(chat_id: str) -> bool:
    store = load_store()
    if chat_id not in store["chats"]:
        return False
    store["active_chat_id"] = chat_id
    save_store(store)
    return True


def get_messages(chat_id: str) -> list | None:
    store = load_store()
    chat = store["chats"].get(chat_id)
    if not chat:
        return None
    return chat.get("messages", [])


def delete_chat(chat_id: str) -> bool:
    store = load_store()
    if chat_id not in store["chats"]:
        return False
    del store["chats"][chat_id]
    if store.get("active_chat_id") == chat_id:
        if store["chats"]:
            newest = max(
                store["chats"].items(),
                key=lambda x: x[1].get("updated_at", ""),
            )
            store["active_chat_id"] = newest[0]
        else:
            store["active_chat_id"] = None
    save_store(store)
    return True


def load_memory(chat_id: str | None = None) -> list:
    cid = chat_id or get_or_create_active_chat()
    messages = get_messages(cid)
    return messages if messages is not None else []


def save_memory(memory: list, chat_id: str | None = None) -> None:
    cid = chat_id or get_or_create_active_chat()
    store = load_store()
    if cid not in store["chats"]:
        store["chats"][cid] = {
            "title": "New chat",
            "updated_at": _now_iso(),
            "messages": [],
        }
    store["chats"][cid]["messages"] = memory
    store["chats"][cid]["updated_at"] = _now_iso()
    title = _title_from_messages(memory)
    if title and store["chats"][cid].get("title") in (None, "", "New chat"):
        store["chats"][cid]["title"] = title
    store["active_chat_id"] = cid
    save_store(store)


def clear_memory(chat_id: str | None = None) -> None:
    cid = chat_id or get_or_create_active_chat()
    save_memory([], cid)


def get_greeting(history: list) -> str:
    if len(history) == 0:
        return (
            "Hello. I'm Sana, and I'm here to listen whenever you're ready. "
            "What's on your mind today?"
        )
    return (
        "Welcome back. I'm glad you're here again. "
        "How have things been since we last spoke?"
    )


def transcribe_audio_file(path: str, language: str = "en") -> str:
    model = get_whisper_model()
    segments, _ = model.transcribe(path, language=language)
    return " ".join(s.text for s in segments).strip()


def transcribe_audio_bytes(data: bytes, suffix: str = ".wav") -> str:
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        temp_path = f.name
        f.write(data)
    try:
        return transcribe_audio_file(temp_path)
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass


def chat(
    user_message: str, history: list | None = None, chat_id: str | None = None
) -> tuple[str, list]:
    cid = chat_id or get_or_create_active_chat()
    if history is None:
        history = load_memory(cid)

    history = history + [{"role": "user", "content": user_message}]

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "system", "content": SYSTEM_PROMPT}] + history[-50:],
    )
    reply = response.choices[0].message.content

    history = history + [{"role": "assistant", "content": reply}]
    save_memory(history, cid)
    return reply, history
