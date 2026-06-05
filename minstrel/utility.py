import regex
import json
import re
import logging
from datetime import datetime
from networking.http_client import http_client
from storage.data_store import default_key, default_url, default_model, background_key, background_model, background_url

logger = logging.getLogger(__name__)


def old_extract_json(text):
    print("extracting json: ", text)
    # Remove all backticks and smart quotes from the text
    text = text.replace("`", "").replace('"', '"').replace('"', '"').replace("'", "'").replace("'", "'")
    text = re.sub(r'\\"', '', text)
    # Pattern to match JSON object or array, including nested structures
    pattern = r'(\{(?:[^{}]|(?R))*\}|\[(?:[^\[\]]|(?R))*\])'

    # Search for the pattern in the text
    match = regex.search(pattern, text, regex.DOTALL)
    #match = regex.search(pattern, text)

    if match:
        try:
            data = json.loads(match.group(0))
            return data
        except json.JSONDecodeError:
            print("Invalid JSON")
            logger.error(f"Invalid JSON: {match.group(0)}")
            raise ValueError("Invalid JSON data provided.")
    else:
        #print("No JSON Found, while rating")
        raise ValueError("No JSON data found in the provided text.")
    
def extract_json(text):
    text = text.replace("`", "").replace('"', '"').replace('"', '"').replace("'", "'").replace("'", "'")
    #text = text.replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t')
    try:
        data = json.loads(text)
        return data
    except json.JSONDecodeError:
        # If direct parsing fails, try to fix common issues with control characters
        try:
            # Escape control characters within string values
            def escape_string_content(match):
                string_content = match.group(1)
                # Escape control characters
                string_content = string_content.replace('\n', '\\n')
                string_content = string_content.replace('\r', '\\r') 
                string_content = string_content.replace('\t', '\\t')
                string_content = string_content.replace('\b', '\\b')
                string_content = string_content.replace('\f', '\\f')
                return f'"{string_content}"'
            
            # Pattern to match string values (content between quotes, handling escaped quotes)
            pattern = r'"([^"]*(?:\\.[^"]*)*)"'
            fixed_text = re.sub(pattern, escape_string_content, text)
            
            data = json.loads(fixed_text)
            return data
        except json.JSONDecodeError:
            try:
                data = old_extract_json(text)
                return data
            except:
                print("Invalid JSON")
                logger.error(f"Invalid JSON: {text}")
                raise ValueError("Invalid JSON data provided.")

#doesn't work with arrays
#doesn't match keys with dict value because { throws regex search for value off
#extracts lowest level nested structures? if another {", means nested
#doesn't work lists
def extract_broken_json(text):
    print("extracting json: ", text)
    # Remove all backticks from the text
    text = text.replace("`", "").replace('"', '"').replace('"', '"').replace("'", "'").replace("'", "'")
    pattern = r'\"([^\"]+)\":\s*(\"[^\"]*\"|\d+\.\d+|\d+|true|false|null)'
    #matches = re.findall(pattern, text, regex.DOTALL)
    matches = re.findall(pattern, text)
    if matches:
        result_dict = {key: json.loads(value) for key, value in matches}
        return result_dict
    else:
        raise ValueError("No JSON data found in the provided text.")

#probably too inefficient. use extract json
def extract_nested_json(text):
    # Extract a valid nested JSON object from either well-formed, or malformed JSON embedded in text

    def find_opening_char(json_string):
        # Find the first opening brace or bracket
        for i in range(len(json_string)):

            if json_string[i] in '{[':
                return i
        return -1  # In case no brace or bracket is found

    def find_last_nested_char(json_string):
        # Find the last opening or closing brace or bracket
        for i in range(len(json_string) - 1, -1, -1):
            if json_string[i] in '{}[]':
                return i, json_string[i]
        return -1, None  # In case no brace or bracket is found

    def slice_last_valid_pair(json_string):
        # Remove any text following the last valid key-value pair
        pattern = r'"\s*(\w+)"\s*:\s*(null|true|false|\d+(?:\.\d+)?|"[^"]*")\s*'
        matches = list(re.finditer(pattern, json_string))
        if not matches:
            return json_string  # No matches, return as is
        last_match = matches[-1]
        print("last valid: ", last_match)
        return json_string[:last_match.end()]

    def slice_last_valid_array_value(json_string, last_open_bracket_idx):
        # Remove any text following the last valid array value
        value_pattern = r'null|true|false|\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"'

        part_to_search = json_string[last_open_bracket_idx:]
        matches = list(re.finditer(value_pattern, part_to_search))
        if not matches:
            return json_string[:last_open_bracket_idx + 1]
        last_match = matches[-1]
        # Remove everything after the last complete value
        last_match_end = last_open_bracket_idx + last_match.end()
        return json_string[:last_match_end]

    def add_closing_brackets(json_string):
        # add matching closing braces or brackets for each opening bracket
        brackets = {'{': '}', '[': ']'}
        stack = []
        for char in json_string:
            if char in brackets:
                stack.append(brackets[char])
            elif char in brackets.values():
                if stack and stack[-1] == char:
                    stack.pop()
        # Append remaining unmatched closing brackets in reverse order
        return json_string + ''.join(reversed(stack))

    start_idx = find_opening_char(text)
    if start_idx == -1:
        return None  # No valid starting character found
    json_string = text[start_idx:]

    index, last_char = find_last_nested_char(json_string)
    if last_char in ('}', ']'):
        cleaned_json = json_string[:index + 1]
    elif last_char == '{':
        cleaned_json = slice_last_valid_pair(json_string)
    elif last_char == '[':
        cleaned_json = slice_last_valid_array_value(json_string, index)

    return add_closing_brackets(cleaned_json)

def extract_tag_name_id(responder_text):
    match = re.search(r"^(.*?)\s*@@(.*?)@@", responder_text)
    if match:
        name = match.group(1).strip()
        id = match.group(2).strip()
        return name, id
    return responder_text.strip(), None

def extract_id_tag(text):
    if text is None:
        return None
    match = re.search(r"@@(.*?)@@", text)
    if match:
        return match.group(1)
    return None


async def get_ai_response(prompt, max_tokens=None, background=False, provider=None):
    if not background:
        api_key = default_key
        model = default_model
        url = default_url
    else:
        model = background_model
        api_key = background_key
        url = background_url

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        #"prompt": prompt,
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
        #"provider": provider
        "provider": {
            "sort": "latency",
            "ignore": ['groq', 'NovitaAI', 'Chutes']
            #'only': []
        }
    }

    #try:
    response = await http_client.post(url, headers=headers, json=payload)
    content = response["choices"][0]["message"]["content"]
    return content
    '''
    except Exception as e:
        print(f"An error occurred: {e}")
        return None'''

# generate a response using streamed source instead of static request like get_ai_response for latency, possible server handling differences
async def get_streamed_response(message, background=True):
    if not background:
        api_key = default_key
        model = default_model
        url = default_url
    else:
        model = background_model
        api_key = background_key
        url = background_url
        
    paying_user = None
    #use user's api key unless world owner or party creator is covering costs
    """
    if worlds[world]['settings']['cover_costs']:
        cost_providers = worlds[world]['settings']['cost_providers']
        paying_user = random.choice(cost_providers)
    elif room['cost_providers']:
        #make sure to update when user changes settings
        #if multiple users have setting to cover costs choose one at random each time, make sure they are active
        paying_user = room['cost_provider']
    else:
        paying_user = user_id"""

    #api = users[paying_user]['api']

    #model = users[paying_user]['model']
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    '''Could pass conversation history as list of message objects, however current method
    may help add separation to adventure history from being considered as conversation history'''
    '''Won't use name from messaage object unless added to content or processed as part of running conversation_history string as now doing'''
    payload = {
        "model": model,
        "stream": True,
        "messages": [{"role": "user", "content": message}],
        "provider": {
            "sort": "latency",
            "ignore": ['groq', 'NovitaAI', 'Chutes']
        }
    }

    response = await http_client.post_stream(url, headers=headers, json=payload)
    response.raise_for_status()  # This will raise an HTTPError if the HTTP request returned an unsuccessful status code

    ai_response = ""


    try:
        async for chunk in response.content:
            text_chunk = chunk.decode('utf-8')
            # Process each line
            lines = text_chunk.split('\n')
            for line in lines:
                if line.startswith("data:") and not line.endswith("[DONE]"):
                    data_content = line[len("data:"):].strip()
                    try:
                        content = json.loads(data_content)
                        chunk = content["choices"][0]["delta"].get("content", "")
                        ai_response += chunk
                    except json.JSONDecodeError as e:
                        logger.error(f"JSON decoding error: {e}")
                        print(f"JSON decoding error: {e}")
    finally:
        await response.release()
    return ai_response

'''
def ISOString_to_datetime(iso_string):
    """Parse an ISO 8601 UTC string (as sent by JS Date.toISOString()) into a
    timezone-aware datetime for safe comparison."""
    return datetime.fromisoformat(iso_string.replace('Z', '+00:00'))
'''

async def get_response_value(prompt, key, caller, process_list=False, max_tokens=None):
    request_start_time = datetime.now()
    
    #response = await get_ai_response(prompt, max_tokens, background=True, provider="novita/bf16")
    if caller == "chain_of_thought":
        #response = await get_streamed_response(prompt, background=False)
        response = await get_streamed_response(prompt, background=True)
    else:
        response = await get_streamed_response(prompt)
    logging.info(f"[{caller}] request initiated at: {request_start_time}")
    response_received_time = datetime.now()
    logging.info(f"[{caller}] response received at: {response_received_time} (duration: {response_received_time - request_start_time})")

    logging.info(f"{caller} prompt: {prompt}\n")
    logging.info(f"{caller} response: {response}\n")
    """  if process_list:
        response_json = extract_json(response)
    else:
        #looks like having issues with /" dialogue quotes
        response_json = extract_broken_json(response)"""

    response_json = extract_json(response)
    data = response_json[key]

    return data

if __name__ == "__main__":
    #misses location key because value is obj
    print(extract_broken_json('''Example Response 2, route:
    {
        "location_type": "route",
        "location": {"start": "Helms Deep @@k1RAFy9K@@", "destination": "Minis Tirith @@ESJjURrZ@@"},
        "location_details": "The party is traversing rugged terrain and is now on top of a hill with a view of the surrounding area."
    }

    Example Response 3, nearby:'''))

    print(extract_json('''Example Response 2, route:
    {
        "location_type": "route",
        "location": {"start": "Helms Deep @@k1RAFy9K@@", "destination": "Minis Tirith @@ESJjURrZ@@"},
        "location_details": "The party is traversing rugged terrain and is now on top of a hill with a view of the surrounding area."
    }

    Example Response 3, nearby:'''))

    print(extract_json('''Example Response 2, route:
    {
        "location_type": "route",
        "location": {"start": "Helms Deep @@k1RAFy9K@@", "destination": "Minis Tirith @@ESJjURrZ@@"},
        "location_details": ["string", "apple"]
    }

    Example Response 3, nearby:'''))

    '''broke extract_json? ```
    {
      "entry_pair": "waefw HzzNl409: let's go\n\nnarrator: As you follow the small rabbit @@7xu8nCOr@@, it leads you through the dense thicket of bushes @@gHBoxlSl@@, navigating through the underbrush with ease. The rabbit stops occasionally to listen and look around, ensuring that you're not being followed by Emily @@GN1co8j3@@ or the curly haired man @@qTKVu5yI@@. After a few minutes of walking, the rabbit pushes aside a large fern, revealing a narrow, winding path that you hadn't noticed before, and motions for you to follow it. The path begins to slope downward, and you find yourself descending into a wooded valley @@e3BOkzbU@@, the sounds of the meadow @@3eX6jG3W@@ growing fainter with each step. The rabbit glances back at you, its large round eyes shining with a knowing glint, and says, \"We're almost there, just a little farther, and we'll reach the safer area @@OB4qOCit@@.\" Suddenly, the trees around you grow quieter, and you sense that you're being watched, the rabbit's ears perk up, and it freezes, motioning for you to be still."
    }'''

    """
    print(extract_broken_json('''{
        "entry_pair": "waefw HzzNl409: no, it's mine. i mean its emily's but its mine now and I'm keeping it safe until we get to the great oak @@83W7MU8C@@\n\nElara, Qe0tSvuz: I'm not sure I trust you, Elara @@Qe0tSvuz@@, you seem to be hiding something behind your questions, and I don't think I'm ready to hand over Emily's @@GN1co8j3@@ journal just yet. The rabbit @@7xu8nCOr@@ seems to think it's important to get to the great oak @@83W7MU8C@@, and I'm willing to see this through, so I'll have to decline your request to see the journal for now."
    }'''))"""

    print(extract_json('''{
      "summary": "The story began with a hooded figure @@cgJq30oa4@@ in The Silver Tankard @@lE4trOxTn@@, a tavern in Willowbrook @@lAW7zhXU5@@, where the player, a villager from the northern provinces @@lQl6M9B3H@@, found a silver pendant with a dragon emblem and blue runes on the floor. The pendant belonged to Magister Elwin @@cKiernl5Y@@, a Highcastle court mage. As news of the pendant spread, the player was questioned by Dorran @@curgGGQvw@@, the barkeep, and Matilda @@cnAzTXhEO@@, the village's wise woman. The player claimed to be Magister Elwin's @@cKiernl5Y@@ brother, then admitted to killing the Magister, but later revealed they had no memory of these events and were possibly under a magical compulsion. Matilda @@cnAzTXhEO@@ suggested the player was telling the truth but was being manipulated by an enchantment. The village guards arrived, and Matilda @@cnAzTXhEO@@ proposed taking the player to the village circle @@luw3hrczb@@ to understand the nature of the enchantment better.

    At the village circle @@luw3hrczb@@, the pendant reacted to the player's touch and pulsated with a blue glow, indicating its magical properties. Matilda @@cnAzTXhEO@@ interpreted the signs and discovered the pendant was planted for the player to find, and the enchantment was designed to distract the village while the true events unfolded. The player, Matilda @@cnAzTXhEO@@, and the hooded woman @@cgJq30oa4@@, who introduced herself as Sera @@ca7ScbRp7@@, decided to head to the Mistpeak @@luw3hrczb@@ forest edge to investigate Magister Elwin's @@cKiernl5Y@@ disappearance. They prepared for their journey, gathering supplies and information, with Sera @@ca7ScbRp7@@ prepared to track the events that occurred at the forest edge. As they crossed into the forest, they found signs of a confrontation, including defensive magic and a scorched patch of grass. Sera @@ca7ScbRp7@@ examined the area and found blood, footprints, and other evidence of a struggle.

    The pendant led them deeper into the forest, toward the old ruins of a watchtower, where they found more signs of magic and a ritual performed by three hooded figures. The pendant projected an image of Magister Elwin @@cKiernl5Y@@, bound and being held by the figures. Sera @@ca7ScbRp7@@ and Matilda @@cnAzTXhEO@@ believed the figures were powerful magic workers, and that they needed Magister Elwin @@cKiernl5Y@@ for a specific purpose. They decided to follow the trail, which led them toward the mountain caves @@l0msdbC61@@, where they hoped to disrupt the figures' plan and rescue Magister Elwin @@cKiernl5Y@@. The pendant continued to guide them, projecting images and pulsing with blue light, as they journeyed deeper into the mountains.

    As they ascended higher into the mountains, the forest gradually thinned, and ancient trees gave way to scrub and rock. The pendant's light seemed to strengthen with each step toward the mountains, its projected images appearing more frequently now. They found a glass vial, shattered, with a faint luminous residue on the rocks, which Matilda @@cnAzTXhEO@@ identified as essence of moonberry, used to mark magical pathways. The pendant suddenly flared brightly, projecting an image of a specific cave entrance decorated with weathered carvings. They entered the cave, finding evidence of recent disturbances and magical preparations. Sera @@ca7ScbRp7@@ took the lead, navigating the treacherous path and eventually subduing one of the hooded figures, a pale woman with intricate tattoos @@c12T51ADZ@@.

    The pale woman with intricate tattoos @@c12T51ADZ@@ revealed that Magister Elwin @@cKiernl5Y@@ was being used as a conduit to release ancient power sealed beneath Willowbrook @@lAW7zhXU5@@. She explained that the power would transform those who had prepared themselves to receive it, and that the markings on her skin were conduits for this power. The pale woman with intricate tattoos @@c12T51ADZ@@ seemed to take pride in the ritual, believing it would usher in a new age. Sera @@ca7ScbRp7@@ and Matilda @@cnAzTXhEO@@ realized they had to act quickly to stop the ritual and rescue Magister Elwin @@cKiernl5Y@@. The player must now decide how to proceed, with the fate of Magister Elwin @@cKiernl5Y@@ and the village of Willowbrook @@lAW7zhXU5@@ hanging in the balance.

    The current situation finds the player, Sera @@ca7ScbRp7@@, and Matilda @@cnAzTXhEO@@ in the mountain caves @@l0msdbC61@@, having just subdued the pale woman with intricate tattoos @@c12T51ADZ@@. They have learned about the ritual and the true purpose of Magister Elwin's @@cKiernl5Y@@ kidnapping. The player must now choose how to proceed, whether to interrogate the pale woman with intricate tattoos @@c12T51ADZ@@ further, search the cave for more clues, or attempt to stop the ritual and rescue Magister Elwin @@cKiernl5Y@@." 
    }'''))

    print(extract_json('''{
      "summary": "The story began with a hooded figure @@cgJq30oa4@@ in The Silver Tankard @@lE4trOxTn@@, a tavern in Willowbrook @@lAW7zhXU5@@, where the player, a villager from the northern provinces @@lQl6M9B3H@@, found a silver pendant with a dragon emblem and blue runes on the floor. The pendant belonged to Magister Elwin @@cKiernl5Y@@, a Highcastle court mage. As news of the pendant spread, the player was questioned by Dorran @@curgGGQvw@@, the barkeep, and Matilda @@cnAzTXhEO@@, the village's wise woman. The player claimed to be Magister Elwin's @@cKiernl5Y@@ brother, then admitted to killing the Magister, but later revealed they had no memory of these events and were possibly under a magical compulsion. Matilda @@cnAzTXhEO@@ suggested the player was telling the truth but was being manipulated by an enchantment. The village guards arrived, and Matilda @@cnAzTXhEO@@ proposed taking the player to the village circle @@luw3hrczb@@ to understand the nature of the enchantment better.

    At the village circle @@luw3hrczb@@, the pendant reacted to the player's touch and pulsated with a blue glow, indicating its magical properties. Matilda @@cnAzTXhEO@@ interpreted the signs and discovered the pendant was planted for the player to find, and the enchantment was designed to distract the village while the true events unfolded. The player, Matilda @@cnAzTXhEO@@, and the hooded woman @@cgJq30oa4@@, who introduced herself as Sera @@ca7ScbRp7@@, decided to head to the Mistpeak @@luw3hrczb@@ forest edge to investigate Magister Elwin's @@cKiernl5Y@@ disappearance. They prepared for their journey, gathering supplies and information, with Sera @@ca7ScbRp7@@ prepared to track the events that occurred at the forest edge. As they crossed into the forest, they found signs of a confrontation, including defensive magic and a scorched patch of grass. Sera @@ca7ScbRp7@@ examined the area and found blood, footprints, and other evidence of a struggle.

    The pendant led them deeper into the forest, toward the old ruins of a watchtower, where they found more signs of magic and a ritual performed by three hooded figures. The pendant projected an image of Magister Elwin @@cKiernl5Y@@, bound and being held by the figures. Sera @@ca7ScbRp7@@ and Matilda @@cnAzTXhEO@@ believed the figures were powerful magic workers, and that they needed Magister Elwin @@cKiernl5Y@@ for a specific purpose. They decided to follow the trail, which led them toward the mountain caves @@l0msdbC61@@, where they hoped to disrupt the figures' plan and rescue Magister Elwin @@cKiernl5Y@@. The pendant continued to guide them, projecting images and pulsing with blue light, as they journeyed deeper into the mountains.

    As they ascended higher into the mountains, the forest gradually thinned, and ancient trees gave way to scrub and rock. The pendant's light seemed to strengthen with each step toward the mountains, its projected images appearing more frequently now. They found a glass vial, shattered, with a faint luminous residue on the rocks, which Matilda @@cnAzTXhEO@@ identified as essence of moonberry, used to mark magical pathways. The pendant suddenly flared brightly, projecting an image of a specific cave entrance decorated with weathered carvings. They entered the cave, finding evidence of recent disturbances and magical preparations. Sera @@ca7ScbRp7@@ took the lead, navigating the treacherous path and eventually subduing one of the hooded figures, a pale woman with intricate tattoos @@c12T51ADZ@@.

    The pale woman with intricate tattoos @@c12T51ADZ@@ revealed that Magister Elwin @@cKiernl5Y@@ was being used as a conduit to release ancient power sealed beneath Willowbrook @@lAW7zhXU5@@. She explained that the power would transform those who had prepared themselves to receive it, and that the markings on her skin were conduits for this power. The pale woman with intricate tattoos @@c12T51ADZ@@ seemed to take pride in the ritual, believing it would usher in a new age. Sera @@ca7ScbRp7@@ and Matilda @@cnAzTXhEO@@ realized they had to act quickly to stop the ritual and rescue Magister Elwin @@cKiernl5Y@@. The player must now decide how to proceed, with the fate of Magister Elwin @@cKiernl5Y@@ and the village of Willowbrook @@lAW7zhXU5@@ hanging in the balance.

    The current situation finds the player, Sera @@ca7ScbRp7@@, and Matilda @@cnAzTXhEO@@ in the mountain caves @@l0msdbC61@@, having just subdued the pale woman with intricate tattoos @@c12T51ADZ@@. They have learned about the ritual and the true purpose of Magister Elwin's @@cKiernl5Y@@ kidnapping. The player must now choose how to proceed, whether to interrogate the pale woman with intricate tattoos @@c12T51ADZ@@ further, search the cave for more clues, or attempt to stop the ritual and rescue Magister Elwin @@cKiernl5Y@@." 
    }'''))