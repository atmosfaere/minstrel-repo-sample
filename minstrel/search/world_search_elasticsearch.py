from elasticsearch import AsyncElasticsearch
import os
import json
import asyncio
from datetime import datetime
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

class WorldSearchService:
    def __init__(self):
        self.client = None
        self.index_name = "worlds"
    
    async def initialize(self):
        """Initialize Elasticsearch connection with retry logic"""
        es_host = os.getenv("ELASTICSEARCH_URL", "http://localhost:9200")
        
        # Wait for Elasticsearch to be ready
        max_retries = 10
        retry_delay = 2
        
        for attempt in range(max_retries):
            client = None
            try:
                # Use a simpler client configuration for better compatibility
                client = AsyncElasticsearch([es_host])
                
                # Test connection
                await client.info()
                logger.info(f"✅ Connected to Elasticsearch at {es_host} (attempt {attempt + 1})")
                
                # Success - keep the client
                self.client = client
                
                # Create index with simple mapping
                await self._create_index()
                return
                
            except Exception as e:
                # Close the failed client to prevent connection leaks
                if client:
                    await client.close()
                
                if attempt < max_retries - 1:
                    logger.info(f"⏳ Waiting for Elasticsearch to start... (attempt {attempt + 1}/{max_retries})")
                    await asyncio.sleep(retry_delay)
                else:
                    logger.error(f"❌ Failed to connect to Elasticsearch after {max_retries} attempts: {e}")
                    logger.info("🔄 World search will be disabled")
                    self.client = None
    
    async def _create_index(self):
        """Create index with fuzzy search enabled"""
        mapping = {
            "mappings": {
                "properties": {
                    "world_id": {"type": "keyword"},
                    "name": {
                        "type": "text",
                        "fields": {
                            "keyword": {"type": "keyword"},  # for exact matches
                            "suggest": {"type": "completion"}  # for autocomplete
                        }
                    },
                    "summary": {"type": "text"},
                    "creator_id": {"type": "keyword"},
                    "creator_name": {"type": "text"},
                    "server_url": {"type": "keyword"},
                    "created_at": {"type": "date"},
                    "last_active": {"type": "date"},
                    "active_users": {"type": "integer"},
                    "total_visits": {"type": "integer"},
                    "is_public": {"type": "boolean"},
                    "tags": {"type": "keyword"}
                }
            }
        }
        
        # Create index if it doesn't exist
        try:
            if not await self.client.indices.exists(index=self.index_name):
                await self.client.indices.create(index=self.index_name, body=mapping)
                logger.info(f"✅ Created Elasticsearch index: {self.index_name}")
            else:
                logger.info(f"✅ Elasticsearch index exists: {self.index_name}")
        except Exception as e:
            logger.error(f"❌ Failed to create Elasticsearch index: {e}")
    
    async def index_world(self, world_data: Dict):
        """Add/update world in search index"""
        if not self.client:
            logger.debug("Elasticsearch not available, skipping world indexing")
            return
        
        try:
            await self.client.index(
                index=self.index_name,
                id=world_data["world_id"],
                body=world_data
            )
            logger.debug(f"✅ Indexed world: {world_data['name']} ({world_data['world_id']})")
        except Exception as e:
            logger.error(f"❌ Failed to index world {world_data['world_id']}: {e}")
    
    async def search_worlds(self, query: str, user_id: str, limit: int = 50) -> Dict:
        """Simple but powerful fuzzy search"""
        if not self.client:
            return {"results": [], "total": 0}
        
        try:
            # Build query filters: either public worlds OR user's own worlds
            access_filter = {
                "bool": {
                    "should": [
                        {"term": {"is_public": True}},  # Public worlds
                        {"term": {"creator_id": user_id}}  # User's own worlds (public or private)
                    ]
                }
            }
            
            if not query.strip():
                # No query - return user's worlds first, then popular public worlds
                search_body = {
                    "size": limit,
                    "query": {
                        "bool": {
                            "filter": [access_filter]
                        }
                    },
                    "sort": [
                        {"_score": {"order": "desc"}},
                        {"total_visits": {"order": "desc"}},
                        {"last_active": {"order": "desc"}}
                    ]
                }
            else:
                # Stricter search query for better relevance
                search_body = {
                    "size": limit,
                    "min_score": 0.5,  # Only return results with decent relevance score
                    "query": {
                        "bool": {
                            "should": [
                                # Exact name match (highest score)
                                {"match": {"name": {"query": query, "boost": 10}}},
                                
                                # Phrase match in name (exact phrase)
                                {"match_phrase": {"name": {"query": query, "boost": 8}}},
                                
                                # Creator name matches
                                {"match": {"creator_name": {"query": query, "boost": 7}}},
                                {"match_phrase": {"creator_name": {"query": query, "boost": 6}}},
                                {"prefix": {"creator_name": {"value": query.lower(), "boost": 5}}},
                                
                                # Prefix match for world name (for autocomplete feel)
                                {"prefix": {"name": {"value": query.lower(), "boost": 6}}},
                                
                                # Limited fuzzy name match (max 1 edit distance)
                                {"match": {"name": {"query": query, "fuzziness": 1, "boost": 4}}},
                                
                                # Limited fuzzy creator match
                                {"match": {"creator_name": {"query": query, "fuzziness": 1, "boost": 3}}},
                                
                                # Summary phrase match
                                {"match_phrase": {"summary": {"query": query, "boost": 3}}},
                                
                                # Summary word match
                                {"match": {"summary": {"query": query, "boost": 2}}}
                            ],
                            "filter": [access_filter],  # Only public worlds OR user's own worlds
                            "minimum_should_match": 1
                        }
                    },
                    # Boost user's own worlds
                    "rescore": {
                        "window_size": 100,
                        "query": {
                            "rescore_query": {
                                "bool": {
                                    "should": [
                                        {"term": {"creator_id": {"value": user_id, "boost": 10}}}
                                    ]
                                }
                            }
                        }
                    }
                }
            
            response = await self.client.search(index=self.index_name, body=search_body)
            
            results = []
            for hit in response["hits"]["hits"]:
                world = hit["_source"]
                results.append({
                    "world_id": world["world_id"],
                    "name": world["name"],
                    "summary": world.get("summary", ""),
                    "server_url": world["server_url"],
                    "creator_name": world.get("creator_name", "Unknown"),
                    "is_owned": world["creator_id"] == user_id,
                    "active_users": world["active_users"],
                    "total_visits": world["total_visits"],
                    "relevance_score": hit["_score"],
                    "last_active": world["last_active"]
                })
            
            return {
                "results": results,
                "total": response["hits"]["total"]["value"]
            }
        
        except Exception as e:
            logger.error(f"❌ Elasticsearch search failed: {e}")
            return {"results": [], "total": 0}
    
    async def get_suggestions(self, query: str, limit: int = 10) -> List[str]:
        """Autocomplete suggestions"""
        if not self.client:
            return []
        
        try:
            search_body = {
                "suggest": {
                    "world_suggest": {
                        "prefix": query,
                        "completion": {
                            "field": "name.suggest",
                            "size": limit
                        }
                    }
                }
            }
            
            response = await self.client.search(index=self.index_name, body=search_body)
            return [option["text"] for option in response["suggest"]["world_suggest"][0]["options"]]
        except Exception as e:
            logger.error(f"❌ Elasticsearch suggestions failed: {e}")
            return []
    
    async def update_world_activity(self, world_id: str, active_users: int):
        """Update world activity metrics"""
        if not self.client:
            return
        
        try:
            await self.client.update(
                index=self.index_name,
                id=world_id,
                body={
                    "doc": {
                        "active_users": active_users,
                        "last_active": datetime.now().isoformat()
                    }
                }
            )
        except Exception as e:
            logger.error(f"❌ Failed to update world activity {world_id}: {e}")

# Global instance
world_search = WorldSearchService() 