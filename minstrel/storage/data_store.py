from fastapi import WebSocket
from typing import Dict, List
import os

from world.world_models import WorldsDict

'''For working data stored in ram, backed up to s3 on the fly, large worlds may be moved to disk with caching of most recent and most active items'''

#worlds = WorldsDict({})
worlds: WorldsDict = WorldsDict({})

chats = {}
users = {}
simulated_characters = {}
#for searching
registered_users = []

event_queue = []
backup_queue = []

notes = {}


#simulated_characters/id/world
#simulated_characters/id/conversation_history
#simulated_characters/id/info#api #type or mode = adventure or persona
#simulated_characters/id/character
#simulated_characters/id/friends

#rooms = {}

api_keys = {
    "openai": os.getenv("OPENAI_API_KEY"),
    "mistral": os.getenv("MISTRAL_API_KEY"),
    "groq": os.getenv("GROQ_API_KEY"),
    "monolyth": os.getenv("MONOLYTH_API_KEY"),
    "deepinfra": os.getenv("DEEPINFRA_API_KEY"),
    "openrouter": os.getenv("OPENROUTER_API_KEY"),
    "home_server": None
}

api_urls = {
    "openai": "https://api.openai.com/v1/chat/completions",
    "mistral": "https://api.mistral.ai/v1/chat/completions",
    "groq": "https://api.groq.com/openai/v1/chat/completions",
    "monolyth": "https://api.monolyth.ai/v1/chat/completions",
    "deepinfra": "https://api.deepinfra.com/v1/openai/chat/completions",
    "openrouter": "https://openrouter.ai/api/v1/chat/completions",
    "home_server": "http://209.33.230.208:5000/stream"
}

models = {"deepinfra": ["meta-llama/Llama-3.3-70B-Instruct", "meta-llama/Llama-3.3-70B-Instruct-Turbo", "meta-llama/Meta-Llama-3.1-70B-Instruct", "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
                        "meta-llama/Meta-Llama-3.1-8B-Instruct", "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", "meta-llama/Meta-Llama-3.1-405B-Instruct",
                        "NousResearch/Hermes-3-Llama-3.1-405B", "mistralai/Mistral-Small-24B-Instruct-2501", "google/gemma-2-9b-it",
                        "google/gemma-2-27b-it", "google/gemma-3-27b-it""mistralai/Mistral-Small-24B-Instruct-2501"],
          "openrouter": ["openai/gpt-4o-mini", "qwen/qwen3-32b", "openai/gpt-4.1-mini", "mistralai/mistral-large-2411", "mistralai/mistral-medium-3-24b-instruct", "google/gemini-2.5-flash", "google/gemini-2.5-pro-preview", "anthropic/claude-sonnet-4", "google/gemma-3-27b-it", "arliai/qwq-32b-arliai-rpr-v1", "deepseek/deepseek-r1", "deepseek/deepseek-chat-v3-0324", "deepseek/deepseek-v3.2", "nvidia/llama-3.1-nemotron-ultra-253b-v1"]}
# mistral small is cheapest then gemma 3 27b it
#"x-ai/grok-3-mini" pretty good. $.50 output much better than 4o-mini.

# try deepseek r1, v3 storytelling
# mistral medium is 2$ usable, maybe use something else for chain of thought.
#mistral large is $6, good experience so far. needs to be instructed not to leave upcoming moments without just including them. end of newt race.


# gemini 2.5 flash bad json in chain_of_thought, added text to the json
# good language but can be really dumb.

#gemini 2.5 pro is really slow at background processing probably because of thinking

#4o mini adds details not necessarily estabilished to summaries
#4o mini gives reflection as big nested json
#4o mini is significantly cheaper thank grok mini / flash 2.5 for background because it thinks.
#4o mini has been adding already existing locations (may be precedent, would have to test more)
#4o mini's summaries are confused 

#llama 3 adds annoying descriptions like thick with tension constantly.
#qwq 32 not good at writing
#qwen 32 ok, slow, add no think. Writing is ok but repeats itself exactly in somewhat similar situations.
# gemma 3 included input data in response  

#default_model = "llama-3.3-70b-versatile"
#default_model = "meta-llama/Llama-3.3-70B-Instruct-Turbo"
#default_model = "meta-llama/Llama-3.3-70B-Instruct"]

#try gemma 3 again?
# try 4.5 and 4.5 air, comparable cost to grok 3 mini
# try gpt-oss-120b, at least background
#try qwen/qwen3-235b-a22b-2507 (instruct/code) and base
default_provider = 'openrouter'
default_url = api_urls[default_provider]
default_key = api_keys[default_provider]
default_model = "anthropic/claude-3.7-sonnet"
'''
default_provider = 'openrouter'
default_url = api_urls[default_provider]
default_key = api_keys[default_provider]
default_model = "x-ai/grok-3-mini"
'''

"""
default_provider = 'deepinfra'
default_url = api_urls[default_provider]
default_key = api_keys[default_provider]
default_model = "google/gemini-2.5-pro"""

'''
background_provider = 'deepinfra'
background_url = api_urls[background_provider]
background_key = api_keys[background_provider]
background_model = "meta-llama/Llama-3.3-70B-Instruct"'''


"""
background_provider = 'groq'
background_url = api_urls[background_provider]
background_key = api_keys[background_provider]
background_model = "llama-3.3-70b-versatile"""

background_provider = 'openrouter'
background_url = api_urls[background_provider]
background_key = api_keys[background_provider]
background_model = "meta-llama/llama-3.3-70b-instruct"
#4o mini vs minstrel large vs medium vs gemma 3 27b minstrel speed varies.
# was using, background_model = "openai/gpt-4.1-mini"
#background_model = "qwen/qwen3.5-27b"
background_model = "openai/gpt-oss-120b"
#"openai/gpt-4.1-mini"

image_models = ["https://api.segmind.com/v1/sdxl-img2img", "fal-ai/flux/dev/image-to-image"]
#sdxl inpaint https://fal.ai/models/fal-ai/inpaint/playground
#fal-ai/fast-sdxl
#fal-ai/lora text to image
#replicate lucataco/sdxl-inpainting:a5b13068cc81a89a4fbeefeccc774869fcb34df4dbc92c1555e0f2771d49dde7
#sdxl img2img with lora, https://fal.ai/models/fal-ai/lora/image-to-image

context_length = 8000 #tokens
conserve_ratio = 4/5
char_per_token = 4
context_length_char = int(context_length * char_per_token * conserve_ratio) #use 4/5 of allotted context
context_length_char = 12000
