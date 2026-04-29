import re


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



test_input = '''intro text{
  "user": {
    "name": "John Doe",
    "location": {
      "city": "New York",
      "address": {
        "street": "123 Elm St",
        "zipcode": "10001",
        "geo": {
          "lat": 40.7128,
          "lon": -74.0060
        }
      },
      "office": {
        "building": "Tower A",
        "room": {
          "floor": 25,
          "number": 1098,
          "access": {
            "keycard": true,
            "biometrics": {
              "fingerprint": true,
              "retina": false
            }
          }
        }
      }
    },
    "contacts": [
      {
        "type": "work",
        "email": "john.doe@example.com",
        "phone": "123-456-7890"
      },
      {
        "type": "personal",
        "email": "johndoe@gmail.com",
        "phone": "321-654-0987"
      }
    ],
    "preferences": {
      "language": "English",
      "timezone": "Eastern Standard Time",
      "notifications": {
        "email": true,
        "sms": false,
        "app": {
          "enabled": true,
          "sounds": true,
          "vibration": false
        }
      }
    }
  },
  "settings": {
    "theme": "dark",
    "privacy": {
      "tracking": true,
      "history": {
        "browsing": true,
        "location": false,
        "adPreferences": {
          "personalized": true,
          "categories": [
            "technology",
            "gaming", outro text
'''
fixed_json = extract_and_fix_json(test_input)
print("Fixed JSON:", fixed_json)

test_input = '''Example Response 2, route:
    {
        "location_type": "route",
        "location": {"start": "Helms Deep @@k1RAFy9K@@", "destination": "Minis Tirith @@ESJjURrZ@@"},
        "location_details": "The p'''
fixed_json = extract_and_fix_json(test_input)
print("Fixed JSON:", fixed_json)