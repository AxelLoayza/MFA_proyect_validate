"""
MongoDB connection and database management
"""
import logging
from typing import Optional
from pymongo import MongoClient, ASCENDING
from pymongo.errors import ServerSelectionTimeoutError, ConnectionFailure
from contextlib import contextmanager

from .config import settings

logger = logging.getLogger(__name__)


class MongoDBConnection:
    """
    MongoDB connection manager
    Handles connection, disconnection, and basic operations
    """
    
    def __init__(self):
        self.client: Optional[MongoClient] = None
        self.db = None
        self.is_connected = False
    
    def connect(self) -> bool:
        """
        Establish connection to MongoDB
        
        Returns:
            bool: True if connection successful, False otherwise
        """
        try:
            logger.info(f"Connecting to MongoDB at {settings.mongo_uri}")
            
            self.client = MongoClient(
                settings.mongo_uri,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=10000,
                socketTimeoutMS=5000,
            )
            
            # Verify connection
            self.client.admin.command('ping')
            
            self.db = self.client[settings.mongo_db_name]
            self.is_connected = True
            
            logger.info(f"✓ Successfully connected to MongoDB database: {settings.mongo_db_name}")
            
            # Initialize collections and indexes
            self._initialize_collections()
            
            return True
            
        except (ServerSelectionTimeoutError, ConnectionFailure) as e:
            logger.error(f"✗ Failed to connect to MongoDB: {str(e)}")
            self.is_connected = False
            return False
        except Exception as e:
            logger.error(f"✗ Unexpected error connecting to MongoDB: {str(e)}")
            self.is_connected = False
            return False
    
    def disconnect(self):
        """
        Close MongoDB connection
        """
        if self.client:
            self.client.close()
            self.is_connected = False
            logger.info("Disconnected from MongoDB")
    
    def _initialize_collections(self):
        """
        Initialize collections and create indexes if they don't exist
        """
        try:
            # Get collection names
            collections = self.db.list_collection_names()
            
            # Create biometric profiles collection if not exists
            if settings.mongo_collection_profiles not in collections:
                self.db.create_collection(settings.mongo_collection_profiles)
                logger.info(f"Created collection: {settings.mongo_collection_profiles}")
            
            # Create audit logs collection if not exists
            if settings.mongo_collection_logs not in collections:
                self.db.create_collection(settings.mongo_collection_logs)
                logger.info(f"Created collection: {settings.mongo_collection_logs}")
            
            # Create indexes for biometric profiles
            profiles_collection = self.db[settings.mongo_collection_profiles]
            profiles_collection.create_index("user_id", unique=False)
            profiles_collection.create_index("tenant_id", unique=False)
            profiles_collection.create_index("created_at", unique=False)
            profiles_collection.create_index([("user_id", ASCENDING), ("tenant_id", ASCENDING)])
            logger.info(f"Indexes created for {settings.mongo_collection_profiles}")
            
            # Create indexes for audit logs
            logs_collection = self.db[settings.mongo_collection_logs]
            logs_collection.create_index("user_id", unique=False)
            logs_collection.create_index("timestamp", unique=False)
            logs_collection.create_index("action", unique=False)
            logger.info(f"Indexes created for {settings.mongo_collection_logs}")
            
        except Exception as e:
            logger.error(f"Error initializing collections: {str(e)}")
    
    def get_collection(self, collection_name: str):
        """
        Get a MongoDB collection
        
        Args:
            collection_name: Name of the collection
            
        Returns:
            MongoDB collection object
        """
        if not self.is_connected or not self.db:
            raise RuntimeError("MongoDB connection not established")
        return self.db[collection_name]
    
    def get_profiles_collection(self):
        """Get biometric profiles collection"""
        return self.get_collection(settings.mongo_collection_profiles)
    
    def get_logs_collection(self):
        """Get audit logs collection"""
        return self.get_collection(settings.mongo_collection_logs)
    
    def health_check(self) -> bool:
        """
        Check if MongoDB connection is alive
        
        Returns:
            bool: True if connected and responsive, False otherwise
        """
        try:
            if self.client and self.is_connected:
                self.client.admin.command('ping')
                return True
            return False
        except Exception as e:
            logger.error(f"MongoDB health check failed: {str(e)}")
            return False


# Global database instance
db_connection = MongoDBConnection()


def get_db() -> MongoDBConnection:
    """
    Get the MongoDB connection instance
    
    Returns:
        MongoDBConnection: Global database connection
    """
    return db_connection


@contextmanager
def get_profiles_collection():
    """
    Context manager to get biometric profiles collection
    
    Yields:
        MongoDB collection
    """
    try:
        yield db_connection.get_profiles_collection()
    except Exception as e:
        logger.error(f"Error accessing profiles collection: {str(e)}")
        raise


@contextmanager
def get_logs_collection():
    """
    Context manager to get audit logs collection
    
    Yields:
        MongoDB collection
    """
    try:
        yield db_connection.get_logs_collection()
    except Exception as e:
        logger.error(f"Error accessing logs collection: {str(e)}")
        raise
