from elasticsearch import AsyncElasticsearch
import os
import json
import asyncio
from datetime import datetime
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

class PortalSearchService:
    def __init__(self):
        self.client = None
        self.index_name = "portals"
    
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
                logger.info(f"✅ Connected to Elasticsearch for portals at {es_host} (attempt {attempt + 1})")
                
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
                    logger.info(f"⏳ Waiting for Elasticsearch to start (portals)... (attempt {attempt + 1}/{max_retries})")
                    await asyncio.sleep(retry_delay)
                else:
                    logger.error(f"❌ Failed to connect to Elasticsearch for portals after {max_retries} attempts: {e}")
                    logger.info("🔄 Portal search will be disabled")
                    self.client = None
    
    async def _create_index(self):
        """Create index with fuzzy search enabled"""
        mapping = {
            "mappings": {
                "properties": {
                    "portal_id": {"type": "keyword"},
                    "world_id": {"type": "keyword"},
                    "world_name": {"type": "text"},
                    "world_creator_id": {"type": "keyword"},  # For filtering only, not returned to UI
                    "world_creator_name": {"type": "text"},
                    "creator_name": {"type": "text"},
                    "location_id": {"type": "keyword"},
                    "object_id": {"type": "keyword"},  # For object portals
                    "portal_direction": {"type": "keyword"},  # incoming or outgoing
                    "portal_type": {"type": "keyword"},  # location or object
                    "is_public": {"type": "boolean"},
                    "portal_list": {"type": "keyword"},  # List of portal IDs this portal connects to
                    "world_list": {"type": "keyword"},  # List of world IDs allowed to connect
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
    
    async def index_portal(self, portal_data: Dict, refresh: bool = False):
        if not self.client:
            logger.debug("Elasticsearch not available, skipping portal indexing")
            return
        
        try:
            await self.client.index(
                index=self.index_name,
                id=portal_data["portal_id"],
                body=portal_data,
                refresh='true' if refresh else 'false'
            )
            logger.info(f"✅ Indexed portal: {portal_data['portal_id']} (world: {portal_data.get('world_id')}, public: {portal_data.get('is_public')}, creator: {portal_data.get('world_creator_id')})")
        except Exception as e:
            logger.error(f"❌ Failed to index portal {portal_data['portal_id']}: {e}")
    
    async def search_portals(self, query: str, user_id: str, limit: int = 50, portal_direction: Optional[str] = None, portal_type: Optional[str] = None) -> Dict:
        """Simple but powerful fuzzy search for portals"""
        if not self.client:
            return {"results": [], "total": 0}
        
        logger.info(f"🔍 Searching portals: query='{query}', user_id={user_id}, direction={portal_direction}, type={portal_type}")
        
        try:
            # Build query filters: either public portals OR user's own worlds
            access_filter = {
                "bool": {
                    "should": [
                        {"term": {"is_public": True}},  # Public portals
                        {"term": {"world_creator_id": user_id}}  # User's own worlds (even if private)
                    ]
                }
            }
            
            # Add portal_direction and portal_type filters if specified
            filters = [access_filter]
            if portal_direction:
                filters.append({"term": {"portal_direction": portal_direction}})
            if portal_type:
                filters.append({"term": {"portal_type": portal_type}})
            
            if not query.strip():
                # No query - return user's portals first, then popular public portals
                search_body = {
                    "size": limit,
                    "query": {
                        "bool": {
                            "filter": filters
                        }
                    },
                    "sort": [
                        {"_score": {"order": "desc"}}
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
                                # Portal ID exact match
                                {"term": {"portal_id": {"value": query, "boost": 15}}},
                                
                                # Creator name matches
                                {"match": {"creator_name": {"query": query, "boost": 7}}},
                                {"match_phrase": {"creator_name": {"query": query, "boost": 6}}},
                                {"prefix": {"creator_name": {"value": query.lower(), "boost": 5}}},
                                
                                # World name matches
                                {"match": {"world_name": {"query": query, "boost": 6}}},
                                {"match_phrase": {"world_name": {"query": query, "boost": 5}}},
                                {"prefix": {"world_name": {"value": query.lower(), "boost": 4}}},
                                
                                # World creator name matches
                                {"match": {"world_creator_name": {"query": query, "boost": 5}}},
                                {"prefix": {"world_creator_name": {"value": query.lower(), "boost": 4}}},
                                
                                # Limited fuzzy creator match
                                {"match": {"creator_name": {"query": query, "fuzziness": 1, "boost": 3}}}
                            ],
                            "filter": filters,  # Only public portals OR user's own portals, and optionally portal_type
                            "minimum_should_match": 1
                        }
                    }
                }
            
            response = await self.client.search(index=self.index_name, body=search_body)
            
            results = []
            
            for hit in response["hits"]["hits"]:
                portal = hit["_source"]
                
                results.append({
                    "portal_id": portal["portal_id"],
                    "world_id": portal["world_id"],
                    "world_name": portal.get("world_name", "Unknown World"),
                    "world_creator_name": portal.get("world_creator_name", "Unknown"),
                    "creator_name": portal.get("creator_name", "Unknown"),
                    "location_id": portal.get("location_id", ""),
                    "object_id": portal.get("object_id", ""),
                    "portal_direction": portal.get("portal_direction"),
                    "portal_type": portal.get("portal_type", ""),
                    "portal_list": portal.get("portal_list", []),
                    "relevance_score": hit["_score"]
                })
            
            total = response["hits"]["total"]["value"]
            logger.info(f"📊 Search returned {len(results)} results out of {total} total matches")
            
            return {
                "results": results,
                "total": total
            }
        
        except Exception as e:
            logger.error(f"❌ Elasticsearch portal search failed: {e}")
            return {"results": [], "total": 0}
    
    async def get_portal_by_id(self, portal_id: str) -> Optional[Dict]:
        """Get a specific portal by its ID (direct document retrieval)"""
        if not self.client:
            logger.debug("Elasticsearch not available, cannot get portal by ID")
            return None
        
        try:
            response = await self.client.get(
                index=self.index_name,
                id=portal_id
            )
            
            if response["found"]:
                portal = response["_source"]
                return {
                    "portal_id": portal["portal_id"],
                    "world_id": portal["world_id"],
                    "world_name": portal.get("world_name", "Unknown World"),
                    "world_creator_name": portal.get("world_creator_name", "Unknown"),
                    "creator_name": portal.get("creator_name", "Unknown"),
                    "location_id": portal.get("location_id", ""),
                    "object_id": portal.get("object_id", ""),  # <-- Added this line
                    "portal_direction": portal.get("portal_direction"),
                    "portal_type": portal.get("portal_type", ""),
                    "portal_list": portal.get("portal_list", []),
                    "world_list": portal.get("world_list", []),
                }
            else:
                return None
                
        except Exception as e:
            logger.debug(f"Portal {portal_id} not found in index: {e}")
            return None
    
    async def delete_portal(self, portal_id: str):
        """Remove portal from search index"""
        if not self.client:
            return
        
        try:
            await self.client.delete(
                index=self.index_name,
                id=portal_id
            )
            logger.debug(f"✅ Deleted portal from index: {portal_id}")
        except Exception as e:
            # Check if it's a NotFoundError (404) - portal wasn't indexed, which is fine
            if "NotFoundError" in str(type(e).__name__) or "404" in str(e):
                logger.debug(f"Portal {portal_id} was not in index (already deleted or never indexed)")
            else:
                logger.error(f"❌ Failed to delete portal {portal_id} from index: {e}")
    
    async def get_world_portals_whitelisting_portal(self, world_id: str, portal_id: str) -> List[Dict]:
        """Get all portals from a specific world that whitelist a given portal_id in their portal_list
        
        Args:
            world_id: The world to search in
            portal_id: The portal_id to look for in other portals' whitelists
            
        Returns:
            List of portals that have portal_id in their portal_list (whitelist)
        """
        if not self.client:
            logger.debug("Elasticsearch not available, cannot get portals")
            return []
        
        try:
            # Use bool query to filter by both world_id AND portal_id in portal_list
            search_body = {
                "size": 1000,  # Reasonable limit for portals that match both criteria
                "query": {
                    "bool": {
                        "must": [
                            {"term": {"world_id": world_id}},
                            {"term": {"portal_list": portal_id}}  # portal_list is a keyword array field
                        ]
                    }
                }
            }
            
            response = await self.client.search(index=self.index_name, body=search_body)
            
            results = []
            for hit in response["hits"]["hits"]:
                portal = hit["_source"]
                results.append({
                    "portal_id": portal["portal_id"],
                    "world_id": portal["world_id"],
                    "world_name": portal.get("world_name", "Unknown World"),
                    "world_creator_name": portal.get("world_creator_name", "Unknown"),
                    "creator_name": portal.get("creator_name", "Unknown"),
                    "location_id": portal.get("location_id"),
                    "portal_direction": portal.get("portal_direction"),
                    "portal_type": portal.get("portal_type"),
                    "portal_list": portal.get("portal_list", []),
                    "world_list": portal.get("world_list", []),
                })
            
            return results
                
        except Exception as e:
            logger.error(f"Failed to get portals for world {world_id} whitelisting portal {portal_id}: {e}")
            return []

# Global instance
portal_search = PortalSearchService()
