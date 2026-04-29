#import boto3
#from botocore.exceptions import NoCredentialsError, PartialCredentialsError, ClientError, NoCredentialsError
import logging
from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool
import json
import os
import shutil
import stat

from .data_store import backup_queue


#testing store nested dict
import asyncio
from collections import defaultdict
'''
s3 = {}
s3['minstrel-accounts'] = {}
s3['minstrel-accounts']['email'] = {}
s3['minstrel-accounts']['usernames'] = {}
s3['minstrel-accounts']['identifier'] = {}
s3['minstrel-accounts']['accounts'] = {}

s3['minstrel-data'] = {}
s3['minstrel-data']['worlds'] = {}
'''

# Lock dictionary to prevent concurrent replace operations on the same path
_replace_locks = defaultdict(asyncio.Lock)

#s3_client = boto3.client('s3')

#BASE_DIR = r'C:\Users\jakvo\OneDrive\Documents\Minstrel Dev'
# Set BASE_DIR to be at the same level as the project folder
BASE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), 'minstrel_data')

logger = logging.getLogger(__name__)

async def ensure_dir(path: str):
    """Ensure that the directory exists."""
    # Handle Windows long path limitation by using \\?\ prefix
    if os.name == 'nt' and not path.startswith('\\\\?\\') and len(path) > 200:
        path = '\\\\?\\' + os.path.abspath(path)
    os.makedirs(path, exist_ok=True)
def get_full_path(bucket: str, prefix: str, key: str) -> str:
    """Generate the full path for the file based on bucket, prefix, and key."""
    normalized_prefix = os.path.normpath(prefix)
    full_path = os.path.join(BASE_DIR, bucket, normalized_prefix, key)
    return full_path

async def check_key(bucket: str, prefix: str, key: str) -> bool:
    """ Check if a key exists in the S3 bucket using head_object for efficiency. """
    full_path = get_full_path(bucket, prefix, key)
    
    # Handle Windows long path limitation
    check_path = full_path
    if os.name == 'nt' and not full_path.startswith('\\\\?\\') and len(full_path) > 200:
        check_path = '\\\\?\\' + os.path.abspath(full_path)
    
    return os.path.exists(check_path)

async def retrieve(bucket: str, prefix: str, key: str) -> str:
    """Retrieve content from a file emulating an S3 object."""
    full_path = get_full_path(bucket, prefix, key)
    
    # Handle Windows long path limitation
    read_path = full_path
    if os.name == 'nt' and not full_path.startswith('\\\\?\\') and len(full_path) > 200:
        read_path = '\\\\?\\' + os.path.abspath(full_path)
        logger.debug(f"retrieve: Using long path for {key} (length: {len(full_path)})")
    
    try:
        # Open the file in a threadpool and read its contents
        file = await run_in_threadpool(open, read_path, 'r', encoding='utf-8')
        try:
            content = await run_in_threadpool(file.read)
        finally:
            file.close()
        return json.loads(content)
    except FileNotFoundError:
        logger.error(f"File not found: {full_path} (read_path: {read_path})")
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        logger.error(f"Error reading file {full_path}: {e}")
        raise

async def store(bucket: str, prefix: str, key: str, value: any) -> None:
    """Store data into a file emulating an S3 object."""
    full_path = get_full_path(bucket, prefix, key)
    await ensure_dir(os.path.dirname(full_path))
    #str(value) didn't leave quotes around string, loaded as int
    #content = json.dumps(value) if isinstance(value, (dict, list)) else str(value)
    content = json.dumps(value)
    
    # Handle Windows long path limitation
    write_path = full_path
    if os.name == 'nt' and not full_path.startswith('\\\\?\\') and len(full_path) > 200:
        write_path = '\\\\?\\' + os.path.abspath(full_path)
    
    with open(write_path, 'w', encoding='utf-8') as file:
        file.write(content)
        
async def list_objects(bucket: str, prefix: str):
    """List all objects in S3 bucket under the specified prefix."""
    bucket_path = os.path.join(BASE_DIR, bucket)
    # Normalize the prefix to use OS-specific path separators
    prefix_normalized = prefix.replace('/', os.sep)
    full_path = os.path.join(bucket_path, prefix_normalized)
    
    # Handle Windows long path limitation for os.walk
    # Always use long path prefix on Windows to handle deeply nested directories
    # that may use 8.3 short names due to path length limitations
    walk_path = full_path
    if os.name == 'nt' and not full_path.startswith('\\\\?\\'):
        walk_path = '\\\\?\\' + os.path.abspath(full_path)
    
    try:
        paths = []
        objects = []
        dir_count = 0
        file_count = 0
        error_count = 0
        
        for dirpath, dirnames, filenames in os.walk(walk_path, onerror=lambda e: logger.error(f"os.walk error: {e}")):
            dir_count += 1
            file_count += len(filenames)
            
            for filename in filenames:
                try:
                    file_path = os.path.join(dirpath, filename)
                    
                    # On Windows, remove the \\?\ prefix for relative path calculation
                    if os.name == 'nt':
                        # Remove the \\?\ prefix (4 characters)
                        clean_file_path = file_path[4:] if file_path.startswith('\\\\?\\') else file_path
                        clean_bucket_path = bucket_path
                    else:
                        clean_file_path = file_path
                        clean_bucket_path = bucket_path
                    
                    # Ensure the Key is relative to the bucket_path, not BASE_DIR
                    key = os.path.relpath(clean_file_path, start=clean_bucket_path).replace('\\', '/')
                    paths.append(key)
                    objects.append({
                        'Key': key,
                        'Size': os.path.getsize(file_path),
                        'LastModified': os.path.getmtime(file_path),
                    })
                except Exception as e:
                    error_count += 1
                    logger.error(f"Error processing file {filename} in {dirpath}: {e}")
        
        logger.info(f"list_objects: Walked {dir_count} directories, found {file_count} files for prefix {prefix}")
        if error_count > 0:
            logger.warning(f"list_objects: Encountered {error_count} errors while processing files")
        
        #return {'Contents': objects}
        return paths
    except FileNotFoundError:
        logger.error(f"Directory not found: {full_path}")
        raise HTTPException(status_code=404, detail="Prefix not found")
    except Exception as e:
        logger.error(f"Error listing objects in {full_path}: {e}")
        raise


#temporary for use
async def delete_path(bucket: str, prefix: str, key: str):
    """
    Deletes a file or directory at the given S3-style path (bucket/prefix/key).
    Automatically constructs the full local path from BASE_DIR.
    """

    def on_rm_error(func, path, exc):
        # Handle read-only files (esp. on Windows)
        # Check if path still exists before trying to modify it
        if os.path.exists(path):
            try:
                os.chmod(path, stat.S_IWRITE)
                func(path)
            except Exception as e:
                logger.warning(f"Could not modify permissions or delete {path}: {e}")
        else:
            logger.warning(f"Path no longer exists during deletion: {path}")

    path = get_full_path(bucket, prefix, key)
    
    # Handle Windows long path limitation
    rm_path = path
    if os.name == 'nt' and not path.startswith('\\\\?\\') and len(path) > 200:
        rm_path = '\\\\?\\' + os.path.abspath(path)

    if not os.path.exists(rm_path):
        logger.warning(f"Path does not exist, nothing to delete: {path}")
        return

    if os.path.isfile(rm_path) or os.path.islink(rm_path):
        os.remove(rm_path)
        logger.info(f"File deleted: {path}")
    elif os.path.isdir(rm_path):
        shutil.rmtree(rm_path, onexc=on_rm_error)
        logger.info(f"Directory deleted: {path}")
    else:
        raise OSError(f"Unknown file type: {path}")

async def queue_backup(bucket: str, prefix: str, key: str, value: any):
    #full_prefix = get_full_path(bucket, prefix, key)
    backup_queue.append((bucket, prefix, key, value))

async def store_nested_dict(bucket: str, prefix: str, dictionary: dict):
    """
    Recursively traverses a dictionary and calls store on each non-dictionary value. Call initially with prefix = "".
    """
    for key, value in dictionary.items():

        if isinstance(value, dict):
            # Update the prefix to include the current key as part of the path
            current_prefix = f"{prefix}/{key}" if prefix else key  # Avoid leading slash if prefix is empty
            await store_nested_dict(bucket, current_prefix, value)
        else:
            await store(bucket, prefix, key, value)

async def replace_nested_dict(bucket: str, prefix: str, dictionary: dict):
    """
    Deletes the entire directory tree at prefix, then stores the dictionary.
    Ensures disk matches the provided dictionary state exactly.
    Uses a lock to prevent concurrent operations on the same path.
    """
    # Create a unique key for this path to use for locking
    lock_key = f"{bucket}/{prefix}"
    
    # Acquire lock for this specific path
    async with _replace_locks[lock_key]:
        if prefix:
            try:
                # Construct full path to the directory
                normalized_prefix = os.path.normpath(prefix)
                dir_path = os.path.join(BASE_DIR, bucket, normalized_prefix)
                
                logger.info(f"replace_nested_dict: prefix={prefix}, dir_path={dir_path}, exists={os.path.exists(dir_path)}")
                
                if os.path.exists(dir_path):
                    def on_rm_error(func, path, exc):
                        # Handle read-only files (esp. on Windows)
                        # Also handle long paths on Windows
                        if os.name == 'nt' and not path.startswith('\\\\?\\') and len(path) > 200:
                            path = '\\\\?\\' + os.path.abspath(path)
                        os.chmod(path, stat.S_IWRITE)
                        func(path)
                    
                    # Handle Windows long path limitation
                    rm_path = dir_path
                    if os.name == 'nt' and not dir_path.startswith('\\\\?\\') and len(dir_path) > 200:
                        rm_path = '\\\\?\\' + os.path.abspath(dir_path)
                    
                    # attempt fix shut down error, Use Windows rmdir/del commands for better long path support, 
                    #start
                    if os.name == 'nt':
                        import subprocess
                        # Use rmdir /s /q for recursive quiet deletion
                        result = subprocess.run(['cmd', '/c', 'rmdir', '/s', '/q', rm_path], capture_output=True, text=True)
                        if result.returncode != 0:
                            raise Exception(f"rmdir failed: {result.stderr}")
                    else:#end
                        # shutil.rmtree removes the entire directory tree recursively
                        shutil.rmtree(rm_path, onexc=on_rm_error)
                    logger.info(f"Deleted directory tree before storing: {prefix} (full path: {dir_path})")
            except Exception as e:
                logger.warning(f"Error deleting directory {prefix}: {e} When replacing nested_dict")
        
        # Now store the current state
        await store_nested_dict(bucket, prefix, dictionary)

def load_nested_dict(paths, data, root_dict):
    """Load nested dictionary from a list of keys and corresponding data, splitting keys by '/' and removing the first segment."""
    for path, item in zip(paths, data):
        '''
        try:
            parsed_data = json.loads(item)  # Parse JSON data if possible
        except json.JSONDecodeError:
            parsed_data = item  # Use the original item if it's not JSON'''

        # Remove the first segment up to the first slash
        sub_path = '/'.join(path.split('/')[1:])

        key_parts = sub_path.split('/')  # Split the remaining path to handle nested dictionaries
        current_level = root_dict  # Start from the root level

        for part in key_parts[:-1]:  # Navigate/create nested structure
            if part not in current_level:
                current_level[part] = {}
            current_level = current_level[part]

        final_key = key_parts[-1]
        if final_key.endswith('.json'):
            final_key = final_key[:-5]  # Optional: Remove '.json' from the key

        current_level[final_key] = item # Assign parsed data to the correct key

        #root_dict[world_id] = current_level
    #print(root_dict)

async def get_username(user_id):
    prefix = f"accounts/{user_id}"
    data = await retrieve("minstrel-accounts", prefix, "account_details")
    #account_details = json.loads(data)
    #return account_details['username']
    return data['username']


# different connection pool for each response api
# prefer sending smaller s3 updates, each character or character field and not characters
# drop all but 5000 most recent s3 backup requests if not keeping up, make sure all backed up when unload world.
