import os
from dotenv import load_dotenv

# Load .env.local if running locally, otherwise .env
env_file = '.env.local' if os.getenv('ENV') == 'local' else '.env'
load_dotenv(env_file)

mongo_uri = os.getenv('MONGO_URI')
db_name = os.getenv('DB_NAME', 'stocks_data')