from dotenv import load_dotenv
load_dotenv()

import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import audio, jobs, session

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(session.router)
app.include_router(audio.router)
app.include_router(jobs.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.on_event("startup")
async def start_worker():
    asyncio.create_task(jobs.transcription_worker())
