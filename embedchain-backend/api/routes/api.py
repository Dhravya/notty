from embedchain import App
from fastapi import APIRouter, responses
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv(".env")

router = APIRouter()

# App config using OpenAI gpt-3.5-turbo-1106 as LLM
app_config = {
    "app": {
        "config": {
            "id": "notty-embeddings-app",
        }
    },
    "llm": {
        "provider": "openai",
        "config": {
            "model": "gpt-3.5-turbo-1106",
        },
    },
}

# Uncomment this configuration to use Mistral as LLM
# app_config = {
#     "app": {
#         "config": {
#             "id": "embedchain-opensource-app"
#         }
#     },
#     "llm": {
#         "provider": "huggingface",
#         "config": {
#             "model": "mistralai/Mixtral-8x7B-Instruct-v0.1",
#             "temperature": 0.1,
#             "max_tokens": 250,
#             "top_p": 0.1
#         }
#     },
#     "embedder": {
#         "provider": "huggingface",
#         "config": {
#             "model": "sentence-transformers/all-mpnet-base-v2"
#         }
#     }
# }


ec_app = App.from_config(config=app_config)


class SourceModel(BaseModel):
    source: str
    user: str
    note_id: str


class QuestionModel(BaseModel):
    question: str
    session_id: str


@router.post("/api/v1/add")
async def add_source(source_model: SourceModel):
    """
    Adds a new source to the Embedchain app.
    Expects a JSON with a "source" key.
    """
    source = source_model.source

    ids = ec_app.db.get()

    doc_hash = None
    for meta_data in ids["metadatas"]:
        if (
            meta_data["note_id"] == source_model.note_id
            and meta_data["user"] == source_model.user
        ):
            doc_hash = meta_data["hash"]
            break

    if doc_hash:
        ec_app.delete(doc_hash)

    try:
        ec_app.add(
            source,
            metadata={"user": source_model.user, "note_id": source_model.note_id},
        )
        return {"message": f"Source '{source}' added successfully."}
    except Exception as e:
        response = f"An error occurred: Error message: {str(e)}."
        return {"message": response}


@router.get("/api/v1/search")
async def handle_search(query: str, user_id: str):
    """
    Handles a chat request to the Embedchain app.
    Accepts 'query' and 'session_id' as query parameters.
    """
    try:
        response = ec_app.query(query, citations=True, where={"user": {"$eq": user_id}})
    except Exception as e:
        response = f"An error occurred: Error message: {str(e)}"  # noqa:E501

    return response


@router.get("/")
async def root():
    print("hi")
    return responses.RedirectResponse(url="/docs")