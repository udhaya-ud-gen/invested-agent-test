import os

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Load .env from server directory (parent of app/)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

MONGODB_URI = os.getenv("MONGODBWEB_URI")
DB_NAME = os.getenv("DB_NAME", "stock_play_admin")

_client = AsyncIOMotorClient(
    MONGODB_URI,
    serverSelectionTimeoutMS=int(os.getenv("MONGODB_SERVER_SELECTION_TIMEOUT_MS", "5000")),
    connectTimeoutMS=int(os.getenv("MONGODB_CONNECT_TIMEOUT_MS", "5000")),
    socketTimeoutMS=int(os.getenv("MONGODB_SOCKET_TIMEOUT_MS", "10000")),
)
_db = _client[DB_NAME]
_auth_service_db = _client[os.getenv("AUTH_SERVICE_DB_NAME", "auth_service")]


def get_database():
    return _db


def get_auth_service_database():
    return _auth_service_db

async def ping_db():
    return await _db.command("ping")
