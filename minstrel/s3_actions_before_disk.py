import boto3
from botocore.exceptions import NoCredentialsError, PartialCredentialsError, ClientError, NoCredentialsError
import logging
from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool

import json
import os

s3 = {}
s3['minstrel-accounts'] = {}
s3['minstrel-accounts']['email'] = {}
s3['minstrel-accounts']['usernames'] = {}
s3['minstrel-accounts']['identifier'] = {}
s3['minstrel-accounts']['accounts'] = {}

s3['minstrel-data'] = {}
s3['minstrel-data']['worlds'] = {}


s3_client = boto3.client('s3')

BASE_DIR = r'C:\Users\jakvo\OneDrive\Documents\Minstrel Dev'

logger = logging.getLogger(__name__)

def get_full_path(bucket: str, prefix: str, key: str) -> str:
    """Generate the full path for the file based on bucket, prefix, and key."""
    normalized_prefix = os.path.normpath(prefix)
    full_path = os.path.join(BASE_DIR, bucket, normalized_prefix, key)
    return full_path
async def check_key(bucket: str, prefix: str, key: str) -> bool:
    """ Check if a key exists in the S3 bucket using head_object for efficiency. """
    prefix = prefix.replace('/', '')
    if s3[bucket][prefix][key]:
        return True
    else:
        return False

async def retrieve(bucket: str, prefix: str, key: str) -> str:
    """Retrieve an object from minstrel-accounts S3 bucket"""
    prefix = prefix.replace('/', '')
    return s3[bucket][prefix][key]

async def store(bucket: str, prefix: str, key: str, value: any) -> None:
    """ Add an object to minstrel-accounts S3 bucket"""
    prefix = prefix.replace('/', '')
    s3[bucket][prefix][key] = value

async def list_objects(bucket: str, prefix: str):
    """List all objects in S3 bucket under the specified prefix."""
    pass
    #different connection pool for each response api
    #prefer sending smaller s3 updates, each character or character field and not characters
    #drop all but 5000 most recent s3 backup requests if not keeping up, make sure all backed up when unload world.
