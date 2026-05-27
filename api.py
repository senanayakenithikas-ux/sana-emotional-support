import os

from contextlib import asynccontextmanager

from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException, Query

from fastapi.middleware.cors import CORSMiddleware

from fastapi.responses import FileResponse

from fastapi.staticfiles import StaticFiles

from pydantic import BaseModel

import sana_core

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    sana_core.get_whisper_model()
    yield


app = FastAPI(title="Sana", description="Emotional support companion", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    chat_id: str | None = None


class ChatResponse(BaseModel):
    reply: str
    history: list
    chat_id: str


class CreateChatResponse(BaseModel):
    id: str
    title: str
    updated_at: str


@app.get("/sw.js")
async def service_worker():
    return FileResponse(
        STATIC_DIR / "sw.js",
        media_type="application/javascript",
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/chats")
async def list_chats():
    if not sana_core.get_active_chat_id() and not sana_core.list_chats():
        sana_core.create_chat()
    return {
        "active_chat_id": sana_core.get_active_chat_id(),
        "chats": sana_core.list_chats(),
    }


@app.post("/api/chats", response_model=CreateChatResponse)
async def create_chat():
    chat_id = sana_core.create_chat()
    store = sana_core.load_store()
    chat = store["chats"][chat_id]
    return CreateChatResponse(
        id=chat_id,
        title=chat["title"],
        updated_at=chat["updated_at"],
    )


@app.post("/api/chats/{chat_id}/activate")
async def activate_chat(chat_id: str):
    if not sana_core.set_active_chat(chat_id):
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"ok": True, "active_chat_id": chat_id}


@app.get("/api/greeting")
async def greeting(chat_id: str | None = Query(None)):
    cid = chat_id or sana_core.get_or_create_active_chat()
    history = sana_core.load_memory(cid)
    return {
        "greeting": sana_core.get_greeting(history),
        "has_history": len(history) > 0,
        "chat_id": cid,
    }


@app.get("/api/history")
async def history(chat_id: str | None = Query(None)):
    cid = chat_id or sana_core.get_or_create_active_chat()
    messages = sana_core.load_memory(cid)
    return {"messages": messages, "chat_id": cid}


@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(body: ChatRequest):
    text = body.message.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    cid = body.chat_id or sana_core.get_or_create_active_chat()
    if sana_core.get_messages(cid) is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    history = sana_core.load_memory(cid)
    reply, updated = sana_core.chat(text, history, cid)
    return ChatResponse(reply=reply, history=updated, chat_id=cid)


@app.post("/api/transcribe")
async def transcribe(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio file")
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    text = sana_core.transcribe_audio_bytes(data, suffix=suffix)
    if not text:
        raise HTTPException(status_code=422, detail="Could not understand audio")
    return {"text": text}


@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: str):
    if not sana_core.delete_chat(chat_id):
        raise HTTPException(status_code=404, detail="Chat not found")
    active = sana_core.get_active_chat_id()
    if not active:
        sana_core.create_chat()
        active = sana_core.get_active_chat_id()
    return {"ok": True, "active_chat_id": active}


@app.delete("/api/memory")
async def clear_memory(chat_id: str | None = Query(None)):
    cid = chat_id or sana_core.get_or_create_active_chat()
    sana_core.clear_memory(cid)
    return {"ok": True, "chat_id": cid}


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("api:app", host="0.0.0.0", port=port)
