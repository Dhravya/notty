import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from os import environ as env

from api.routes import admin, api

load_dotenv()

app = FastAPI(title="Embedchain API")

app.include_router(api.router)
app.include_router(admin.router)


@app.middleware("http")
async def token_check_middleware(request: Request, call_next):
    token = request.headers.get("Authorization")

    if request.url.path.startswith("/api/v1"):
        if token != env.get("AUTH_TOKEN"):
            raise HTTPException(status_code=401, detail="Unauthorized")
    response = await call_next(request)
    return response


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        log_level="info",
        reload=True,
        timeout_keep_alive=600,
    )
