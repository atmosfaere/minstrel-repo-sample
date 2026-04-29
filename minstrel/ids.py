import time
import secrets
import random
import re

def get_time_bytes(include_time):
    if include_time:
        # Get the current time from time.time() and convert to microseconds
        current_microseconds = int(time.time() * 1000000)
        # Not practically necessary, but make sure time doesn't exceed 9 bytes
        # if code is still running in the far future
        masked_time = current_microseconds & ((1 << 64) - 1)
        return masked_time.to_bytes(8, 'big')
    else:
        return secrets.randbits(64).to_bytes(8, 'big')

def create_id(include_time, user_id=None):
    """Creates a 256 bit (32 byte) ID
    including time stamp is optional (creation date of object),
    including user_id of the creator is optional (creator attribution).
    """
    time_flag = bytes([1]) if include_time else bytes([0])
    time_portion = get_time_bytes(include_time)
    random_bits = secrets.token_bytes(6)
    if user_id is not None:
        creator_flag = bytes([1])
        user_portion = bytes.fromhex(user_id) if isinstance(user_id, str) else user_id
    else:
        creator_flag = bytes([0])
        user_portion = secrets.token_bytes(16)
    id = time_flag + time_portion + random_bits + creator_flag + user_portion
    return id.hex()

def create_character_id(user_id=None):
    return create_id(True, user_id)

def create_location_id(user_id=None):
    return create_id(True, user_id)

def create_object_id(include_time, user_id=None):
    return create_id(include_time, user_id)

def create_world_id(user_id=None):
    return create_id(True, user_id)

def create_portal_id(user_id=None):
    portal_id = random_base62_string(length=18)
    return hyphenate_portal_id(portal_id)
    
def create_user_id():
    time_portion = get_time_bytes(True)
    random_bits = secrets.token_bytes(8)
    user_id = time_portion + random_bits
    return user_id.hex()

def hyphenate_id(hex_id):
    if len(hex_id) != 64:
        raise ValueError("The input must be a 64-character hexadecimal string.")

    parts = [
        hex_id[:2],
        hex_id[2:20],
        hex_id[20:30],
        hex_id[30:32],
        hex_id[32:]
    ]
    hyphenated_id = '-'.join(parts)

    return hyphenated_id

def hyphenate_portal_id(portal_id):
    parts = [
        portal_id[:5],
        portal_id[5:]
    ]
    return '-'.join(parts)


def random_base62_string(length=10):
    characters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    return ''.join(random.choice(characters) for _ in range(length))

def get_player_character_tag():
    tag_id = "p" + random_base62_string(length=10)
    return tag_id

def get_character_tag():
    tag_id = "c" + random_base62_string(length=10)
    return tag_id

def get_location_tag():
    tag_id = "l" + random_base62_string(length=10)
    return tag_id

def get_party_tag():
    tag_id = "r" + random_base62_string(length=10)
    return tag_id

# object tags

#miscellaneous object
def get_object_tag():
    tag_id = "o" + random_base62_string(length=10)
    return tag_id

def get_document_tag():
    tag_id = "d" + random_base62_string(length=10)
    return tag_id

def get_container_tag():
    tag_id = "s" + random_base62_string(length = 10)
    return tag_id

def get_clothing_tag():
    tag_id = "w" + random_base62_string(length = 10)
    return tag_id

def get_tool_tag():
    tag_id = "u" + random_base62_string(length = 10)
    return tag_id

def get_money_tag():
    tag_id = "m" + random_base62_string(length = 10)
    return tag_id

bytes_representation = get_time_bytes(True).hex()
print(bytes_representation)
print(create_user_id())
print(create_object_id(True, bytes.fromhex(create_user_id())))
print(create_object_id(True))
print(create_object_id(False))
print(create_world_id(bytes.fromhex(create_user_id())))
print(create_world_id(create_user_id()))
print(create_character_id(bytes.fromhex(create_user_id())))
print(hyphenate_id(create_character_id(bytes.fromhex(create_user_id()))))
print(get_party_tag())

#microseconds 8 bytes = 584,000 years before repeats

#not including creator or creation time vastly reduces chances of
#collision for creating many objects at once

import math

def calculate_collision_probability(n, base, length):
    m = base ** length
    probability = 1 - math.exp(-(n**2) / (2 * m))
    return probability

def int_to_base62(num, min_length=5):
    characters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    base = 62
    result = []

    # Handle the conversion from base-10 to base-62
    if num == 0:
        result.append('0')
    else:
        while num > 0:
            remainder = num % base
            result.append(characters[remainder])
            num = num // base

    output = ''.join(reversed(result))
    # Pad with '0' to make the string at least 5 characters
    if len(output) < min_length:
        output = '0' * (min_length - len(output)) + output

    return output

'''
n = 7 * 10 ** 12
base = 62
length = 18
collision_probability = calculate_collision_probability(n, base, length)
print(f"The probability of at least one collision is approximately {collision_probability:.10f}")
print(1/collision_probability)
portal = random_base62_string(length=length)
print(portal)
print(hyphenate_portal_id(portal))
'''